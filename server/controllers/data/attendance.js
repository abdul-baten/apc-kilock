'use strict';

var _ = require('lodash'),
  async = require('async'),
  mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  User = mongoose.model('User'),
  AttendanceLog = mongoose.model('AttendanceLog'),
  AttendanceInCut = mongoose.model('AttendanceInCut'),
  datetimeutil = require('../../utils/datetimeutil'),
  validator = require('../../utils/validator');
var config = require('../../config/environment');

var RoundMinutes = [ 1, 5, 10, 15, 30, 60 ];
var DefaultRoundMinutes = 15;

/**
 * APC内で休みと定義されている勤怠区分
 * @type {string[]}
 */
var apcHolidayNames = ['休日', '有休', '欠勤', '振休', '特別休', '法定休日'];

/**
 * 休日用の勤怠記録を作成する。
 * @param {number} day 日付
 * @param {array} travelCosts 交通費情報
 * @param {string} [attendanceTypeName] 勤怠区分（名称そのまま)
 * @param {string} [reasonOfEdition] 修正理由
 * @returns {Object} 勤怠記録
 */
var createHolidayProperty = function (day, travelCosts, attendanceTypeName, reasonOfEdition) {
  return {
    day: day,
    restHours: null,
    workHours: null,
    inTimestamp: null,
    outTimestamp: null,
    attendanceType: attendanceTypeName || null,
    reasonOfEditing: reasonOfEdition || null,
    travelCosts: travelCosts || [],
  };
};

/**
 * 勤怠区分が休みとして設定されているものか判定する
 * @param attendanceTypeName 勤怠区分（名称そのまま）
 * @returns {boolean} 休日に該当する勤怠区分が設定されていればtrue,それ以外はfalse
 */
var isHoliday = function (attendanceTypeName) {
  if (!attendanceTypeName) {
    return false;
  }

  if (apcHolidayNames.indexOf(attendanceTypeName) !== -1) {
    return true;
  } else {
    return false;
  }
};

exports.get = function (req, res) {
  validator(req).checkQuery('login').notEmpty();
  validator(req).checkQuery('year').nullable().isInt();
  validator(req).checkQuery('month').nullable().isInt();
  validator(req).checkQuery('min').nullable().isInt();
  validator(req).checkQuery('timestampstyle').nullable().isIn('sec', 'millisec');
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var invertedTravelCostTypes = _.invert(config.travelCostTypes);
  var invertedTravelCostPurposes = _.invert(config.travelCostPurposes);

  // デフォルトは10日前まで
  var workdate = datetimeutil.workdate({d: -10});
  var min = req.query.min ? parseInt(req.query.min) : DefaultRoundMinutes;
  var reqParams = {
    login: req.query.login,
    year: req.query.year ? parseInt(req.query.year) : workdate.year,
    month: req.query.month ? parseInt(req.query.month) : workdate.month,
    min: _.contains(RoundMinutes, min) ? min : DefaultRoundMinutes,
    timestampstyle: req.query.timestampstyle,
  };
  async.waterfall([
    function (callback) {
      User.findOne({login: reqParams.login})
        .exec(callback);
    },
    function (user, callback) {
      if (!user) {
        res.status(400);
        return res.json({});
      }
      var condition = {
        userId: user.id,
        year: reqParams.year,
        month: reqParams.month,
      };
      AttendanceLog.find(condition)
        .sort({day: 1})
        .populate('attendanceType')
        .populate('travelCost')
        .exec(function (err, attendanceLogs) {
          if (err) {
            callback(err);
          } else {
            callback(null, {
              user: user,
              attendanceLogs: attendanceLogs
            });
          }
        });
    },
    function (data, callback) {
      var condition = {
        user: data.user._id,
        year: reqParams.year,
        month: reqParams.month,
      };
      AttendanceInCut.findOne(condition).populate('matter').exec(function(err, attendanceInCut) {
        callback(null, {
          user: data.user,
          attendanceInCut: attendanceInCut,
          attendanceLogs: data.attendanceLogs
        });
      });
    },
  ], function (err, data) {
    var toTimestamp = function (datetime) {
      if (!datetime) {
        return null;
      }
      var ts = datetime.getTime();
      if (reqParams.timestampstyle === 'sec') {
        ts = Math.floor(ts / 1000);
      }
      return ts;
    };
    if (!err) {
      var user = data.user;
      var attendanceInCut = data.attendanceInCut;
      var attendanceLogs = [];
      var days = datetimeutil.getDaysInMonth(reqParams.year, reqParams.month);

      async.eachSeries(data.attendanceLogs, function(attendanceLog, callback) {
        async.waterfall([
          function(callback) {
            attendanceLog.getRestHours(function(restHours) {
              attendanceLog.calcRestHours = restHours;
              callback();
            });
          },
          function(callback) {
            attendanceLog.getWorkMinutesInDay(attendanceInCut, null, false, function(err, workMinutes) {
              attendanceLog.calcWorkMinutes = workMinutes;
              callback();
            });
          },
        ], callback);
      }, function(err, results) {
        _.times(days, function (n) {
          var day = n + 1;
          var attendanceLog = _(data.attendanceLogs).find(function (target) {
            return target.day === day;
          });
          if (attendanceLog) {
            var attendanceTypeName = null;
            if (attendanceLog.attendanceType) {
              attendanceTypeName = attendanceLog.attendanceType.name;
            }

            // 交通費情報を設定
            var travelCosts = [];
            if (attendanceLog.travelCost && attendanceLog.travelCost.items) {
              travelCosts = attendanceLog.travelCost.items.map(function(item) {
                var routes = [];
                if (item.routes) {
                  routes = item.routes.map(function(route) {
                    return route;
                  });
                }
                return {
                  type:    invertedTravelCostTypes[item.type],
                  purpose: invertedTravelCostPurposes[item.purpose],
                  amount:  item.amount,
                  routes:  routes,
                };
              });
            }

            if (isHoliday(attendanceTypeName)) {
              attendanceLogs.push(createHolidayProperty(day, travelCosts, attendanceTypeName, attendanceLog.reasonOfEditing));
            } else {
              var inTime = datetimeutil.roundUp(attendanceLog.inTimestamp, reqParams.min);
              var outTime = datetimeutil.roundDown(attendanceLog.outTimestamp, reqParams.min);
              var restHoursOutput, workHours;
              if (inTime >= outTime) {
                restHoursOutput = null;
                outTime = null;
                workHours = null;
              } else {
                  workHours = attendanceLog.calcWorkMinutes;
              }
              attendanceLogs.push({
                day:             attendanceLog.day,
                restHours:       attendanceLog.calcRestHours,
                workHours:       workHours,
                inTimestamp:     toTimestamp(inTime),
                outTimestamp:    toTimestamp(outTime),
                attendanceType:  attendanceTypeName,
                reasonOfEditing: attendanceLog.reasonOfEditing,
                travelCosts:     travelCosts
              });
            }
          } else {
            attendanceLogs.push(createHolidayProperty(day, travelCosts));
          }
        });

        return res.json({
          year: reqParams.year,
          month: reqParams.month,
          user: {
            id: user.id,
            login: user.login,
            name: user.name,
            mail: user.mail,
          },
          attendanceLogs: attendanceLogs,
        });
      });
    } else {
      logger.error(err);
      res.status(500);
      res.send(err);
    }
  });
};
