/**
 * @fileOverview 打刻時間重複をチェックし、重複している打刻時間を修正する日次バッチ。
 */
process.env.NODE_ENV = 'development';
var mongoose  = require('mongoose');
var moment    = require('moment');
var async     = require('async');
global.log4js = require('log4js');
var logger    = log4js.getLogger();
var config    = require('../config/environment');
var path      = require('path');
var fs        = require('fs');
var _         = require('lodash');

//現在時間を取得
var now = moment();
var year = now.year();
var month = now.month() + 1;
var day = now.date(); //当日

mongoose.connect(config.mongo.uri, config.mongo.options);

// Bootstrap models
var modelsPath = path.join(__dirname + '/../', 'models');
fs.readdirSync(modelsPath).forEach(function (file) {
  if (/(.*)\.(js$|coffee$)/.test(file)) {
    require(modelsPath + '/' + file);
  }
});
var Timecard = mongoose.model('Timecard');
var AttendanceLog = mongoose.model('AttendanceLog');
var User = mongoose.model('User');

/*
 * 重複Timecardリストアップ処理
 * @param : targetObjArray 重複チェック対象
 */
var getDupplicateRemoveList = function (targetObjArray) {
  const DOCUMENT_COUNT_ONE = 1;
  var results = [];
  var userMultiTimecardArray = [];

  //当日分において、TimeCardが複数存在しているUserをピックアップする。
  var counts = {};
  _.forEach(targetObjArray, function(obj) {
    if (counts[obj.user] === undefined) {
      counts[obj.user] = DOCUMENT_COUNT_ONE;
    } else {
      counts[obj.user] += DOCUMENT_COUNT_ONE;
    }
  });

  var inDateTmp = null;
  var outDateTmp = null;
  var archiveInADateArray = [];
  var archiveOutADateArray = [];
  var archiveInEDateArray = [];
  var archiveOutEDateArray = [];

  //ID, タイムスタンプを取得し、Date型へ変換
  var oneDayPickTimecardsArray = _.map(targetObjArray, function(o) {
    return {
      'id': o._id,
      'user': o.user,
      'year': o.year,
      'month': o.month,
      'day': o.day,
      'comment': o.reasonOfEditing,
      'inATime': new Date(o.actualInTimestamp),
      'outATime': new Date(o.actualOutTimestamp),
      'inETime': new Date(o.editedInTimestamp),
      'outETime': new Date(o.editedOutTimestamp)};
  });
  //年月日時分を取得し、その他のタイムカードの時間と比較する。
  _.forEach(oneDayPickTimecardsArray, function(oneTimeObj){
    const DUPPLICATE_EXIST = 'DUPPLICATE_EXIST';
    const DUPPLICATE_NOT_EXIST = 'DUPPLICATE_NOT_EXIST';

    //打刻用フラグ
    var inADateFlg = DUPPLICATE_NOT_EXIST;
    var outADateFlg = DUPPLICATE_NOT_EXIST;

    //手入力用フラグ
    var inEDateFlg = DUPPLICATE_NOT_EXIST;
    var outEDateFlg = DUPPLICATE_NOT_EXIST;

    var inADateTmp = [
      oneTimeObj.user,
      oneTimeObj.inATime.getFullYear(),
      ('0' + (oneTimeObj.inATime.getMonth() + 1)).slice(-2),
      ('0' + oneTimeObj.inATime.getDate()).slice(-2),
      ('0' + oneTimeObj.inATime.getHours()).slice(-2),
      ('0' + oneTimeObj.inATime.getMinutes()).slice(-2)
    ].join('');
    var outADateTmp = [
      oneTimeObj.user,
      oneTimeObj.outATime.getFullYear(),
      ('0' + (oneTimeObj.outATime.getMonth() + 1)).slice(-2),
      ('0' + oneTimeObj.outATime.getDate()).slice(-2),
      ('0' + oneTimeObj.outATime.getHours()).slice(-2),
      ('0' + oneTimeObj.outATime.getMinutes()).slice(-2)
    ].join('');
    var inEDateTmp = [
      oneTimeObj.user,
      oneTimeObj.inETime.getFullYear(),
      ('0' + (oneTimeObj.inETime.getMonth() + 1)).slice(-2),
      ('0' + oneTimeObj.inETime.getDate()).slice(-2),
      ('0' + oneTimeObj.inETime.getHours()).slice(-2),
      ('0' + oneTimeObj.inETime.getMinutes()).slice(-2)
    ].join('');
    var outEDateTmp = [
      oneTimeObj.user,
      oneTimeObj.outETime.getFullYear(),
      ('0' + (oneTimeObj.outETime.getMonth() + 1)).slice(-2),
      ('0' + oneTimeObj.outETime.getDate()).slice(-2),
      ('0' + oneTimeObj.outETime.getHours()).slice(-2),
      ('0' + oneTimeObj.outETime.getMinutes()).slice(-2)
    ].join('');

    //打刻開始時間の重複確認
    _.forEach(archiveInADateArray, function(inDate){
      inADateTmp === inDate ? inADateFlg = DUPPLICATE_EXIST : inADateFlg = DUPPLICATE_NOT_EXIST;
    });
    //打刻終了時間の重複確認
    _.forEach(archiveOutADateArray, function(outDate){
      outADateTmp === outDate ? outADateFlg = DUPPLICATE_EXIST : outADateFlg = DUPPLICATE_NOT_EXIST;
    });
    //手入力開始時間の重複確認
    _.forEach(archiveInEDateArray, function(inDate){
      inEDateTmp === inDate ? inEDateFlg = DUPPLICATE_EXIST : inEDateFlg = DUPPLICATE_NOT_EXIST;
    });
    //手入力終了時間の重複確認
    _.forEach(archiveOutEDateArray, function(outDate){
      outEDateTmp === outDate ? outEDateFlg = DUPPLICATE_EXIST : outEDateFlg = DUPPLICATE_NOT_EXIST;
    });
    //開始・終了時間を格納。
    archiveInADateArray.push(inADateTmp);
    archiveOutADateArray.push(outADateTmp);
    archiveInEDateArray.push(inEDateTmp);
    archiveOutEDateArray.push(outEDateTmp);

    //重複が確認された場合は、対象のタイムカードを格納
    if((inADateFlg === DUPPLICATE_EXIST && outADateFlg === DUPPLICATE_EXIST)
    && (inEDateFlg === DUPPLICATE_EXIST && outEDateFlg === DUPPLICATE_EXIST)) {
      results.push({
        'id' : oneTimeObj.id,
        'user' : oneTimeObj.user,
        'year' : oneTimeObj.year,
        'month' : oneTimeObj.month,
        'day' : oneTimeObj.day,
        'reasonOfEditing' : oneTimeObj.reasonOfEditing
      });
      logger.debug(results);
    }
  });
  return results;
}

//打刻時間重複チェック処理開始
async.waterfall([
  function(callback) {
    logger.info(year + ' ' + month + ' ' + day);
    User.find({
       enabled : true
    },
    function(err, user) {
      if (err) {
        logger.info("user not find");
        logger.error(err);
        mongoose.disconnect();
        process.exit();
      }
      if (user.length <= 0) {
        logger.info('target user not exists.');
        mongoose.disconnect();
        process.exit();
      }
      Timecard.find({
        user  : {$in : _.map(user, function(o){　return o._id })},
        year  : year,
        month : month,
        day   : day
      },
      function(err, timecard) {
        if (timecard === null && timecard === undefined) {
          logger.info('target timecard not exists.');
          mongoose.disconnect();
          process.exit();
        }
        callback(null, timecard);
      });
    });
  },
  function(timecard, callback) {
    var removeList = getDupplicateRemoveList(timecard);
    Timecard.remove({
       '_id' : {$in : _.map(removeList, function(o){ return o.id })}
    }, function(err) {
      if (err) {
        logger.error("timecard remove error.");
        mongoose.disconnect();
        process.exit();
      }
      callback(null, removeList);
    });
  },
  function(removeList, callback) {
    logger.info("dupplicateUpdate START!!");
    AttendanceLog.find({
      'user' : {$in : _.map(removeList, function(o){ return o.user })},
      'year' : year,
      'month' : month,
      'day'   : day
    }, function(err, attendanceLogArray) {
      callback(null, removeList, attendanceLogArray);
    });
  }],
  function(err, removeList, attendanceLogArray){
    var attendanceArray = [];
    _.forEach(removeList, function(r) {
      _.forEach(attendanceLogArray, function(a) {
        if(String(r.user) === String(a.user)) {
          attendanceArray.push(a);
        }
      });
    });
    if (attendanceArray.length === 0) {
      logger.info("dupplicateUpdate 0件");
      logger.info("dupplicateUpdate END!!");
      mongoose.disconnect();
      process.exit();
    } else {
      const MS = "※システムチェック：詳細画面にて打刻時間の2重登録がありましたので削除しました。";
      _.forEach(attendanceArray, function(attendance) {
        AttendanceLog.update(
          {'_id' : attendance.id},
          {$set : {
            reasonOfEditing : attendance['reasonOfEditing'] !== undefined && attendance['reasonOfEditing'] !== null ? attendance['reasonOfEditing'] + ' ' + MS : MS
          }},
          { upsert : true },
          function(err){
            if(err){
              mongoose.disconnect();
              process.exit();
            }
            logger.info("dupplicateUpdate END!!");
        });
      });
      mongoose.disconnect();
      process.exit();
    }
  });
