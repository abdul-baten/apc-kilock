'use strict';

var  _ = require('lodash');
var async = require('async');
var config = require('../config/environment');
var logger = log4js.getLogger();
var mongoose = require('mongoose');
var datetimeutil = require('../utils/datetimeutil');
var User = mongoose.model('User');
var AttendanceType = mongoose.model('AttendanceType');
var Timecard = mongoose.model('Timecard');
var AttendanceLog = mongoose.model('AttendanceLog');
var AttendanceStatus = mongoose.model('AttendanceStatus');

/*
 * 重複Timecardリストアップロジック
 */
var getDupplicateRemoveList = function (targetObjArray) {
  const DOCUMENT_COUNT_ONE = 1;
  var results = [];
  var multiTimesDayArray = [];

  //当月分において、TimeCardが複数存在しているデータを日毎にカウントする。
  var counts = {};
  _.forEach(targetObjArray, function(obj) {
    if (obj.day !== undefined && counts[obj.day] === undefined) {
      counts[obj.day] = DOCUMENT_COUNT_ONE;
    } else {
      counts[obj.day] += DOCUMENT_COUNT_ONE;
    }
  });

  //タイムカードが複数存在する日付のみピックアップする。
  _.forEach(counts, function(v, k) {
    if (v > 1) {
      multiTimesDayArray.push(k);
    }
  });

  //日毎に重複処理を行う
  _.forEach(multiTimesDayArray, function(v) {
    var inDateTmp = null;
    var outDateTmp = null;
    var archiveInADateArray = [];
    var archiveOutADateArray = [];
    var archiveInEDateArray = [];
    var archiveOutEDateArray = [];

    //タイムカードを1日分に絞り込む
    var OneDayTimecardsArray = _.filter(targetObjArray, function(timecardObj) {
      return parseInt(timecardObj.day) === parseInt(v);
    });
    //ID, タイムスタンプを取得し、Date型へ変換
    var OneDayPickTimecardsArray = _.map(OneDayTimecardsArray, function(o){
      return {
        'id': o._id,
        'user': o.user,
        'year': o.year,
        'month': o.month,
        'day': o.day,
        'comment': o.reasonOfEditing,
        'inATime': new Date(datetimeutil.roundUp(o.actualInTimestamp, config.roundMinutes)),
        'outATime': new Date(datetimeutil.roundDown(o.actualOutTimestamp ? o.actualOutTimestamp : o.actualInTimestamp , config.roundMinutes)),
        'inETime': new Date(datetimeutil.roundUp(o.editedInTimestamp, config.roundMinutes)),
        'outETime': new Date(datetimeutil.roundDown(o.editedOutTimestamp ? o.editedOutTimestamp : o.editedInTimestamp , config.roundMinutes))
      };
    });
    //年月日時分を取得し、その他のタイムカードの時間と比較する。
    _.forEach(OneDayPickTimecardsArray, function(oneTimeObj){
      const DUPPLICATE_EXIST = 'DUPPLICATE_EXIST';
      const DUPPLICATE_NOT_EXIST = 'DUPPLICATE_NOT_EXIST';

      //打刻用フラグ
      var inADateFlg = DUPPLICATE_NOT_EXIST;
      var outADateFlg = DUPPLICATE_NOT_EXIST;

      //手入力用フラグ
      var inEDateFlg = DUPPLICATE_NOT_EXIST;
      var outEDateFlg = DUPPLICATE_NOT_EXIST;

      var inADateTmp = [
        oneTimeObj.inATime.getFullYear(),
        ('0' + (oneTimeObj.inATime.getMonth() + 1)).slice(-2),
        ('0' + oneTimeObj.inATime.getDate()).slice(-2),
        ('0' + oneTimeObj.inATime.getHours()).slice(-2),
        ('0' + oneTimeObj.inATime.getMinutes()).slice(-2)
      ].join('');
      var outADateTmp = [
        oneTimeObj.outATime.getFullYear(),
        ('0' + (oneTimeObj.outATime.getMonth() + 1)).slice(-2),
        ('0' + oneTimeObj.outATime.getDate()).slice(-2),
        ('0' + oneTimeObj.outATime.getHours()).slice(-2),
        ('0' + oneTimeObj.outATime.getMinutes()).slice(-2)
      ].join('');
      var inEDateTmp = [
        oneTimeObj.inETime.getFullYear(),
        ('0' + (oneTimeObj.inETime.getMonth() + 1)).slice(-2),
        ('0' + oneTimeObj.inETime.getDate()).slice(-2),
        ('0' + oneTimeObj.inETime.getHours()).slice(-2),
        ('0' + oneTimeObj.inETime.getMinutes()).slice(-2)
      ].join('');
      var outEDateTmp = [
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
      && (inEDateFlg === DUPPLICATE_EXIST && outEDateFlg === DUPPLICATE_EXIST)){
        results.push({
          'id' : oneTimeObj.id,
          'user' : oneTimeObj.user,
          'year' : oneTimeObj.year,
          'month' : oneTimeObj.month,
          'day' : oneTimeObj.day,
          'comment' : oneTimeObj.reasonOfEditing
        });
      }
    });
  });
  return results;
}

//「勤務報告書提出」ボタン押下後のみValidator処理を実行する。
var tempValidator = function (attendanceAction, user, year, month, req, res, call) {
  logger.info("attendanceAction:" + attendanceAction);
  var results = {
    'attendanceTypeCount' : 0,
    'dupplicateCount' : 0
  };
  async.waterfall([
    function(callback) {
      Timecard.find({
        'user'  : String(user),
        'year'  : year,
        'month' : month
      }, function(err, timecard) {
        if (err || timecard === null || timecard === ' ') {
          logger.error("timecard find error.");
          callback(err);
        }
        callback(null, timecard);
      });
    },
    function(timecard, callback) {
      // Timecard重複チェック
      var removeList = getDupplicateRemoveList(timecard);
      Timecard.remove({
         '_id' : {$in : _.map(removeList, function(o){ return o.id })}
      }, function(err) {
        if (err) {
          logger.error("timecard remove error.");
          callback(err);
        }
        callback(null, removeList, timecard);
      });
    },
    function(removeList, timecard, callback) {
      AttendanceLog.find({
        'user' : user,
        'year' : year,
        'month' : month,
      }, function(err, attendanceLog) {
        if (err){
          logger.info("attendanceLog find error.");
          callback(err);
        }
        callback(null, removeList, attendanceLog);
      });
    },
    function(removeList, attendanceLog, callback) {
      AttendanceType.findOne({
        name : '出勤'
      }, function(err, attendanceType) {
        logger.info("attendanceType not diff.");
        callback(null, removeList, attendanceLog, attendanceType);
      });
    },
    function(removeList, attendanceLog, attendanceType ,callback) {
      const MS = "※システムチェック：勤怠区分が空白です。ご確認・修正願います。";
      _.forEach(attendanceLog, function(obj){
        if(obj.attendanceType === undefined || obj.attendanceType === null || obj.attendanceType === ''){
          results['attendanceTypeCount'] += 1;
          AttendanceLog.update(
            {'_id' : obj._id},
            {
              $set : {
                reasonOfEditing : obj['reasonOfEditing'] !== undefined && obj['reasonOfEditing'] !== null ? obj['reasonOfEditing'] + ' ' + MS : MS,
                attendanceType : attendanceType['_id']
              }
            },
            { upsert : true },
            function(err){
              if(err){
                logger.error("attendanceType undefined logic update error.");
                logger.error(err);
              }
            });
        }
      });
      callback(null, removeList, attendanceLog);
    }],
    function (err, removeList, attendanceLog) {
      var attendanceArray = [];
      _.forEach(removeList, function(r) {
        _.forEach(attendanceLog, function(a) {
          if(r.month === a.month && r.day === a.day) {
            attendanceArray.push({
              id : a._id,
              reasonOfEditing : a.reasonOfEditing
            });
          }
        });
      });
      if (attendanceArray.length === 0) {
        logger.info("dupplicate check logic attendance length zero.");
      } else {
        const MS = "※システムチェック：詳細画面にて打刻時間の2重登録がありましたので削除しました。";
        _.forEach(attendanceArray, function(attendance) {
          results['dupplicateCount'] += 1;
          AttendanceLog.update(
            {'_id' : attendance.id},
            {$set : {
              reasonOfEditing : attendance['reasonOfEditing'] !== undefined && attendance['reasonOfEditing'] !== null ? attendance['reasonOfEditing'] + ' ' + MS : MS
            }},
            { upsert : true },
            function(err){
              if(err) {
                logger.error("dupplicate check logic comment writing error.");
                logger.error(err);
              }
          });
        });
      }
      call(req, res, results);
  });
}

module.exports = {
  tempValidator : tempValidator
};
