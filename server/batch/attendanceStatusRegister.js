/**
 * @fileOverview 月初に全ユーザーの勤務表状態の初期データを作成する
 */
process.env.NODE_ENV = 'production';
var mongoose = require('mongoose');
var moment = require('moment');
var async = require('async');
global.log4js = require('log4js');
var logger = log4js.getLogger();
var config = require('../config/environment');
var commander = require('commander');
var path = require('path');
var fs = require('fs');

var now = moment();
var year = now.year();
var month = now.month() + 1;

commander
  .option('-m --monthly', 'run this batch when first day of month.')
  .arguments('[year] [month]')
  .action(function (argYear, argMonth) {

    year = argYear;
    month = argMonth;

    if (typeof month === 'undefined') {
      console.log('対象月の指定がありません');
      process.exit();
    }

    var YEAR_REGEX = /^[0-9]{4}$/;
    if (year) {
      if (!year.match(YEAR_REGEX)) {
        console.log('年のフォーマットが不正です');
        process.exit();
      }
    }

    var MONTH_REGEX = /^([0]?[1-9]|1[0-2])$/;
    if (month) {
      if (!month.match(MONTH_REGEX)) {
        console.log('月のフォーマットが不正です');
        process.exit();
      }
    }
  });
commander.parse(process.argv);

// 毎月1日のみ実行
if (commander.monthly) {
  if (now.date() != 1) {
    console.log('1日でないため終了します');
    process.exit();
  }
}

mongoose.connect(config.mongo.uri, config.mongo.options);

// Bootstrap models
var modelsPath = path.join(__dirname + '/../', 'models');
fs.readdirSync(modelsPath).forEach(function (file) {
  if (/(.*)\.(js$|coffee$)/.test(file)) {
    require(modelsPath + '/' + file);
  }
});
var Personnel = mongoose.model('Personnel');
var AttendanceStatus = mongoose.model('AttendanceStatus');

async.waterfall([
  function (callback) {
    Personnel.find({
      $and: [{
          user: {
            $ne: null
          }
        },
        {
          valid: true
        },
      ],
    }, callback);
  },
], function (err, personnels) {
  if (err) {
    logger.error(err);
    mongoose.disconnect();
    process.exit();
  }
  if (personnels.length <= 0) {
    logger.info('target user not exists.');
    mongoose.disconnect();
    process.exit();
  }
  async.each(personnels, function (personnel, callback) {
    AttendanceStatus.findOne({
      user: personnel.user,
      year: year,
      month: month,
    }, function (err, attendanceStatus) {
      if (attendanceStatus == null) {
        attendanceStatus = new AttendanceStatus({
          user: personnel.user,
          personnel: personnel._id,
          year: year,
          month: month,
          status: config.attendanceStatuses['no_application'],
        });
        attendanceStatus.save(callback);

      } else {
        callback();
      }
    });
  }, function (err) {
    if (err) {
      logger.error(err);
    }
    mongoose.disconnect();
    process.exit();
  });
});
