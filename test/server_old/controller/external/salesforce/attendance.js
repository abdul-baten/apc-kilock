'use strict';

var should = require('should'),
  app = require('../../../../../server/app'),
  async = require('async'),
  config = require('../../../../../server/config/environment'),
  logger = log4js.getLogger(),
  datetimeutil = require('../../../../../server/utils/datetimeutil'),
  attendance = require('../../../../../server/controllers/external/salesforce/attendance.controller.js'),
  mongoose = require('mongoose'),
  ObjectId = require('mongoose').Types.ObjectId,
  User = mongoose.model('User'),
  AttendanceLog = mongoose.model('AttendanceLog'),
  Timecard = mongoose.model('Timecard');

describe('logic salesforce/attendance.json', function () {

  var YEAR  = 2016;
  var MONTH = 6;
  var DAY   = 2;
  var testUserName = 'testUserA'
  var testUser = null

  var createDate = function (hours, minutes) {
    var date = new Date(YEAR, MONTH - 1, DAY);
    date.setUTCMinutes(minutes);
    date.setUTCHours(date.getUTCHours() + hours);

    return date;
  };

  before(function (done) {
    async.waterfall([
      function (waterfallDone) {
        User.find({name: testUserName}, function(err, user) {
          testUser = user;
          waterfallDone(err, user);
        });
      },
    ], function(err, user){
      async.parallel([
        function (parallelDone) {
          AttendanceLog.remove({user: user._id, year:YEAR, month:MONTH}, parallelDone);
        },
        function (parallelDone) {
          Timecard.remove({user: user._id, year:YEAR, month:MONTH}, parallelDone)
        },
      ], done);
    });
  });

  /**
   * APIへアクセスするためのヘルパー関数
   * @param {Object} sendParameter APIへ送信するパラメータ
   * @param {number} statusCode APIより受け取るステータスコード
   * @param {Function} callback レスポンスの確認を行うコールバック関数
   */
  var apiAccess = function (sendParameter, statusCode, callback) {
    request(app)
      .get('/external/salesforce/attendance.json')
      .set('Accept-Language', 'ja')
      .query(sendParameter)
      .auth('test', 'test')
      .expect(statusCode)
      .end(callback);
  };

  it('出勤 翌日条件なし', function (done) {
    var sendParameter = {
      year        : YEAR,
      month       : MONTH,
      employeeCode: testUser.employeeCode,
    }

    apiAccess(sendParameter, 200, function (err, res) {
      if (err) {
        done(err);
      }
      console.log(res)

    });

  });

});
