'use strict';

var should = require('should'),
  app = require('../../../../server/app'),
  mongoose = require('mongoose'),
  async = require('async'),
  testdata = require('../../../utils/testdata'),
  config = require('../../../../server/config/environment'),
  logger = log4js.getLogger(),
  ObjectId = require('mongoose').Types.ObjectId,
  middlewareLogic = require('../../../../server/logics/models/passHistory.mw.js'),
  datetimeutil = require('../../../../server/utils/datetimeutil'),
  PassHistory = mongoose.model('PassHistory'),
  User = mongoose.model('User'),
  AttendanceLog = mongoose.model('AttendanceLog'),
  AttendanceInCut = mongoose.model('AttendanceInCut');

describe('logic passHistory.mw', function () {

  var testuser;
  var testuser2;
  var testuser3;
  var testuser4;
  var YEAR = 2015;
  var MONTH = 3;
  var DAY = 23;
  var USER_ID = 1;
  var USER_ID2 = 2;
  var USER_ID3 = 3;
  var USER_ID4 = 4;

  var createDate = function (hours, minutes) {
    var date = new Date(YEAR, MONTH - 1, DAY);
    date.setUTCMinutes(minutes);
    date.setUTCHours(date.getUTCHours() + hours);

    return date;
  };

  var createPassHistory = function (user, hours, minutes) {
    var date = createDate(hours, minutes);

    var passHistory = new PassHistory({
      type: 'unknown',
      result: 'allow',
      openEvent: 'unknown',
      timestamp: date,
      user: user,
      userId: user.id
    });

    return passHistory;
  };

  var checkTimestamp = function (date, hours, minutes) {
    var actualDate = createDate(hours, minutes);
    logger.debug(date);
    logger.debug(actualDate);

    date.getHours().should.be.exactly(actualDate.getHours());
    date.getMinutes().should.be.exactly(actualDate.getMinutes());
  };

  var checkDate = function (attendanceLog) {
    var actual = datetimeutil.workdate(attendanceLog.autoInTimestamp);
    logger.debug(attendanceLog);
    logger.debug(actual);

    attendanceLog.year.should.be.exactly(actual.year);
    attendanceLog.month.should.be.exactly(actual.month);
    attendanceLog.day.should.be.exactly(actual.day);
  };

  before(function (done) {
    var createUser = function (id, name, login, mail) {
      var user = new User({
        id: id,
        name: name,
        login: login,
        enabled: false,
        extensionPhoneNumber: 200,
        devices: [],
        nfcs: [],
        sourcename: 'local',
        sourcetype: 'local',
        source: { type: 'local' },
        mail: mail
      });

      return user;
    };

    testdata.truncate(function () {
      var user1 = createUser(USER_ID, "testuser1", "testuser1", "testuser1@ap-com.co.jp");
      var user2 = createUser(USER_ID2, "testuser2", "testuser2", "testuser2@ap-com.co.jp");
      var user3 = createUser(USER_ID3, "testuser3", "testuser3", "testuser3@ap-com.co.jp");
      var user4 = createUser(USER_ID4, "testuser4", "testuser4", "testuser4@ap-com.co.jp");

      async.parallel([
          function (parallelDone) {
            user1.save(function (err, user) {
              if (err) {
                parallelDone(err);
              } else {
                testuser = user;
                parallelDone();
              }
            });
          },
          function (parallelDone) {
            user2.save(function (err, user) {
              if (err) {
                parallelDone(err);
              } else {
                testuser2 = user;

                var attendanceLog = new AttendanceLog({
                  userId: testuser2.id,
                  user: testuser2,
                  year: YEAR,
                  month: MONTH,
                  day: DAY,
                  inTimestamp: createDate(11, 0),
                  outTimestamp: createDate(17, 0),
                  autoInTimestamp: createDate(11, 15),
                  autoOutTimestamp: createDate(17, 30),
                  endTimestamp: createDate(17, 30)
                });
                attendanceLog.save(function (err) {
                  if (err) {
                    parallelDone(err);
                  }
                  parallelDone();
                });
              }
            })
          },
          function (parallelDone) {
            user3.save(function (err, user) {
              if (err) {
                parallelDone(err);
              } else {
                testuser3 = user;

                var attendanceLog = new AttendanceLog({
                  userId: testuser3.id,
                  user: testuser3,
                  year: YEAR,
                  month: MONTH,
                  day: DAY,
                  inTimestamp: createDate(11, 0),
                  outTimestamp: createDate(17, 0),
                  autoInTimestamp: createDate(11, 0),
                  autoOutTimestamp: createDate(17, 30),
                  endTimestamp: createDate(17, 30)
                });

                var attendanceInCut = new AttendanceInCut({
                  user: testuser3,
                  inTime: '10:00'
                });

                async.parallel([
                    function (parallelDone2) {
                      attendanceLog.save(parallelDone2);
                    },
                    function (parallelDone2) {
                      attendanceInCut.save(parallelDone2);
                    }
                  ],
                  function (err) {
                    if (err) {
                      parallelDone(err);
                    }
                    parallelDone();
                  });
              }
            });
          },
          function (parallelDone) {
            user4.save(function (err, user) {
              if (err) {
                parallelDone(err);
              } else {
                testuser4 = user;
                var attendanceInCut = new AttendanceInCut({
                  user: testuser4,
                  inTime: '10:00'
                });

                attendanceInCut.save(function (err) {
                  if (err) {
                    parallelDone(err);
                  }
                  parallelDone();
                });
              }
            });
          }
        ],
        function (err) {
          if (err) {
            done(err);
          } else {
            done();
          }
        })
    });
  });


  it('testuser AttendanceLog create(正常)', function (done) {
    var hours = 10;
    var minutes = 15;
    var passHistory = createPassHistory(testuser, hours, minutes);

    middlewareLogic.saveAttendanceLogOnce(passHistory, function (err, attendanceLog) {
      should.not.exist(err);
      should.exist(attendanceLog);

      checkTimestamp(attendanceLog.autoInTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.autoOutTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.inTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.outTimestamp, hours, minutes);
      checkDate(attendanceLog, YEAR, MONTH, DAY);
      attendanceLog.userId.should.be.exactly(USER_ID);

      done();
    });
  });

  it('testuser AttendanceLog update1(正常)', function (done) {
    var hours = 10;
    var minutes = 30;
    var passHistory = createPassHistory(testuser, hours, minutes);

    middlewareLogic.saveAttendanceLogOnce(passHistory, function (err, attendanceLog) {
      should.not.exist(err);
      should.exist(attendanceLog);

      checkTimestamp(attendanceLog.autoInTimestamp, hours, 15);
      checkTimestamp(attendanceLog.autoOutTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.inTimestamp, hours, 15);
      checkTimestamp(attendanceLog.outTimestamp, hours, minutes);
      checkDate(attendanceLog, YEAR, MONTH, DAY);
      attendanceLog.userId.should.be.exactly(USER_ID);

      done();
    });
  });

  it('testuser AttendanceLog update2(正常)', function (done) {
    var hours = 10;
    var minutes = 0;
    var passHistory = createPassHistory(testuser, hours, minutes);

    middlewareLogic.saveAttendanceLogOnce(passHistory, function (err, attendanceLog) {
      should.not.exist(err);
      should.exist(attendanceLog);

      checkTimestamp(attendanceLog.autoInTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.autoOutTimestamp, hours, 30);
      checkTimestamp(attendanceLog.inTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.outTimestamp, hours, 30);
      checkDate(attendanceLog, YEAR, MONTH, DAY);
      attendanceLog.userId.should.be.exactly(USER_ID);

      done();
    });
  });

  it('testuser AttendanceLog update3(正常)', function (done) {
    var hours = 17;
    var minutes = 0;
    var passHistory = createPassHistory(testuser, hours, minutes);

    middlewareLogic.saveAttendanceLogOnce(passHistory, function (err, attendanceLog) {
      should.not.exist(err);
      should.exist(attendanceLog);

      checkTimestamp(attendanceLog.autoInTimestamp, 10, 0);
      checkTimestamp(attendanceLog.autoOutTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.inTimestamp, 10, 0);
      checkTimestamp(attendanceLog.outTimestamp, hours, minutes);
      checkDate(attendanceLog, YEAR, MONTH, DAY);
      attendanceLog.userId.should.be.exactly(USER_ID);

      done();
    });
  });

  it('testuser2 AttendanceLog update(正常)', function (done) {
    var hours = 10;
    var minutes = 30;
    var passHistory = createPassHistory(testuser2, hours, minutes);

    middlewareLogic.saveAttendanceLogOnce(passHistory, function (err, attendanceLog) {
      should.not.exist(err);
      should.exist(attendanceLog);

      checkTimestamp(attendanceLog.autoInTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.autoOutTimestamp, 17, 30);
      checkTimestamp(attendanceLog.inTimestamp, 11, 0);
      checkTimestamp(attendanceLog.outTimestamp, 17, 0);
      checkDate(attendanceLog, YEAR, MONTH, DAY);
      attendanceLog.userId.should.be.exactly(USER_ID2);

      done();
    });
  });

  it('testuser2 AttendanceLog update2(正常)', function (done) {
    var hours = 17;
    var minutes = 45;
    var passHistory = createPassHistory(testuser2, hours, minutes);

    middlewareLogic.saveAttendanceLogOnce(passHistory, function (err, attendanceLog) {
      should.not.exist(err);
      should.exist(attendanceLog);

      checkTimestamp(attendanceLog.autoInTimestamp, 10, 30);
      checkTimestamp(attendanceLog.autoOutTimestamp, hours, minutes);
      checkTimestamp(attendanceLog.inTimestamp, 11, 0);
      checkTimestamp(attendanceLog.outTimestamp, 17, 0);
      checkDate(attendanceLog, YEAR, MONTH, DAY);
      attendanceLog.userId.should.be.exactly(USER_ID2);

      done();
    });
  });

  it('testuser3 AttendanceLog update1 cutInTimestamp (正常)', function (done) {
    var hours = 9;
    var minutes = 45;
    var passHistory = createPassHistory(testuser3, hours, minutes);

    middlewareLogic.saveAttendanceLogOnce(passHistory, function (err, attendanceLog) {
      should.not.exist(err);
      should.exist(attendanceLog);

      checkTimestamp(attendanceLog.autoInTimestamp, 10, 0);
      checkTimestamp(attendanceLog.autoOutTimestamp, 17, 30);
      checkTimestamp(attendanceLog.inTimestamp, 10, 0);
      checkTimestamp(attendanceLog.outTimestamp, 17, 0);
      checkDate(attendanceLog, YEAR, MONTH, DAY);
      attendanceLog.userId.should.be.exactly(USER_ID3);

      done();
    });
  });

  it('testuser4 AttendanceLog update1 cutInTimestamp (正常)', function (done) {
    var hours = 9;
    var minutes = 45;
    var passHistory = createPassHistory(testuser4, hours, minutes);

    middlewareLogic.saveAttendanceLogOnce(passHistory, function (err, attendanceLog) {
      should.not.exist(err);
      should.exist(attendanceLog);

      checkTimestamp(attendanceLog.autoInTimestamp, 10, 0);
      checkTimestamp(attendanceLog.autoOutTimestamp, 10, 0);
      checkTimestamp(attendanceLog.inTimestamp, 10, 0);
      checkTimestamp(attendanceLog.outTimestamp, 10, 0);
      checkDate(attendanceLog, YEAR, MONTH, DAY);
      attendanceLog.userId.should.be.exactly(USER_ID4);

      done();
    });
  });

  describe('function cutInTime check', function () {
    var attendanceInCut = new AttendanceInCut({
      inTime: '10:00'
    });

    it('inTimestampがそれぞれ等しい場合 (正常)', function (done) {
      var attendanceLog = new AttendanceLog({
        inTimestamp: createDate(9, 0),
        outTimestamp: createDate(17, 0),
        autoInTimestamp: createDate(9, 0),
        autoOutTimestamp: createDate(17, 30),
        endTimestamp: createDate(17, 30)
      });

      var workdate = datetimeutil.workdate(attendanceLog.autoInTimestamp);
      var expect = middlewareLogic.cutInTime(attendanceLog, attendanceInCut.calculateCutDate(workdate));

      checkTimestamp(expect.inTimestamp, 10, 0);
      checkTimestamp(expect.autoInTimestamp, 10, 0);
      done();
    });

    it('inTimestampがそれぞれ異なる場合 (正常)', function (done) {
      var attendanceLog = new AttendanceLog({
        inTimestamp: createDate(9, 0),
        outTimestamp: createDate(17, 0),
        autoInTimestamp: createDate(9, 15),
        autoOutTimestamp: createDate(17, 30),
        endTimestamp: createDate(17, 30)
      });

      var workdate = datetimeutil.workdate(attendanceLog.autoInTimestamp);
      var expect = middlewareLogic.cutInTime(attendanceLog, attendanceInCut.calculateCutDate(workdate));

      checkTimestamp(expect.inTimestamp, 9, 0);
      checkTimestamp(expect.autoInTimestamp, 10, 0);
      checkTimestamp(expect.outTimestamp, 17, 0);
      checkTimestamp(expect.autoOutTimestamp, 17, 30);

      done();
    });

    it('autoInTimestampとautoOutTimestampがそれぞれ等しい場合 (正常)', function (done) {
      var attendanceLog = new AttendanceLog({
        inTimestamp: createDate(9, 30),
        outTimestamp: createDate(17, 0),
        autoInTimestamp: createDate(9, 45),
        autoOutTimestamp: createDate(9, 45),
        endTimestamp: createDate(17, 30)
      });

      var workdate = datetimeutil.workdate(attendanceLog.autoInTimestamp);
      var expect = middlewareLogic.cutInTime(attendanceLog, attendanceInCut.calculateCutDate(workdate));

      checkTimestamp(expect.inTimestamp, 9, 30);
      checkTimestamp(expect.autoInTimestamp, 10, 0);
      checkTimestamp(expect.outTimestamp, 10, 0);
      checkTimestamp(expect.autoOutTimestamp, 10, 0);
      done();
    });

    it('inTimestampとautoInTimestampとautoOutTimestampがそれぞれ等しい場合 (正常)', function (done) {
      var attendanceLog = new AttendanceLog({
        inTimestamp: createDate(9, 45),
        outTimestamp: createDate(17, 0),
        autoInTimestamp: createDate(9, 45),
        autoOutTimestamp: createDate(9, 45),
        endTimestamp: createDate(17, 30)
      });

      var workdate = datetimeutil.workdate(attendanceLog.autoInTimestamp);
      var expect = middlewareLogic.cutInTime(attendanceLog, attendanceInCut.calculateCutDate(workdate));

      checkTimestamp(expect.inTimestamp, 10, 0);
      checkTimestamp(expect.autoInTimestamp, 10, 0);
      checkTimestamp(expect.outTimestamp, 10, 0);
      checkTimestamp(expect.autoOutTimestamp, 10, 0);
      done();
    });
  });

});

