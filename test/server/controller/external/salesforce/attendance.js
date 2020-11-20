'use strict';

var should = require('should'),
  app = require('../../../../../server/app'),
  request = require('supertest'),
  _ = require('lodash'),
  async = require('async'),
  moment = require('moment'),
  config = require('../../../../../server/config/environment'),
  logger = log4js.getLogger(),
  datetimeutil = require('../../../../../server/utils/datetimeutil'),
  attendance = require('../../../../../server/controllers/external/salesforce/attendance.controller.js'),
  mongoose = require('mongoose'),
  ObjectId = require('mongoose').Types.ObjectId,
  User = mongoose.model('User'),
  Nfc = mongoose.model('Nfc'),
  AttendanceType = mongoose.model('AttendanceType'),
  AttendanceInCut = mongoose.model('AttendanceInCut'),
  AttendanceLog = mongoose.model('AttendanceLog'),
  Timecard = mongoose.model('Timecard');

describe('logic salesforce/attendance.json', function () {

  var YEAR  = 2016;
  var MONTH = 6;
  var DAY   = 2;
  var testUserName = 'testUserA'
  var testUser = null
  var testUserNfc = null
  var testUserAttendanceInCut = null
  var attendanceTypes = null
  var sfParameter = {}

  before(function (done) {
    async.waterfall([
      function (waterfallDone) {
        User.findOne({name: testUserName}, function(err, user) {
          testUser = user;
          sfParameter = {
            year        : YEAR,
            month       : MONTH,
            employeeCode: user.employeeCode,
          }
          waterfallDone(err, user);
        });
      },
      function (user, waterfallDone) {
        Nfc.findOne({user: user._id}, function(err, nfc) {
          testUserNfc = nfc;
          waterfallDone(err, user);
        });
      },
      function (user, waterfallDone) {
        AttendanceInCut.findOne({
          user : user._id,
          year : YEAR,
          month: MONTH,
        }).populate('matter').exec(function(err, attendanceInCut) {
          testUserAttendanceInCut = attendanceInCut
          waterfallDone(err, user);
        });
      },
    ], function(err, user){
      async.parallel([
        function (parallelDone) {
          truncate(parallelDone)
        },
        function (parallelDone) {
          AttendanceType.find({}, function(err, getAttendanceTypes) {
            attendanceTypes = getAttendanceTypes
            parallelDone()
          })
        },
      ], done);
    });
  });

  function truncate(callback) {
    async.parallel([
      function (parallelDone) {
        AttendanceLog.remove({}, parallelDone);
      },
      function (parallelDone) {
        Timecard.remove({}, parallelDone)
      },
    ], function() {
      callback()
    })
  }

  /**
   * salesforce勤怠情報返却APIへアクセスするためのヘルパー関数
   * @param {Object} sendParameter APIへ送信するパラメータ
   * @param {Function} callback レスポンスの確認を行うコールバック関数
   */
  var sfAttendanceApiAccess = function (sendParameter, callback) {
    request(app)
      .get('/external/salesforce/attendance.json')
      .set('Accept-Language', 'ja')
      .query(sendParameter)
      .auth('test', 'test')
      .end(callback);
  };

  /**
   * 打刻APIへアクセスするためのヘルパー関数
   * @param {Object} sendParameter APIへ送信するパラメータ
   * @param {Function} callback レスポンスの確認を行うコールバック関数
   */
  var passHistoryApiAccess = function (sendParameter, callback) {
    request(app)
      .post('/data/pass_histories.json')
      .set('Authorization', 'Basic dGVzdDp0ZXN0')
      .set('Content-Type', 'application/json')
      .send(sendParameter)
      .end(callback);
  };

  function getMoment(day, hours, minutes) {
    return moment({y: YEAR, M: MONTH - 1, d: day, h: hours, m: minutes})
  }

  function getTimestamp(moment) {
    return moment.unix() * 1000;
  }

  function getPassHistoryParameter(stamps) {
    var data = []
    stamps.forEach(function(stamp) {
      var times  = stamp.time.split(':', 2)
      var moment = getMoment(stamp.day, times[0], times[1]);
      data.push({
        nfc      : testUserNfc.number,
        pass_type: stamp.passType,
        timestamp: getTimestamp(moment),
        matter_id: stamp.matterId
      })
    })

    return {
      unit: "btm",
      type: "nfc",
      data: data,
    }
  }

  function passAndGetAttendance(passHistoryParam, attendanceTypeName, nextAttendanceParam, callback) {
    passHistoryApiAccess(passHistoryParam, function (err, res) {
      async.waterfall([
        function(callback) {
          setTimeout(function() {
            if (attendanceTypeName != null) {
              var attendanceType = _.find(attendanceTypes, {name: attendanceTypeName})
              AttendanceLog.update(
                {user: testUser._id, year:YEAR, month:MONTH, day:DAY},
                {$set: {attendanceType: attendanceType._id}},
                function() { callback() })
            } else {
              callback()
            }
          }, 250)
        },
        function(callback) {
          // 翌日データを登録
          if (nextAttendanceParam) {
            registNextData(nextAttendanceParam, callback);
          } else {
            callback()
          }
        },
        function(callback) {
          sfAttendanceApiAccess(sfParameter, function (err, res) {
            if (err) {
              logger.error(err)
              callback(err);
              return
            }
            var attendance
            if (res.body.employees.length > 0) {
              var matters = res.body.employees[0].matters;
              var matter = _.find(matters, {matterCode:testUserAttendanceInCut.matter.matterCode})
              if (matter) {
                attendance = _.find(matter.attendances, {day:DAY})
              }
            }
            callback(err, attendance)
          });
        },
      ], function(err, attendance) {
        callback(err, attendance)
      })
    })
  }

  function registNextData(param, callback) {
    var inDate  = getMoment(DAY + 1,  9,  0).toDate()
    var outDate = getMoment(DAY + 1, 17, 30).toDate()
    var restHours = 1
    var attendanceType = _.find(attendanceTypes, {name: param.attendanceTypeName})

    async.parallel([
      function(callback) {
        AttendanceLog.update(
          {
            user : testUser._id,
            year : YEAR,
            month: MONTH,
            day  : DAY + 1,
          },
          {
            userId          : testUser.id,
            user            : testUser._id,
            year            : YEAR,
            month           : MONTH,
            day             : DAY + 1,
            inTimestamp     : inDate,
            outTimestamp    : outDate,
            autoInTimestamp : inDate,
            autoOutTimestamp: outDate,
            attendanceType  : attendanceType._id,
          },
          { upsert: true }, callback)
      },
      function(callback) {
        var timecard = new Timecard({
          userId             : testUser.id,
          user               : testUser._id,
          matterId           : testUserAttendanceInCut.matter.id,
          matter             : testUserAttendanceInCut.matter._id,
          actualMatterId     : testUserAttendanceInCut.matter.id,
          actualMatter       : testUserAttendanceInCut.matter._id,
          year               : YEAR,
          month              : MONTH,
          day                : DAY + 1,
          actualInTimestamp  : inDate,
          actualOutTimestamp : outDate,
          actualRestHours    : restHours,
          editedInTimestamp  : inDate,
          editedOutTimestamp : outDate,
          editedRestHours    : restHours,
        })
        timecard.save(callback)
      }, function(err) {
        callback()
      }
    ])
  }

  // ------------------------------------------
  // ------------------ 出勤 -------------------
  // ------------------------------------------

  // ------------------ 出勤 翌日:登録なし -------------------
  it('出勤 翌日:登録なし', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, null,        null,     function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('出勤 翌日:登録なし 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, null,        null,     function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('出勤 翌日:登録なし 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, null,        null,     function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 660)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  // ------------------ 出勤 翌日:出勤 -------------------
  it('出勤 翌日:出勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('出勤 翌日:出勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('出勤 翌日:出勤 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 660)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('出勤 翌日:出勤 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 出勤 翌日:休日 -------------------
  it('出勤 翌日:休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('出勤 翌日:休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('出勤 翌日:休日 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('出勤 翌日:休日 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 出勤 翌日:休出 -------------------
  it('出勤 翌日:休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('出勤 翌日:休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('出勤 翌日:休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間未満)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '11:45', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 765)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 315)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 420)
        done()
      })
    })
  });


  it('出勤 翌日:休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間以上)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('出勤 翌日:休出 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 出勤 翌日:振休 -------------------
  it('出勤 翌日:振休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('出勤 翌日:振休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('出勤 翌日:振休 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('出勤 翌日:振休 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 出勤 翌日:法手休日 -------------------
  it('出勤 翌日:法定休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('出勤 翌日:法定休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('出勤 翌日:法定休日 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 270)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('出勤 翌日:法定休日 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 出勤 翌日:法定休出 -------------------
  it('出勤 翌日:法定休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('出勤 翌日:法定休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('出勤 翌日:法定休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間未満)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '11:45', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 765)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 315)
        should.equal(attendance.midnightOvertimeMinutes, 420)
        done()
      })
    })
  });


  it('出勤 翌日:法定休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間以上)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 270)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('出勤 翌日:法定休出 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '出勤',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });






  // ------------------------------------------
  // ------------------ 休出 -------------------
  // ------------------------------------------
  // ------------------ 休出 翌日:登録なし -------------------
  it('休出 翌日:登録なし', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId }, ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = null

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  })

  // ------------------ 休出 翌日:休日 -------------------
  it('休出 翌日:休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:休日 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 1110)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });


  // ------------------ 休出 翌日:休出 -------------------
  it('休出 翌日:休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:休出 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 1110)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  // ------------------ 休出 翌日:振休 -------------------
  it('休出 翌日:振休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:振休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:振休 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 1110)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  // ------------------ 休出 翌日:法定休日 -------------------
  it('休出 翌日:法定休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:法定休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:法定休日 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 270)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------ 休出 翌日:法定休出 -------------------
  it('休出 翌日:法定休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:法定休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:法定休出 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 270)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:出勤 -------------------
  it('休出 翌日:出勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:出勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:出勤 深夜残業(翌日退勤 7.5h以上勤務)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('休出 翌日:出勤 深夜残業(翌日退勤 7.5h未満勤務)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 60)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:有休 -------------------
  it('休出 翌日:有休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '有休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:有休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '有休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:有休 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '有休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:遅刻 -------------------
  it('休出 翌日:遅刻', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:遅刻 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:遅刻 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:早退 -------------------
  it('休出 翌日:早退', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:早退 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:早退 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:欠勤 -------------------
  it('休出 翌日:欠勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '欠勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:欠勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '欠勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:欠勤 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '欠勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:特別休 -------------------
  it('休出 翌日:特別休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '特別休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:特別休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '特別休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:特別休 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '特別休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:休出（振） -------------------
  it('休出 翌日:休出（振）', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:休出（振） 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:休出（振） 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:法定休出（振） -------------------
  it('休出 翌日:法定休出（振）', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:法定休出（振） 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:法定休出（振） 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:夜勤 -------------------
  it('休出 翌日:夜勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:夜勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:夜勤 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:夜勤遅刻 -------------------
  it('休出 翌日:夜勤遅刻', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:夜勤遅刻 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:夜勤遅刻 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 休出 翌日:夜勤早退 -------------------
  it('休出 翌日:夜勤早退', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 450)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出 翌日:夜勤早退 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 810)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出 翌日:夜勤早退 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 840)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------------------------------
  // ------------------ 法定休出 -------------------
  // ------------------------------------------

  // ------------------ 法定休出 翌日:法定休日 -------------------
  it('法定休出 翌日:法定休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:法定休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:法定休日 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 1110)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:法定休出 -------------------
  it('法定休出 翌日:法定休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:法定休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:法定休出 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 1110)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:休日 -------------------
  it('法定休出 翌日:休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:休日 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:休出 -------------------
  it('法定休出 翌日:休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:休出 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:振休 -------------------
  it('法定休出 翌日:振休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:振休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:振休 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:出勤 -------------------
  it('法定休出 翌日:出勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:出勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:出勤 深夜残業(翌日退勤 7.5h以上勤務)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('法定休出 翌日:出勤 深夜残業(翌日退勤 7.5h未満勤務)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',    nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 60)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:有休 -------------------
  it('法定休出 翌日:有休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '有休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:有休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '有休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:有休 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '有休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:遅刻 -------------------
  it('法定休出 翌日:遅刻', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:遅刻 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:遅刻 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:早退 -------------------
  it('法定休出 翌日:早退', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:早退 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:早退 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:欠勤 -------------------
  it('法定休出 翌日:欠勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '欠勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:欠勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '欠勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:欠勤 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '欠勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:特別休 -------------------
  it('法定休出 翌日:特別休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '特別休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:特別休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '特別休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:特別休 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '特別休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:休出（振） -------------------
  it('法定休出 翌日:休出（振）', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:休出（振） 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:休出（振） 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:法定休出（振） -------------------
  it('法定休出 翌日:法定休出（振）', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:法定休出（振） 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:法定休出（振） 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出（振）'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:夜勤 -------------------
  it('法定休出 翌日:夜勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:夜勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:夜勤 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:夜勤遅刻 -------------------
  it('法定休出 翌日:夜勤遅刻', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:夜勤遅刻 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:夜勤遅刻 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤遅刻'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });



  // ------------------ 法定休出 翌日:夜勤早退 -------------------
  it('法定休出 翌日:夜勤早退', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 450)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出 翌日:夜勤早退 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 810)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出 翌日:夜勤早退 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '夜勤早退'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出',       nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 270)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 840)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------------------------------
  // ------------------ 休出（振） -------------------
  // ------------------------------------------
  it('休出(振) 翌日:登録なし', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',   null,     function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('休出(振) 翌日:登録なし 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',   null,     function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });

  it('休出(振) 翌日:登録なし 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',   null,     function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 660)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        done()
      })
    })
  });


  // ------------------ 休出（振） 翌日:休日 -------------------
  it('休出（振） 翌日:休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出（振） 翌日:休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出（振） 翌日:休日 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('休出（振） 翌日:休日 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------ 休出（振） 翌日:休出 -------------------
  it('休出（振） 翌日:休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出（振） 翌日:休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出（振） 翌日:休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間未満)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '11:45', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 765)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 315)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 420)
        done()
      })
    })
  });

  it('休出（振） 翌日:休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間以上)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('休出（振） 翌日:休出 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------ 休出（振） 翌日:振休 -------------------
  it('休出（振） 翌日:振休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出（振） 翌日:振休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出（振） 翌日:振休 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('休出（振） 翌日:振休 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------ 休出（振） 翌日:法定休日 -------------------
  it('休出（振） 翌日:法定休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出（振） 翌日:法定休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出（振） 翌日:法定休日 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 270)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('休出（振） 翌日:法定休日 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 休出（振） 翌日:法定休出 -------------------
  it('休出（振） 翌日:法定休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出（振） 翌日:法定休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出（振） 翌日:法定休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間未満)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '11:45', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 765)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 315)
        should.equal(attendance.midnightOvertimeMinutes, 420)
        done()
      })
    })
  });

  it('休出（振） 翌日:法定休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間以上)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 270)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('休出（振） 翌日:法定休出 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------ 休出（振） 翌日:出勤 -------------------
  it('休出（振） 翌日:出勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('休出（振） 翌日:出勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('休出（振） 翌日:出勤 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 660)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------------------------------
  // ------------------ 法定休出（振） -------------------
  // ------------------------------------------

  // ------------------ 法定休出（振） 翌日:なし -------------------
  it('法定休出（振） 翌日:なし', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分   翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）', null, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:なし 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])


      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分   翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）', null, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:なし 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])


      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分   翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）', null, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 660)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------ 法定休出（振） 翌日:休日 -------------------
  it('法定休出（振） 翌日:休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:休日 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:休日 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------ 法定休出（振） 翌日:休出 -------------------
  it('法定休出（振） 翌日:休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間未満)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '11:45', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 765)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 315)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 420)
        done()
      })
    })
  });


  it('法定休出（振） 翌日:休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間未満)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:休出 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 法定休出（振） 翌日:振休 -------------------
  it('法定休出（振） 翌日:振休', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:振休 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:振休 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 270)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:振休 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '振休'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });


  // ------------------ 法定休出（振） 翌日:法定休日 -------------------
  it('法定休出（振） 翌日:法定休日', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:法定休日 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:法定休日 深夜残業(翌日退勤) 7.5h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 270)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:法定休日 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休日'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 法定休出（振） 翌日:法定休出 -------------------
  it('法定休出（振） 翌日:法定休出', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:法定休出 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:法定休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間未満)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '11:45', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 765)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 315)
        should.equal(attendance.midnightOvertimeMinutes, 420)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:法定休出 深夜残業(翌日退勤) 7.5h以上勤務(7.5hを超えた時間が翌日勤務時間以上)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 390)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 270)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:法定休出 深夜残業(翌日退勤) 7.5h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time:'22:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '法定休出'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 330)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------ 法定休出（振） 翌日:出勤 -------------------
  it('法定休出（振） 翌日:出勤', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '17:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 450)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:出勤 深夜残業', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY, time:  '9:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY, time: '23:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 810)
        should.equal(attendance.overtimeMinutes, 360)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 90)
        done()
      })
    })
  });

  it('法定休出（振） 翌日:出勤 深夜残業(翌日退勤)', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY  , time: '9:00', passType:  3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '4:30', passType: 99, matterId: testUserAttendanceInCut.matterId },
      ])

      // 翌日勤怠登録パラメータ
      var nextAttendanceParam = {
        attendanceTypeName: '出勤'
      }

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '法定休出（振）',  nextAttendanceParam, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 1110)
        should.equal(attendance.overtimeMinutes, 660)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 390)
        done()
      })
    })
  });

  // ------------------------------------------
  // ------------------ 夜勤 -------------------
  // ------------------------------------------

  // ------------------ 夜勤 翌日:なし -------------------
  it('夜勤 翌日:なし 15h未満勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY,   time:'17:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time: '8:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '夜勤',       null, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 870)
        should.equal(attendance.overtimeMinutes, 0)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

  it('夜勤 翌日:なし 15h以上勤務', function (done) {
    async.parallel([
      function (callback) {
        truncate(callback)
      },
    ], function(err) {
      // 打刻パラメータ
      var passHistoryParam = getPassHistoryParameter([
        { day: DAY,   time:'17:00', passType: 3, matterId: testUserAttendanceInCut.matterId },
        { day: DAY+1, time:'10:30', passType: 4, matterId: testUserAttendanceInCut.matterId },
      ])

      // 打刻実行して勤怠情報を取得
      //                   打刻APIパラメータ     打刻日勤怠区分  翌日勤怠登録パラメータ
      passAndGetAttendance(passHistoryParam, '夜勤',       null, function(err, attendance) {
        should.exist(attendance)
        should.equal(attendance.workMinutes, 990)
        should.equal(attendance.overtimeMinutes, 90)
        should.equal(attendance.holidayWorkMinutes, 0)
        should.equal(attendance.legalHolidayWorkMinutes, 0)
        should.equal(attendance.midnightOvertimeMinutes, 0)
        done()
      })
    })
  });

});
