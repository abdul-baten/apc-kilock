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
var AttendanceType = mongoose.model('AttendanceType');
var User = mongoose.model('User');

//打刻時間差異チェック処理開始
async.waterfall([
  function(callback) {
    logger.info(year + ' ' + month + ' ' + day);
    User.find({
       enabled : true
    },
    function(err, user) {
      if (err) {
        logger.info("user find error.");
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
    AttendanceLog.find({
      'user'  : {$in : _.map(user, function(o){ return o._id })},
      'year'  : year,
      'month' : month,
      'day'   : day
    }, function(err, attendanceLog) {
      if (err) {
        logger.error("attendanceLog find error.");
        callback(err);
        mongoose.disconnect();
        process.exit();
      }
      callback(null, attendanceLog);
    });
  },
  function(attendanceLog, callback) {
    AttendanceType.findOne({
      name : '欠勤'
    }, function(err, attendanceType) {
      callback(null, attendanceLog, attendanceType);
    });
  }],
  function(err, attendanceLog, attendanceType) {
    const MS = "※システムチェック：勤怠区分が空白です。ご確認・修正願います。";
    _.forEach(attendanceLog, function(obj){
      if(obj.attendanceType === undefined || obj.attendanceType === null || obj.attendanceType === ''){
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
              mongoose.disconnect();
              process.exit();
            }
          });
      }
    });
    mongoose.disconnect();
    process.exit();
  });
