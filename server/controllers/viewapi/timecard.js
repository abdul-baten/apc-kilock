'use strict';

var config = require('../../config/environment');
var _ = require('lodash'),
  async = require('async'),
    mongoose = require('mongoose'),
    moment = require('moment'),
    logger = log4js.getLogger(),
    User = mongoose.model('User'),
    Timecard = mongoose.model('Timecard'),
    TimecardEditing = mongoose.model('TimecardEditing'),
    MonthEndClose = mongoose.model('MonthEndClose'),
    Matter = mongoose.model('Matter'),
    Group = mongoose.model('Group'),
    AttendanceInCut = mongoose.model('AttendanceInCut'),
    AttendanceType = mongoose.model('AttendanceType'),
    AttendanceLog = mongoose.model('AttendanceLog'),
    AttendanceLogEditing = mongoose.model('AttendanceLogEditing'),
    datetimeutil = require('../../utils/datetimeutil'),
    validator = require('../../utils/validator'),
    attendance_logic = require('../../logics/attendance_logic');

var RoundMinutes = [1, 5, 10, 15, 30, 60];

// JSON形式で返すための整形済みデータ作成
var createTimecardRow = function (timecard, reqParams, day, callback) {
  if (!timecard) {
    callback({
      year: reqParams.year,
      month: reqParams.month,
      day: day,
      matter: null,
      matterId: null,
      actualMatter: null,
      actualMatterId: null,
      workTimeString: null,
      actualInTimestamp: null,
      actualOutTimestamp: null,
      actualRestTimestamp: null,
      editedInTimestamp: null,
      editedOutTimestamp: null,
      editedRestTimestamp: null,
      editedInTimestampSaved: null,
      editedOutTimestampSaved: null,
      editedRestTimestampSaved: null,
      roundedInTimestamp: null,
      roundedOutTimestamp: null,
      modified: false,
      reasonOfEditing: null
    });
    return;
  };

  async.parallel({
    attendanceInCut: function (callback) {
      var conditions = {
        user: timecard.user,
        year: timecard.year,
        month: timecard.month,
      };
      AttendanceInCut.findOne(conditions, callback);
    },
    attendanceLog: function (callback) {
      var conditions = {
        userId: timecard.userId,
        year: timecard.year,
        month: timecard.month,
        day: timecard.day,
      };
      AttendanceLog.findOne(conditions).populate('attendanceType').exec(function (err, attendanceLog) {
        callback(err, attendanceLog);
      });
    },
  }, function (err, results) {
    var date = new Date();
    var attendanceInCut = results.attendanceInCut;
    var modified = timecard.timeModified();

    // timecard.editedInTimestamp  = datetimeutil.roundUp(timecard.editedInTimestamp, config.roundMinutes);
    // if (timecard.editedOutTimestamp) {
    //   timecard.editedOutTimestamp = datetimeutil.roundDown(timecard.editedOutTimestamp, config.roundMinutes);
    // }

    // var actualRestHours = Math.floor(timecard.actualRestHours);
    // var actualRestMinutes = Math.floor((timecard.actualRestHours - actualRestHours) * 60);
    // var actualRestTimestamp = new Date(1970, 0, 1, actualRestHours, actualRestMinutes, 0);

    // var editedRestHours = Math.floor(timecard.editedRestHours);
    // var editedRestMinutes = Math.floor((timecard.editedRestHours - editedRestHours) * 60);
    // var editedRestTimestamp = new Date(1970, 0, 1, editedRestHours, editedRestMinutes, 0);

    var roundedEditedInTimestamp = datetimeutil.roundUp(timecard.editedInTimestamp, config.roundMinutes);
    timecard.editedInTimestamp = new Date(Date.UTC(roundedEditedInTimestamp.getUTCFullYear(), roundedEditedInTimestamp.getUTCMonth(), roundedEditedInTimestamp.getUTCDate(), roundedEditedInTimestamp.getUTCHours(), roundedEditedInTimestamp.getUTCMinutes(), roundedEditedInTimestamp.getUTCSeconds()));

    if (timecard.editedOutTimestamp) {
      var roundedEditedOutTimestamp = datetimeutil.roundDown(timecard.editedOutTimestamp, config.roundMinutes);
      timecard.editedOutTimestamp = new Date(Date.UTC(roundedEditedOutTimestamp.getUTCFullYear(), roundedEditedOutTimestamp.getUTCMonth(), roundedEditedOutTimestamp.getUTCDate(), roundedEditedOutTimestamp.getUTCHours(), roundedEditedOutTimestamp.getUTCMinutes(), roundedEditedOutTimestamp.getUTCSeconds()));;
    }

    var actualRestHours = Math.floor(timecard.actualRestHours);
    var actualRestMinutes = Math.floor((timecard.actualRestHours - actualRestHours) * 60);
    var actualRestTimestamp = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), actualRestHours, actualRestMinutes, 0);

    var editedRestHours = Math.floor(timecard.editedRestHours);
    var editedRestMinutes = Math.floor((timecard.editedRestHours - editedRestHours) * 60);

    var editedRestTimestamps = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), editedRestHours, editedRestMinutes, 0));
    var editedRestTimestamp = datetimeutil.roundDown(editedRestTimestamps);

    // 労働時間(分)を計算する
    if (results.attendanceLog) {
      timecard.attendanceType = results.attendanceLog.attendanceType;
    }
    var workMinutes = timecard.getWorkMinutes(attendanceInCut);
    var workTimeString = Math.floor(workMinutes / 60) + ':' + ('0' + workMinutes % 60).slice(-2);

    var baseWorkMinutes;
    if (timecard.editedOutTimestamp == null) {
      baseWorkMinutes = timecard.getWorkMinutes(attendanceInCut);
    } else {
      baseWorkMinutes = timecard.getWorkMinutes(attendanceInCut);
    }
    //出勤時間より小さい場合、退勤時間を出勤時間に合わせる
    if (timecard.editedInTimestamp > timecard.editedOutTimestamp) {
      logger.info('[createTimecardRow] 出勤時間より小さい場合、退勤時間を出勤時間に合わせる');
      logger.info('[createTimecardRow] timecard : ' + timecard);
      timecard.editedOutTimestamp = timecard.editedInTimestamp
    }

    callback({
      id: timecard._id,
      year: timecard.year,
      month: timecard.month,
      day: timecard.day,
      user: timecard.user,
      userId: timecard.userId,
      matter: timecard.matter,
      matterId: timecard.matterId,
      actualMatter: timecard.actualMatter,
      actualMatterId: timecard.actualMatterId,
      baseWorkMinutes: baseWorkMinutes,
      workTimeString: workTimeString,
      actualInTimestamp: timecard.actualInTimestamp,
      actualOutTimestamp: timecard.actualOutTimestamp,
      actualRestTimestamp: actualRestTimestamp,
      editedInTimestamp: timecard.editedInTimestamp,
      editedOutTimestamp: timecard.editedOutTimestamp,
      editedRestTimestamp: editedRestTimestamp,
      editedInTimestampSaved: timecard.editedInTimestamp,
      editedOutTimestampSaved: timecard.editedOutTimestamp,
      editedRestTimestampSaved: editedRestTimestamp,
      modified: modified,
      reasonOfEditing: timecard.reasonOfEditing,
      isManualAdded: timecard.isManualAdded,
    });
  });
};

// タイムカードの一覧を返す (GET /viewapi/timecard.json)
exports.get = function (req, res) {
  var loginuser = req.user;

  validator(req).checkQuery('userId').nullable().isInt();
  validator(req).checkQuery('year').nullable().isInt();
  validator(req).checkQuery('month').nullable().isInt();
  validator(req).checkQuery('min').nullable().isInt();

  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({
      validateErrors: validateErrors
    });
    res.status(400);
    return res.json(validateErrors);
  }

  var workdate = datetimeutil.workdate();

  var min = req.query.min ? parseInt(req.query.min) : config.roundMinutes;
  var reqParams = {
    userId: req.query.userId ? parseInt(req.query.userId) : loginuser.id,
    year: req.query.year ? parseInt(req.query.year) : workdate.year,
    month: req.query.month ? parseInt(req.query.month) : workdate.month,
    day: req.query.day ? parseInt(req.query.day) : workdate.day,
    min: _.contains(RoundMinutes, min) ? min : config.roundMinutes,
  };

  var workstartdate = datetimeutil.workstartdate();
  workstartdate.setUTCDate(1);
  // タイムゾーン考慮がないのでとりあえず1日足す FIXME タイムゾーンの考慮

  async.waterfall([
    function (callback) {
      async.parallel({
        user: function (callback) {
          User.findOne({
            id: reqParams.userId
          }).exec(callback);
        },
        timecards: function (callback) {
          var condition = {
            userId: reqParams.userId,
            year: reqParams.year,
            month: reqParams.month,
            day: reqParams.day,
          };
          Timecard.find(condition)
            .sort({
              day: 1,
              editedInTimestamp: 1
            })
            .exec(callback);
        },
      }, function (err, results) {
        callback(err, results);
      });
    },
    function (results, callback) {
      async.parallel({
        user: function (callback) {
          callback(null, results.user);
        },
        permission: function (callback) {
          attendance_logic.getUserPermissions(req.user._id, results.user._id, callback);
        },
        timecards: function (callback) {
          callback(null, results.timecards);
        },
        attendanceLog: function (callback) {
          var condition = {
            userId: reqParams.userId,
            year: reqParams.year,
            month: reqParams.month,
            day: reqParams.day,
          };
          AttendanceLog.findOne(condition).populate('attendanceType').exec(function (err, attendanceLog) {
            callback(err, attendanceLog);
          });
        },
        workMinutesInDay: function (callback) {
          var user = results.user;
          var timecards = results.timecards;
          var condition = {
            userId: reqParams.userId,
            year: reqParams.year,
            month: reqParams.month,
            day: reqParams.day,
          };
          AttendanceLog.findOne(condition).populate('attendanceType').exec(function (err, attendanceLog) {
            if (attendanceLog) {
              var condition = {
                user: results.user._id,
                year: reqParams.year,
                month: reqParams.month,
              };
              AttendanceInCut.findOne(condition, function (err, attendanceInCut) {
                attendanceLog.getWorkMinutesInDay(attendanceInCut, timecards, false, function (err, workMinutes) {
                  callback(err, workMinutes);
                });
              });
            } else {
              callback(err, 0);
            }
          });
        },
        matters: function (callback) {
          var targetDate = new Date(reqParams.year, reqParams.month - 1, reqParams.day);
          var conditions = {
            contractStart: {
              $lte: targetDate
            },
            contractEnd: {
              $gte: targetDate
            },
            resources: {
              $elemMatch: {
                user: results.user._id
              }
            }
          };
          var matterArray = [];
          Matter.find(conditions, function (err, matters) {
            async.eachSeries(matters, function (matter, callback) {
              matterArray.push(matter);
              callback();
            }, function (err, results) {
              callback(err, matterArray);
            });
          });
        },
      }, function (err, results) {
        callback(err, results);
      });
    },
  ], function (err, results) {
    // タイムカード一覧の取得
    if (!err) {
      var user = results.user;
      var timecards = [];

      // 自分の勤務表でなく、かつどの権限も持っていない場合はエラー（閲覧不可）
      if (!req.user.equals(user) &&
        !req.user.admin &&
        !req.user.top &&
        !results.permission.middle &&
        !results.permission.better &&
        !results.permission.admin) {
        res.status(403);
        return res.json(validateErrors);
      }

      async.eachSeries(results.timecards, function (timecard, callback) {
        createTimecardRow(timecard, reqParams, timecard.day, function (row) {
          timecards.push(row);
          callback();
        });
      }, function (err, eachResults) {
        return res.json({
          timecards: timecards,
          matters: results.matters,
          sumWorkMinutes: results.workMinutesInDay,
          attendanceLogSaved: results.attendanceLog,
        });
      });
    } else {
      logger.error(err);
      res.status(500);
      res.send(err);
    }
  });
};

// 分割勤務表申請 (POST /viewapi/timecard.json)
exports.post = function (req, res) {
  var reqTimecards = JSON.parse(req.body.timecards);
  var reqAttendanceLog = JSON.parse(req.body.attendanceLog);
  reqAttendanceLog['reasonOfEditing'] = req.body.reasonOfEditing;
  var clearTimecardIds = req.body.clearTimecardIds;
  var loginUserObjId = req.body.loginUser;
  var user;
  var removeAttendanceLog = false;

  // Validation
  var validate = function () {
    for (var i in reqTimecards) {
      var inTime = (new Date(reqTimecards[i].editedInTimestamp)).getTime();
      if (isNaN(inTime) || inTime == 0) {
        return false;
      }
      var outTime = (new Date(reqTimecards[i].editedOutTimestamp)).getTime();
      if (isNaN(outTime) || outTime == 0) {
        return false;
      }
      var restTime = (new Date(reqTimecards[i].editedRestTimestamp)).getTime();
      if (isNaN(restTime)) {
        return false;
      }
    }
    return true;
  };

  if (!validate()) {
    res.status(400);
    return res.json({
      errors: ['不正な入力値です']
    });
  }

  async.waterfall([
    // User取得
    function (callback) {
      User.findOne({
        id: req.body.userId
      }, function (err, findUser) {
        user = findUser;
        callback(err);
      });
    },
    // Timecardを更新
    function (callback) {
      async.each(reqTimecards, function (reqTimecard, callback) {
        // リセット対象Timecardは更新対象から除外
        if (clearTimecardIds.indexOf(reqTimecard.id) >= 0) {
          callback();
          return;
        }
        // Timecard更新
        attendance_logic.updateTimecard(user, loginUserObjId, reqTimecard.id, reqTimecard, callback);
      }, callback);
    },
    // Timecardをリセット
    function (callback) {
      // リセット対象Timecardがなければ終了
      if (!clearTimecardIds) {
        callback();
        return;
      }
      // Timecardリセット
      async.each(clearTimecardIds, function (id, callback) {
        attendance_logic.clearTimecard(user, loginUserObjId, id, callback);
      }, callback);
    },
    // AttendanceLogを更新
    function (callback) {
      attendance_logic.updateAttendanceLog(
        user,
        loginUserObjId,
        reqAttendanceLog,
        callback);
    },
  ], function (err, attendanceLog) {
    if (err) {
      logger.error(err);
      res.status(500);
      return res.json(err);
    }

    // レスポンス情報取得
    async.parallel({
      timecards: function (callback) {
        Timecard.find({
          user: user._id,
          year: reqAttendanceLog.year,
          month: reqAttendanceLog.month,
          day: reqAttendanceLog.day,
        }, callback);
      },
      attendanceInCut: function (callback) {
        AttendanceInCut.findOne({
          user: user._id,
          year: reqAttendanceLog.year,
          month: reqAttendanceLog.month,
        }, callback);
      },
      restDate: function (callback) {
        attendanceLog.getRestHours(function (restHours) {
          var h = Math.floor(restHours);
          var m = Math.round((restHours - h) * 60);
          var restDates = new Date(1970, 0, 1, h, m, 0);
          var restDate = datetimeutil.roundDown(restDates);
          callback(null, restDate);
        });
      },
      modified: function (callback) {
        attendanceLog.timeModified(callback);
      }
    }, function (err, results) {
      if (err) {
        logger.error(err);
        res.status(500);
        return res.json(err);
      }

      attendanceLog.getWorkMinutesInDay(
        results.attendanceInCut,
        results.timecards,
        false,
        function (err, workMinutes) {

          if (err) {
            logger.error(err);
            res.status(500);
            return res.json(err);
          }

          // レスポンス
          res.status(200);
          return res.json({
            attendanceLog: JSON.stringify(attendanceLog),
            removeAttendanceLog: attendanceLog.isRemoved,
            isValidWorkTime: attendanceLog.isValidWorkTime(),
            workTimeString: Math.floor(workMinutes / 60) + ':' + ('0' + workMinutes % 60).slice(-2),
            workMinutes: workMinutes,
            restDate: results.restDate,
            modified: results.modified,
          });
        });
    });
  });
};
