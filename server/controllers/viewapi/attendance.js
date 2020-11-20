'use strict';

var config = require('../../config/environment');
var _ = require('lodash'),
  async = require('async'),
    mongoose = require('mongoose'),
    moment = require('moment'),
    logger = log4js.getLogger(),
    User = mongoose.model('User'),
    Group = mongoose.model('Group'),
    Matter = mongoose.model('Matter'),
    AttendanceLog = mongoose.model('AttendanceLog'),
    AttendanceType = mongoose.model('AttendanceType'),
    AttendanceStatus = mongoose.model('AttendanceStatus'),
    AttendanceInCut = mongoose.model('AttendanceInCut'),
    ObjectId = require('mongoose').Types.ObjectId,
    datetimeutil = require('../../utils/datetimeutil'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic'),
    helper = require('../../logics/helper');

var createAttendanceRow = function (attendanceInCut, attendanceLog, reqParams, day, callback) {
  if (!attendanceLog) {
    callback({
      id: null,
      user: null,
      userId: null,
      year: reqParams.year,
      month: reqParams.month,
      day: day,
      editedRestTimestamp: null,
      restHoursSaved: null,
      workHours: null,
      workTimeString: null,
      editedInTimestamp: null,
      editedOutTimestamp: null,
      inTimeSaved: null,
      outTimeSaved: null,
      inTimestamp: null,
      outTimestamp: null,
      modified: false,
      reasonOfEditing: null,
      overtimeRequest: null,
      attendanceType: null
    });
    return true;
  }

  var inTime = datetimeutil.roundUp(attendanceLog.inTimestamp);
  var outTime = datetimeutil.roundDown(attendanceLog.outTimestamp);
  var restHours;

  // var roundedInTimestamp = datetimeutil.roundUp(attendanceLog.inTimestamp);
  // var roundedOutTimestamp = datetimeutil.roundDown(attendanceLog.outTimestamp);

  // var inTime = new Date(Date.UTC(roundedInTimestamp.getUTCFullYear(), roundedInTimestamp.getUTCMonth(), roundedInTimestamp.getUTCDate(), roundedInTimestamp.getUTCHours(), roundedInTimestamp.getUTCMinutes(), roundedInTimestamp.getUTCSeconds()));
  // var outTime = new Date(Date.UTC(roundedOutTimestamp.getUTCFullYear(), roundedOutTimestamp.getUTCMonth(), roundedOutTimestamp.getUTCDate(), roundedOutTimestamp.getUTCHours(), roundedOutTimestamp.getUTCMinutes(), roundedOutTimestamp.getUTCSeconds()));

  async.parallel({
    workMinutes: function (callback) {
      attendanceLog.getWorkMinutesInDay(attendanceInCut, null, false, callback);
    },
    restHours: function (callback) {
      attendanceLog.getRestHours(function (restHours) {
        callback(null, restHours);
      });
    },
    modified: function (callback) {
      attendanceLog.timeModified(callback);
    },
  }, function (err, data) {
    var restHours = data.restHours;
    var workMinutes = data.workMinutes;

    var workHours;
    var workTimeString;
    if (inTime >= outTime) {
      outTime = inTime;
    }
    workHours = new Date(1970, 0, 1, Math.floor(workMinutes / 60), workMinutes % 60, 0);
    workTimeString = Math.floor(workMinutes / 60) + ':' + ('0' + workMinutes % 60).slice(-2);

    var attendanceTypeId = null;
    if (attendanceLog.attendanceType) {
      attendanceTypeId = attendanceLog.attendanceType._id;
    }
    var isValidWorkTime = attendanceLog.isValidWorkTime();
    var h = Math.floor(restHours);
    var m = Math.round((restHours - h) * 60);
    var restDates = new Date(Date.UTC(1970, 0, 1, h, m, 0));
    var restDate = datetimeutil.roundDown(restDates);
    // var restDate = new Date(1970, 0, 1, h, m, 0);

    var travelCostTotal = 0;
    if (attendanceLog.travelCost && attendanceLog.travelCost.items.length > 0) {
      attendanceLog.travelCost.items.forEach(function (item) {
        travelCostTotal += item.amount;
      });
    }

    callback({
      id: attendanceLog._id,
      user: attendanceLog.user,
      userId: attendanceLog.userId,
      year: attendanceLog.year,
      month: attendanceLog.month,
      day: attendanceLog.day,
      editedRestTimestamp: restDate,
      restHoursSaved: restDate,
      workHours: workHours,
      workMinutes: workMinutes,
      workTimeString: workTimeString,
      editedInTimestamp: inTime,
      editedOutTimestamp: outTime,
      inTimeSaved: inTime,
      outTimeSaved: outTime,
      inTimestamp: attendanceLog.autoInTimestamp,
      outTimestamp: attendanceLog.autoOutTimestamp,
      modified: data.modified,
      reasonOfEditing: attendanceLog.reasonOfEditing,
      overtimeRequest: attendanceLog.overtimeRequest,
      attendanceType: attendanceTypeId,
      attendanceTypeSaved: attendanceTypeId,
      isValidWorkTime: isValidWorkTime,
      travelCostTotal: travelCostTotal,
    });
  });
};

exports.get = function (req, res) {
  // バリデーション
  validator(req).checkQuery('userId').nullable().isInt();
  validator(req).checkQuery('year').nullable().isInt();
  validator(req).checkQuery('month').nullable().isInt();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    logger.info({
      validateErrors: validateErrors
    });
    res.status(400);
    return res.json(validateErrors);
  }

  var workdate = datetimeutil.workdate();
  var user;
  var reqParams = {
    userId: req.query.userId ? parseInt(req.query.userId) : req.user.id,
    year: req.query.year ? parseInt(req.query.year) : workdate.year,
    month: req.query.month ? parseInt(req.query.month) : workdate.month,
  };

  async.waterfall([
    function (callback) {
      User.findOne({
        id: reqParams.userId
      }, function (err, findUser) {
        user = findUser;
        callback(err);
      });
    },
  ], function (err) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);
      return;
    }

    var commonConditions = {
      user: user._id,
      year: reqParams.year,
      month: reqParams.month,
    }
    async.parallel({
      attendanceLogs: function (callback) {
        AttendanceLog.find(commonConditions).sort({
            day: 1
          })
          .populate('overtimeRequest')
          .populate('attendanceType')
          .populate('travelCost')
          .exec(callback);
      },
      firstDayOfNextMonthAttendanceLog: function (callback) {
        // 翌月1日までのデータ取得
        if (reqParams.month == 12) {
          AttendanceLog.findOne({
            user: user._id,
            year: reqParams.year + 1,
            month: 1,
            day: 1,
          }, callback);
        } else {
          AttendanceLog.findOne({
            user: user._id,
            year: reqParams.year,
            month: reqParams.month + 1,
            day: 1,
          }, callback);
        }
      },
      attendanceInCut: function (callback) {
        AttendanceInCut.findOne(commonConditions)
          .populate('matter')
          .exec(callback);
      },
      attendanceStatus: function (callback) {
        AttendanceStatus.findOne(commonConditions, function (err, attendanceStatus) {
          if (attendanceStatus == null) {
            callback(err, config.attendanceStatuses['no_application']);
          } else {
            callback(err, attendanceStatus.status);
          }
        });
      },
      attendanceSummary: function (callback) {
        logic.getSummary(user, reqParams.year, reqParams.month, function (err, summary) {
          callback(null, summary);
        });
      },
      permission: function (callback) {
        logic.getUserPermissions(req.user._id, user._id, callback);
      },
      attendanceTypes: function (callback) {
        var attendanceTypes = [];
        AttendanceType.find({}, function (err, types) {
          types.forEach(function (type) {
            attendanceTypes[type.name] = type._id;
          });
          callback(err, attendanceTypes);
        });
      },
    }, function (err, data) {
      if (err) {
        logger.error(err);
        res.status(500);
        res.send(err);
        return;
      }

      // 自分の勤務表でなく、かつどの権限も持っていない場合はエラー（閲覧不可）
      if (!req.user.equals(user) &&
        !req.user.admin &&
        !req.user.top &&
        !data.permission.middle &&
        !data.permission.better &&
        !data.permission.admin) {
        res.status(403);
        return res.json({});
      }

      var attendanceLogs = [];
      var days = _.range(0, datetimeutil.getDaysInMonth(reqParams.year, reqParams.month));
      var sumWorkHours = 0;
      async.eachSeries(days, function (d, callback) {
        var day = d + 1;
        var attendanceLog = _(data.attendanceLogs).find(function (target) {
          return target.day === day;
        });
        async.waterfall([
          // 休日の初期データ登録
          function (callback) {
            if (attendanceLog == null && helper.isHoliday(reqParams.year, reqParams.month, day)) {
              var weekday = (new Date(reqParams.year, reqParams.month - 1, day)).getDay();
              var attendanceType = null;
              if (weekday == 0) {
                attendanceType = data.attendanceTypes['法定休日'];
              } else {
                attendanceType = data.attendanceTypes['休日'];
              }
              var zero = new Date(reqParams.year, reqParams.month - 1, day);
              attendanceLog = new AttendanceLog({
                userId: user.id,
                user: user._id,
                year: reqParams.year,
                month: reqParams.month,
                day: day,
                attendanceType: attendanceType,
                inTimestamp: zero,
                outTimestamp: zero,
                reasonOfEditing: '',
              });
              attendanceLog.save(function (err, attendanceLog) {
                AttendanceLog.populate(attendanceLog, {
                  path: 'attendanceType'
                }, function (err, attendanceLog) {
                  callback(err, attendanceLog);
                });
              });
            } else {
              callback(null, attendanceLog);
            }
          },
          // 表示データ生成
          function (attendanceLog, callback) {
            createAttendanceRow(data.attendanceInCut, attendanceLog, reqParams, day, function (row) {
              attendanceLogs.push(row);
              if (row.workHours !== null) {
                sumWorkHours += row.workHours % 60 + row.workMinutes / 60;
              }
              callback();
            });
          },
        ], callback);
      }, function (err, results) {
        if (err) {
          logger.error(err);
          res.status(500);
          res.send(err);
          return;
        }

        if (req.header('accept') === 'application/csv') {
          var tzOffset = config.timeoffset * 60;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/csv');
          attendanceLogs.forEach(function (attendanceLog) {
            res.write(_.map(attendanceLog, function (field) {
              if (field === undefined || field === null) {
                return '""';
              } else if (typeof (field.toISOString) === 'function') {
                return '"' + moment(field.toISOString()).zone(-tzOffset).format() + '"';
              }
              return '"' + field.toString().replace(/\"/g, '""') + '"';
            }).toString() + '\r\n');
          });
          res.end();
          return;
        }

        return res.json({
          user: user ? user._id : null,
          userId: user ? user.id : null,
          userName: user ? user.name : '',
          employeeCode: user ? user.employeeCode : '',
          loginUser: req.user._id,
          year: reqParams.year,
          month: reqParams.month,
          sumWorkHours: sumWorkHours,
          attendanceLogs: attendanceLogs,
          firstDayOfNextMonthAttendanceLog: data.firstDayOfNextMonthAttendanceLog,
          attendanceInCut: data.attendanceInCut,
          attendanceSummary: data.attendanceSummary,
          attendanceStatus: data.attendanceStatus,
          attendanceStatuses: config.attendanceStatuses,
          attendanceActions: config.attendanceActions,
          isMine: user ? user.id == req.user.id : false,
          isAdmin: req.user.admin,
          isProjectManager: data.permission.admin,
          isMiddleManager: data.permission.middle,
          isBetterManager: data.permission.better,
          isTopManager: req.user.top,
          requireLegalHolidays: config.requireLegalHolidays,
        });
      });
    });
  });
};
