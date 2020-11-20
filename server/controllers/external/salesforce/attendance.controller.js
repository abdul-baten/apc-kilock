'use strict';

var logger = log4js.getLogger();
var mongoose = require('mongoose');
var validator = require('../../../utils/validator');
var async = require('async');
var config   = require('../../../config/environment');
var Project = mongoose.model('Project');
var Matter = mongoose.model('Matter');
var User = mongoose.model('User');
var AttendanceInCut = mongoose.model('AttendanceInCut');
var AttendanceLog = mongoose.model('AttendanceLog');
var AttendanceType = mongoose.model('AttendanceType');
var Timecard = mongoose.model('Timecard');
var MonthEndClose = mongoose.model('MonthEndClose');
var Koyomi = require('koyomi');
var datetimeutil = require('../../../utils/datetimeutil');
var app = require('../../../app');
var redisutil = require('../../../utils/redisutil');

var YEAR_REGEX = /^(\d{4})$/;
var MONTH_REGEX = /^(0*[1-9]|1[0-2])$/;

var TIMEOUT = 6000 * 1000;

var createRedisKey = function (req) {
  var key = '';
  if (req.query.year) {
    key += req.query.year;
  }
  if (req.query.month) {
    key += req.query.month;
  }
  if (req.query.employeeCode) {
    key += req.query.employeeCode;
  }
  if (req.query.matterCode) {
    key += req.query.matterCode;
  }
  return key;
};

/**
 * バリデーション
 * @param req
 * @returns {*}
 */
var validateRequest = function (req) {
  validator(req).checkQuery('year').nullable().matches(YEAR_REGEX);
  validator(req).checkQuery('month').nullable().matches(MONTH_REGEX);
  validator(req).checkQuery('matterCode').nullable();
  validator(req).checkQuery('employeeCode').nullable();
  return req.validationErrors();
};

exports.get = function (req, res) {
  logger.debug(req.query);

  req.setTimeout(TIMEOUT, function() {
    res.end();
  });

  // バリデーション
  var validateErrors = validateRequest(req);
  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json({
      statusCode : 'ERROR',
      errors: validateErrors,
    });
  }

  // Redisに取得データがあれば返却
  var redisKey = createRedisKey(req);
  var redisClient = redisutil.createRedisClient();
  redisClient.exists(redisKey, function(err, result) {
    if (result == 1) {
      logger.debug('redisKey: ' + redisKey + ' is exsist in redis.');
      redisClient.get(redisKey, function(err, resStr) {
        res.writeHead(200, {
          'Content-Type': 'application/json'
        });
        res.write(resStr);
        res.end();
        if (redisClient) {
          redisClient.quit();
        }
        return;
      });
    } else {
      logger.debug('redisKey: ' + redisKey + ' is not exsist in redis.');

      async.parallel({
        userId: function(callback) {
          if (req.query.employeeCode) {
            User.findOne({employeeCode:req.query.employeeCode}, null, {}, function(err, user) {
              if (user) {
                callback(null, user.id);
              } else {
                callback('該当する社員が存在しません。');
              }
            });
          } else {
            callback();
          }
        },
        matterIds: function(callback) {
          if (req.query.matterCode) {
            Matter.findOne({matterCode: req.query.matterCode}).distinct('id').exec(function(err, matterIds) {
              if (matterIds.length > 0) {
                callback(null, matterIds);
              } else {
                callback('該当する案件が存在しません。');
              }
            });
          } else {
            callback();
          }
        },
        attendanceTypes: function (callback) {
          AttendanceType.find({}, null, {}, function(err, attendanceTypes) {
            var resAttendanceTypes = [];
            async.each(attendanceTypes, function(attendanceType, callback) {
              resAttendanceTypes[attendanceType.name] = attendanceType;
              callback();
            }, function(err, results) {
              callback(null, resAttendanceTypes);
            });
          });
        },
        attendanceStatus: function (callback) {
          if (!req.query.year || !req.query.month) {
            callback(null, 'fixed');
          } else {
            var now = new Date();
            var koyomi = new Koyomi();

            // API実行時年月日が指定年月の前月の場合
            var lastMonthDate = koyomi.add(new Date(), '-1m');
            var lastMonthYear = lastMonthDate.getFullYear();
            var lastMonth = lastMonthDate.getMonth() + 1;
            if (req.query.year == lastMonthYear && req.query.month == lastMonth) {
              // 指定年月の翌月の初日からの4営業日以上経過していればfixed
              if (koyomi.passEigyobi(now) >= config.fixedStatusWorkDays) {
                callback(null, 'fixed');
              } else {
                callback(null, 'flowing');
              }
            } else {
              var nextMonthDateOfTarget = new Date(req.query.year, req.query.month - 1, 1);
              nextMonthDateOfTarget.setDate(koyomi.monthDays(nextMonthDateOfTarget) + 1);
              if (nextMonthDateOfTarget.getTime() >= now.getTime()) {
                callback(null, 'flowing');
              } else {
                callback(null, 'fixed');
              }
            }
          }
        },
      }, function(err, results) {

        res.writeHead(200, {
          'Content-Type': 'application/json'
        });

        // レスポンスデータ
        var resData = {
          statusCode:       'SUCCESS',
          attendanceStatus: results.attendanceStatus,
        };
        if (req.query.year) {
          resData['year']  = parseInt(req.query.year);
        }
        if (req.query.month) {
          resData['month'] = parseInt(req.query.month);
        }
        resData['employees'] = [];
        // employee 配下以外のレスポンスを書き込み
        var resStr = JSON.stringify(resData);
        resStr = resStr.substr(0, resStr.length - 2); // 末尾の 括弧 を削除
        //res.write(resStr);

        // エラー
        if (err) {
          logger.info(err);
          resStr += "]}";
          res.write(resStr);
          res.end();
          return;
        }

        var conditions = {};
        if (req.query.year) {
          conditions['year'] = req.query.year;
        }
        if (req.query.month) {
          conditions['month'] = req.query.month;
        }
        if (results.userId) {
          conditions['userId'] = results.userId;
        }
        if (results.matterIds) {
          conditions['$or'] = [{matterId: {'$in': results.matterIds}}, {matterId: null}];
        }
        var options = {sort: {day: 'asc'}};

        var responseEmployee = function(conditions, options, userId, callback) {
          var resEmployee = new ResEmployee();
          conditions['userId'] = userId;

          async.parallel({
            attendanceLogs: function(callback) {
              AttendanceLog.find(conditions, null, options)
                .populate('attendanceType')
                .populate('travelCost')
                .exec(callback);
            },
            attendanceLogsNextAndLastMonth: function(callback) {
              if (conditions.year && conditions.month) {
                var koyomi = new Koyomi();
                var nextMonthDate = koyomi.add(new Date(conditions.year, conditions.month - 1, 1), '1month');
                var lastMonthDate = koyomi.add(new Date(conditions.year, conditions.month - 1, 1), '-1month');
                var nextlastConditions = {
                  userId: conditions.userId,
                  year:  {
                    $in: [
                      lastMonthDate.getFullYear(),
                      nextMonthDate.getFullYear(),
                    ]
                  },
                  month:  {
                    $in: [
                      lastMonthDate.getMonth() + 1,
                      nextMonthDate.getMonth() + 1,
                    ]
                  }
                }
                logger.debug(nextlastConditions);
                AttendanceLog.find(nextlastConditions, null, options)
                  .populate('attendanceType')
                  .exec(callback);
              } else {
                callback();
              }
            },
          }, function (err, logresults) {
            var attendanceLogs = logresults.attendanceLogs;
            var attendanceLogsNextAndLastMonth = logresults.attendanceLogsNextAndLastMonth;

            async.eachLimit(attendanceLogs, 100, function(attendanceLog, callback) {
              async.parallel({
                attendanceInCut: function(callback) {
                  var conditions = {
                    user:  attendanceLog.user,
                    year:  attendanceLog.year,
                    month: attendanceLog.month,
                  }
                  AttendanceInCut.findOne(conditions)
                    .populate('matter')
                    .exec(function(err, attendanceInCut) {
                      // 勤怠区分が未設定の勤怠データに対して、勤怠区分を設定する
                      if (!attendanceLog.attendanceType) {
                        attendanceLog.setAttendanceType(attendanceInCut, results.attendanceTypes, 'leave');
                      }
                      callback(err, attendanceInCut);
                    });
                },
                timecards: function(callback) {
                  var timecardConditions = {
                    userId:   attendanceLog.userId,
                    year:     attendanceLog.year,
                    month:    attendanceLog.month,
                    day:      attendanceLog.day,
                  };
                  if (conditions.$or) {
                    timecardConditions['$or'] = conditions['$or']
                  }
                  Timecard.find(timecardConditions, function(err, timecards) {
                    var options = [
                      { path: 'matter' },
                      { path: 'user', select: 'employeeCode' }
                    ];
                    Timecard.populate(timecards, options, function(err, timecards) {
                      callback(err, timecards);
                    });
                  });
                },
                attendanceStatus: function(callback) {
                  var conditions = {
                    user:  attendanceLog.user,
                    year:  attendanceLog.year,
                    month: attendanceLog.month,
                  }
                  MonthEndClose.findOne(conditions, function(err, monthEndClose) {
                    if (monthEndClose != null && monthEndClose.closeStatus == 'closed')  {
                      callback(null, 'fixed');
                    } else {
                      callback(null, 'flowing');
                    }
                  });
                },
              }, function(err, data) {
                  var timecards        = data.timecards;
                  var attendanceInCut  = data.attendanceInCut;
                  var attendanceStatus = data.attendanceStatus;
                  var options = [
                    { path: 'attendanceType'},
                    {
                      path  : 'user',
                      select: 'employeeCode'
                    },
                  ];
                  AttendanceLog.populate(attendanceLogs, options, function(err, attendanceLogs) {
                    if (!attendanceLog.isValidWorkTime() &&
                        attendanceLog.travelCost && attendanceLog.travelCost.getTotalAmount() > 0) {
                      resEmployee.setAttendanceEmpty(attendanceLog, attendanceInCut, req.query.matterCode, attendanceStatus, callback);
                    } else if (attendanceLog.isValidWorkTime()) {
                      attendanceLog.getWorkMinutesInDay(attendanceInCut, timecards, false, function(err, workMinutesInDay) {
                        async.eachLimit(timecards, 100, function(timecard, callback) {
                          resEmployee.setAttendance(attendanceLogs, attendanceLogsNextAndLastMonth, attendanceLog, attendanceInCut, req.query.matterCode, timecard, timecards, workMinutesInDay, attendanceStatus, callback);
                        }, callback);
                      });
                    } else {
                      callback();
                    }
                  });
              });
            }, function (err, results) {
              var employee = resEmployee.getEmployee();
              if (employee) {
                var employeeStr = JSON.stringify(employee);
                employeeStr += ",";
                //res.write(employeeStr);
                resStr += employeeStr;
              }
              resEmployee = null;
              callback();
            });
          });
        };

        AttendanceLog.find(conditions, null, options, function(err, attendanceLogs) {
          AttendanceLog.find(conditions).distinct("userId").exec(function(err, userIdList) {
            async.series([
              function(callback) {
                if (userIdList && userIdList.length > 0) {
                  async.eachLimit(userIdList, 150, function(userId, callback) {
                    logger.debug(userIdList.indexOf(userId) + "/" + userIdList.length);
                    responseEmployee(conditions, options, userId, callback);
                  }, callback);
                } else {
                  callback();
                }
              },
            ], function(err, results) {
              if (resStr.slice(- 1) == ',') {
                resStr = resStr.substr(0, resStr.length - 1);
              }
              resStr += "]}";
              //res.write("]}");
              res.write(resStr);
              res.end();

              // 収集したデータをRedisに保存
              // employeeCode指定時は保存しない(Redmine#109592)
              if (!req.query.employeeCode) {
                var redisKey = createRedisKey(req);
                var redisClient = redisutil.createRedisClient();
                redisClient.set(redisKey, resStr);
                redisClient.expire(redisKey, 15 * 60);
                if (redisClient) {
                  redisClient.quit();
                }
              }
            });
          });
        });
      });
    }
  });
}

function ResEmployee() {

  var employee = {
    matters: [],
  };

  this.getEmployee = function() {
    return employee.matters.length > 0 ? employee : false;
  }

  var getMatterIndex = function(matterCode) {
    for (var mi in employee.matters) {
      if (employee.matters[mi].matterCode == matterCode) {
        return mi;
      }
    }
  };

  var pushMatter = function(matterCode) {
    var length = employee.matters.push({
      matterCode:  matterCode,
      attendances: [],
    });
    return length - 1;
  };

  var getAttendanceDay = function(mi, day) {
    for (var i in employee.matters[mi].attendances) {
      if (employee.matters[mi].attendances[i].day == day) {
        return employee.matters[mi].attendances[i];
      }
    }
    return null;
  };

  var setAttendanceDay = function(mi, day, attendanceDay) {
    for (var i in employee.matters[mi].attendances) {
      if (employee.matters[mi].attendances[i].day == day) {
        return employee.matters[mi].attendances[i] = attendanceDay;
      }
    }
  };

  this.setAttendance = function(attendanceLogs, attendanceLogsNextMonth, attendanceLog, attendanceInCut, searchMatterCode, timecard, timecards, totalWorkMinutes, attendanceStatus, callback) {
    timecard.attendanceLog  = attendanceLog;
    timecard.attendanceType = attendanceLog.attendanceType;
    if (attendanceInCut) {
      timecard.setIsMainTimecard(timecards, attendanceInCut.matterId);
    } else {
      timecard.setIsMainTimecard(timecards, null);
    }

    async.parallel({
      workMinutes: function (callback) {
        callback(null, timecard.getWorkMinutes(attendanceInCut));
      },
      overtimeMinutes: function (callback) {
        timecard.getOvertimeMinutes(attendanceLogs, attendanceLogsNextMonth, timecards, function(overtimeMinutes) {
          callback(null, overtimeMinutes);
        });
      },
      dayOffMinutes: function (callback) {
        callback(null, timecard.getDayOffMinutes());
      },
      midnightOvertimeMinutes: function (callback) {
        callback(null, timecard.getMidnightOvertimeMinutes());
      },
      excludeMinutes: function (callback) {
        callback(null, timecard.getExcludeMinutes(totalWorkMinutes));
      },
      nightShiftMinutes: function (callback) {
        callback(null, timecard.getNightShiftMinutes());
      },
      holidayWorkMinutes: function (callback) {
        callback(null, timecard.getHolidayWorkMinutes(attendanceLogs, attendanceLogsNextMonth, totalWorkMinutes));
      },
      legalHolidayWorkMinutes: function (callback) {
        callback(null, timecard.getLegalHolidayWorkMinutes(attendanceLogs, attendanceLogsNextMonth, totalWorkMinutes));
      },
      nightShiftFlag: function (callback) {
        if (attendanceInCut) {
          callback(null, attendanceInCut.isNightShift);
        } else {
          callback(null, false);
        }
      },
      matter: function(callback) {
        // timecard に案件情報が紐付けられている場合
        if (timecard.matter) {
          callback(null, timecard.matter);
        // timecard にまだ案件情報が紐付けられていない場合
        } else {
          // 主案件あり
          if (attendanceInCut && attendanceInCut.isActive()) {
            // matterCode 絞込み条件がある場合
            if (searchMatterCode) {
              if (attendanceInCut.matter &&
                  attendanceInCut.matter.matterCode == searchMatterCode) {
                callback(null, attendanceInCut.matter);
              } else {
                callback(null, null);
              }
            // matterCode 絞込み条件がない場合
            } else {
              callback(null, attendanceInCut.matter);
            }
          // 主案件なし
          } else {
            var targetDate = new Date(timecard.year, timecard.month - 1, timecard.day);
            if (timecard.user) {
              var conditions = {
                contractStart: {$lte: targetDate},
                contractEnd:   {$gte: targetDate},
                resources: {
                  $elemMatch: {
                    user: timecard.user._id
                  }
                }
              };
              if (searchMatterCode) {
                conditions['$or'] = [{'matterCode': searchMatterCode}, {'matterCode': null}]
              }
              Matter.find(conditions, function(err, matters) {
                if (matters.length > 0) {
                  callback(null, matters[0]);
                } else {
                  callback(null, null);
                }
              });
            } else {
              callback(null, null);
            }
          }
        }
      },
    }, function (err, results) {
      var travelCost = attendanceLog.travelCost;
      var attendances = {
        day:                     timecard.day,
        workMinutes:             results.workMinutes,
        overtimeMinutes:         results.overtimeMinutes,
        dayOffMinutes:           results.dayOffMinutes,
        midnightOvertimeMinutes: results.midnightOvertimeMinutes,
        excludeMinutes:          results.excludeMinutes,
        nightShiftMinutes:       results.nightShiftMinutes,
        holidayWorkMinutes:      results.holidayWorkMinutes,
        legalHolidayWorkMinutes: results.legalHolidayWorkMinutes,
        nightShiftFlag:          results.nightShiftFlag,
        transportationCost:      travelCost ? travelCost.getTotalAmount() : 0,
      };

      var matter = results.matter;
      if (matter == null) {
        matter = {
          matterCode: "",
        };
      }

      if (attendanceLog.user) {
        employee.employeeCode = attendanceLog.user.employeeCode;
        employee.attendanceStatus = attendanceStatus;
        var mi = getMatterIndex(matter.matterCode);
        if (mi == null) {
          mi = pushMatter(matter.matterCode);
        }

        // 同一年月日同一案件のタイムカード情報があれば集約する
        var attendanceDay = getAttendanceDay(mi, attendances.day);
        if (attendanceDay) {
          // 超過時間算出時に翌日以降の勤怠区分未登録を検出した場合、各フィールドを空にして返却(Redmine#109623)
          if (results.overtimeMinutes == -1) {
            attendanceLog.existOvertimeAttendanceLogs = false;
          }

          if (attendanceLog.existOvertimeAttendanceLogs) {
            attendanceDay.workMinutes             += attendances.workMinutes;
            attendanceDay.overtimeMinutes         += attendances.overtimeMinutes;
            attendanceDay.dayOffMinutes           += attendances.dayOffMinutes;
            attendanceDay.midnightOvertimeMinutes += attendances.midnightOvertimeMinutes;
            attendanceDay.excludeMinutes          += attendances.excludeMinutes;
            attendanceDay.nightShiftMinutes       += attendances.nightShiftMinutes;
            attendanceDay.holidayWorkMinutes      += attendances.holidayWorkMinutes;
            attendanceDay.legalHolidayWorkMinutes += attendances.legalHolidayWorkMinutes;

          } else {
            delete(attendanceDay.workMinutes);
            delete(attendanceDay.overtimeMinutes);
            delete(attendanceDay.dayOffMinutes);
            delete(attendanceDay.midnightOvertimeMinutes);
            delete(attendanceDay.excludeMinutes);
            delete(attendanceDay.nightShiftMinutes);
            delete(attendanceDay.holidayWorkMinutes);
            delete(attendanceDay.legalHolidayWorkMinutes);
            delete(attendanceDay.nightShiftFlag);
          }
          setAttendanceDay(mi, attendances.day, attendanceDay);

        } else {
          // 超過時間算出時に翌日以降の勤怠区分未登録を検出した場合、各フィールドを空にして返却(Redmine#109623)
          if (results.overtimeMinutes == -1) {
            attendanceLog.existOvertimeAttendanceLogs = false;
          } else {
            attendanceLog.existOvertimeAttendanceLogs = true;
          }

          if (!attendanceLog.existOvertimeAttendanceLogs) {
            delete(attendances.workMinutes);
            delete(attendances.overtimeMinutes);
            delete(attendances.dayOffMinutes);
            delete(attendances.midnightOvertimeMinutes);
            delete(attendances.excludeMinutes);
            delete(attendances.nightShiftMinutes);
            delete(attendances.holidayWorkMinutes);
            delete(attendances.legalHolidayWorkMinutes);
            delete(attendances.nightShiftFlag);
          }
          employee.matters[mi].attendances.push(attendances);
        }
      }
      callback();
    });
  };

  this.setAttendanceEmpty = function(attendanceLog, attendanceInCut, searchMatterCode, attendanceStatus, callback) {
    async.parallel({
      nightShiftFlag: function (callback) {
        if (attendanceInCut) {
          callback(null, attendanceInCut.isNightShift);
        } else {
          callback(null, false);
        }
      },
      matter: function(callback) {
        // 主案件あり
        if (attendanceInCut && attendanceInCut.isActive()) {
          // matterCode 絞込み条件がある場合
          if (searchMatterCode) {
            if (attendanceInCut.matter &&
                attendanceInCut.matter.matterCode == searchMatterCode) {
              callback(null, attendanceInCut.matter);
            } else {
              callback(null, null);
            }
          // matterCode 絞込み条件がない場合
          } else {
            callback(null, attendanceInCut.matter);
          }
        // 主案件なし
        } else {
          var targetDate = new Date(attendanceLog.year, attendanceLog.month - 1, attendanceLog.day);
          if (attendanceLog.user) {
            var conditions = {
              contractStart: {$lte: targetDate},
              contractEnd:   {$gte: targetDate},
              resources: {
                $elemMatch: {
                  user: attendanceLog.user._id
                }
              }
            };
            if (searchMatterCode) {
              conditions['$or'] = [{'matterCode': searchMatterCode}, {'matterCode': null}]
            }
            Matter.find(conditions, function(err, matters) {
              if (matters.length > 0) {
                callback(null, matters[0]);
              } else {
                callback(null, null);
              }
            });
          } else {
            callback(null, null);
          }
        }
      },
    }, function (err, results) {
      var travelCost = attendanceLog.travelCost;
      var attendances = {
        day:                attendanceLog.day,
        nightShiftFlag:     results.nightShiftFlag,
        transportationCost: travelCost ? travelCost.getTotalAmount() : 0,
      };

      var matter = results.matter;
      if (matter == null) {
        matter = {
          matterCode: "",
        };
      }

      if (attendanceLog.user) {
        employee.employeeCode = attendanceLog.user.employeeCode;
        employee.attendanceStatus = attendanceStatus;
        var mi = getMatterIndex(matter.matterCode);
        if (mi == null) {
          mi = pushMatter(matter.matterCode);
        }
        employee.matters[mi].attendances.push(attendances);
      }
      callback();
    });
  };
}
