'use strict';

var should = require('should'),
  app = require('../../../server/app'),
  mongoose = require('mongoose'),
  async = require('async'),
  testdata = require('../../utils/testdata'),
  logger = log4js.getLogger(),
  ObjectId = require('mongoose').Types.ObjectId,
  AttendanceLog = mongoose.model('AttendanceLog');

describe('model AttendanceLog', function () {

  before(function (done) {
    testdata.truncate();
    done();
  });

  describe('methods check', function () {
    it('method equalsInTimestamps確認(正常:戻り値がtrue)', function (done) {
      var date = new Date();
      var attendanceLog = new AttendanceLog({inTimestamp: date, autoInTimestamp: date});

      attendanceLog.equalsInTimestamps().should.be.exactly(true);
      done();
    });
    it('method equalsInTimestamps確認(正常:戻り値がfalse)', function (done) {
      var date = new Date();
      var date2 = new Date();
      date2.setHours(date2.getHours + 1);
      var attendanceLog = new AttendanceLog({inTimestamp: date, autoInTimestamp: date2});

      attendanceLog.equalsInTimestamps().should.be.exactly(false);
      done();
    });

    it('method getRestHours確認(正常:restHoursが存在する)', function (done) {
      var attendanceLog = new AttendanceLog({restHours: new Date(1980, 0, 1, 2, 0, 0)});

      attendanceLog.getRestHours().toString().should.be.exactly(new Date(1980, 0, 1, 2, 0, 0).toString());
      done();
    });

    it('method getRestHours確認(正常:restHoursが存在しない)', function (done) {
      var attendanceLog = new AttendanceLog({});

      attendanceLog.getRestHours().toString().should.be.exactly(new Date(1980, 0, 1, 1, 0, 0).toString());
      done();
    });

  });

});

