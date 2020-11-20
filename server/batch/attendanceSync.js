/**
 * @fileOverview timecardsとattendanceLogsの打刻時間がずれていた場合にattendancelogsを修正するバッチ。
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

var getDiffTimecardsArray = function (timecards, attendanceLog) {
  var diffTimecards = {};
  var diffAttendanceLog = {};
  const EXIST_DIFF = 'exist_diff_time';
  const NOT_EXIST_DIFF = 'not_exist_diff_time';

  //timecardの合計時間を求める。
  _.forEach(timecards, function(obj) {
    var actualInTimestampObjDate = new Date(obj.actualInTimestamp);
    var editedInTimestampObjDate = new Date(obj.editedInTimestamp);
    var actualOutTimestampObjDate = new Date(obj.actualOutTimestamp);
    var editedOutTimestampObjDate = new Date(obj.editedOutTimestamp);

    var actualDiff = actualOutTimestampObjDate.getTime() - actualInTimestampObjDate.getTime();
    var editedDiff = editedOutTimestampObjDate.getTime() - editedInTimestampObjDate.getTime();

    if(diffTimecards[obj.user] === undefined) {
      diffTimecards[obj.user] = {
        'actualDiff' : actualDiff,
        'editedDiff' : editedDiff
      };
    } else {
      diffTimecards[obj.user]['actualDiff'] += actualDiff;
      diffTimecards[obj.user]['editedDiff'] += editedDiff;
    }
  });

  //attendanceLogの合計時間を求める。
  _.forEach(attendanceLog, function(obj) {
    var inTimestampObjDate = new Date(obj.inTimestamp);
    var autoInTimestampObjDate = new Date(obj.autoInTimestamp);
    var outTimestampObjDate = new Date(obj.outTimestamp);
    var autoOutTimestampObjDate = new Date(obj.autoOutTimestamp);

    var diff = outTimestampObjDate.getTime() - inTimestampObjDate.getTime();
    var autoDiff = autoOutTimestampObjDate.getTime() - autoInTimestampObjDate.getTime();

    if(diffAttendanceLog[obj.user] === undefined) {
      diffAttendanceLog[obj.user] = {
        'id' : obj._id,
        'diff' : diff,
        'autoDiff' : autoDiff
      };
    } else {
      diffAttendanceLog[obj.user]['actualDiff'] += actualDiff;
      diffAttendanceLog[obj.user]['editedDiff'] += editedDiff;
    }
  });

  var diffAttendanceLogArray = [];
  _.forEach(diffAttendanceLog, function(v, k){
    //打刻の差分確認
    if(diffTimecards[k] !== undefined && diffTimecards[k]['actualDiff'] !== v['autoDiff']) {
      diffAttendanceLogArray.push(v);
    }
    //手動打刻の差分確認
    if(diffTimecards[k] !== undefined && diffTimecards[k]['editedDiff'] !== v['diff']) {
      diffAttendanceLogArray.push(v);
    }
  });
  return diffAttendanceLogArray;
}

async.waterfall([
  function(callback) {
    logger.info(year + ' ' + month + ' ' + day);
    User.find({
       enabled : true
    },
    function(err, user) {
      if (err) {
        logger.error("user not find");
        logger.error(err);
        mongoose.disconnect();
        process.exit();
      }
      if (user.length <= 0) {
        logger.info('target user not exists.');
        mongoose.disconnect();
        process.exit();
      }
      callback(null, user);
    });
  },
  function(user, callback) {
    Timecard.find({
      'user'  : {$in : _.map(user, function(o){ return o._id })},
      'year'  : year,
      'month' : month,
      'day'   : day
    }, function(err, timecard) {
      if (timecard === null || timecard.length === 0) {
        logger.info("timecard not exists.");
        mongoose.disconnect();
        process.exit();
      }
      callback(null, timecard, user);
    });
  },
  function(timecard, user, callback) {
    AttendanceLog.find({
      'user'  : {$in : _.map(user, function(o){ return o._id })},
      'year'  : year,
      'month' : month,
      'day'   : day
    }, function(err, attendanceLog) {
      if (err) {
        logger.error("attendanceLog find error.");
        callback(err);
        return;
      }
      var diffTimecardsArray = getDiffTimecardsArray(timecard, attendanceLog);
      callback(null, attendanceLog, diffTimecardsArray);
    });
  }],
  function(err, attendanceLog, diffTimecardsArray) {
    if(diffTimecardsArray.length === 0) {
      logger.info("timecards not diff.");
      mongoose.disconnect();
      process.exit();
    } else {
      const MS = "※自動追記：日毎打刻の時間が詳細打刻の合計時間とずれているため、ご確認ください。";
      //日毎打刻・詳細打刻の合計時間がずれている行に備考欄追記。
      _.forEach(diffTimecardsArray, function(diffTimecard) {
        var findedAttendanceLog = _.find(attendanceLog, { _id : diffTimecard.id });
        AttendanceLog.update(
          {'_id' : diffTimecard.id},
          {$set : {
            reasonOfEditing : findedAttendanceLog['reasonOfEditing'] !== undefined && findedAttendanceLog['reasonOfEditing'] !== null ? findedAttendanceLog['reasonOfEditing'] + ' ' + MS : MS
          }},
          { upsert : true },
          function(err){
            if(err){
              logger.error("attendanceLog sync logic update error.");
              logger.error(err);
              mongoose.disconnect();
              process.exit();
            }
          });
      });
      mongoose.disconnect();
      process.exit();
    }
  });
