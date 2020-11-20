'use strict';

var mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Schema = mongoose.Schema,
    async = require('async'),
    datetimeutil = require('../utils/datetimeutil'),
    middlewareLogic = require('../logics/models/passHistory.mw'),
    logic = require('../logics/pass_histories_logic'),
    config = require('../config/environment');
require('date-utils');

var OpenEvents = [
  'unknown',
  'nfc',
  'mobile',
];

var Results = [
  'allow',
  'deny',
  'error',
];
/**
 * Thing Schema
 */
var schema = new Schema({
  type: { type: String, required: true, enum: logic.passType, },
  result: { type: String, required: true, enum: Results, },
  openEvent: { type: String, required: true, enum: OpenEvents, },
  unit: { type: String, required: false },
  deviceToken: { type: String, required: false },
  device: { type:Schema.ObjectId, required: false, ref:'Device' },
  nfcNumber: { type: String, required: false },
  nfc: { type:Schema.ObjectId, required: false },
  userId: { type: Number, required: false },
  user: { type:Schema.ObjectId, required: false, ref:'User' },
  matterId: { type: Number, required: false },
  matter: { type:Schema.ObjectId, required: false, ref:'Matter' },
  doorKey: { type: String, required: false },
  door: { type:Schema.ObjectId, required: false, ref:'Door' },
  message: { type: String, required: false },
  timestamp: {type:Date, required: true, default: Date.now },
  createdAt: {type:Date, required: false, default: Date.now },
  location: {type: [Number], index: '2d'}
});

var errorLog = function (err) {
  if (err) {
    logger.error(err);
  }
};

var saveAttendanceLog = function (model, callback) {
  if (!callback || typeof(callback) != 'function') {
    callback = null;
  }
  // リトライ処理
  async.retry(3, function (callback) {
    middlewareLogic.saveAttendanceLogOnce(model, function (err) {
      callback(err);
    });
  }, function (err) {
    if (callback) {
      callback(err, model);
    } else {
      if (err) {
        logger.error(err);
      }
    }
  });
};

schema.methods.saveAttendanceLog = function (model, callback) {
  return saveAttendanceLog(model, callback);
};

var saveTimecard = function (model, callback) {
  if (!callback || typeof(callback) != 'function') {
    callback = null;
  }
  var User = mongoose.model('User');
  var Timecard = mongoose.model('Timecard');
  var AttendanceInCut = mongoose.model('AttendanceInCut');

  if (!model.userId) {
    logger.error('pass_histories userId not exists.');
    return;
  }

  var passDate     = new Date(model.timestamp.getTime() - config.offsetInDayTimestamp);
  var workdate     = datetimeutil.workdate(passDate);
  var prevWorkdate = datetimeutil.workdate(passDate, {d:-1});

  async.waterfall([
    function (callback) {
      User.findOne({id: model.userId}).exec(function(err, user) {
        callback(err, user);
      });
    },
    function (user, callback) {
      async.parallel({
        user: function (callback) {
          callback(null, user);
        },
        timecard: function (callback) {
          Timecard.findOne({
            userId:             model.userId,
            matterId:           model.matterId,
            year:               workdate.year,
            month:              workdate.month,
            day:                workdate.day,
          }).exec(callback);
        },
        timecardsOtherMatter: function (callback) {
          Timecard.find({
            userId:   model.userId,
            matterId: { $ne: model.matterId },
            year:     workdate.year,
            month:    workdate.month,
            day:      workdate.day,
          }).exec(callback);
        },
        timecardInProgress: function (callback) {
          Timecard.findOne({
            userId:             model.userId,
            matterId:           model.matterId,
            year:               workdate.year,
            month:              workdate.month,
            day:                workdate.day,
            actualOutTimestamp: null
          }).exec(callback);
        },
        timecardInProgressPrev: function (callback) {
          Timecard.findOne({
            userId:             model.userId,
            matterId:           model.matterId,
            year:               prevWorkdate.year,
            month:              prevWorkdate.month,
            day:                prevWorkdate.day,
            actualOutTimestamp: null
          }).exec(callback);
        },
        timecardInProgressOtherMatter: function (callback) {
          Timecard.findOne({
            userId:             model.userId,
            matterId:           { $ne: model.matterId },
            year:               workdate.year,
            month:              workdate.month,
            day:                workdate.day,
            actualOutTimestamp: null
          }).exec(callback);
        },
        attendanceInCut: function (callback) {
          var conditions = {
            user:  user._id,
            year:  workdate.year,
            month: workdate.month,
          };
          AttendanceInCut.findOne(conditions)
            .populate('matter')
            .exec(function (err, attendanceInCut) {
              if (err) {
                callback(err);
              }
              // 打刻時刻補正情報がアクティブでない
              if (!attendanceInCut || !attendanceInCut.isActive()) {
                attendanceInCut = null;
              }
              callback(null, attendanceInCut);
            });
        },
      }, function (err, data) {
        if (err) {
          // エラーがあればロギング
          logger.error(err);
          if (callback) {
            callback(err);
          }
          return;
        }
        if (!data.user) {
          logger.info('user not exists.');
          // ユーザーが存在しなければ何もしない
          if (callback) {
            callback();
          }
          return;
        }

        var user = data.user;
        var attendanceInCut = data.attendanceInCut;
        var timecard = data.timecard;
        var timecardsOtherMatter = data.timecardsOtherMatter;
        var timecardInProgress = data.timecardInProgress;
        var timecardInProgressPrev = data.timecardInProgressPrev;
        var timecardInProgressOtherMatter = data.timecardInProgressOtherMatter;

        // 許可されたpassHistoryのみを取り扱う
        if (model.result === 'allow') {

          // 退勤打刻(当日中)
          if (model.type == 'manual_leave' || model.type == 'leave') {
            logger.debug('タイムカード 手動退勤');

            // 当日内に出勤/退勤するケース
            // (日付が変わる前に出勤/退勤打刻)
            if (timecard) {
              leaveTimecard(model, timecard, timecardInProgress, user, callback);
            }
            // 出勤/退勤が日付を跨ぐケース
            // (日付が変わる前に出勤打刻し、日付が変わってから退勤打刻)
            else if (timecardInProgressPrev) {
              leaveTimecard(model, timecardInProgressPrev, null, user, callback);
            }
            // 上記以外は更新なし
            else {
              if (callback) {
                callback();
              }
            }
          }
          // 夜勤退勤打刻
          else if (model.type == 'manual_night_leave') {
            logger.debug('タイムカード 手動夜勤退勤');

            // 翌日以降に(日付が変わってから)出勤打刻された勤怠を前日の夜勤勤怠に含めるケース
            // (日付が変わってから出勤/退勤打刻)
            if (attendanceInCut.isNightShift &&
                isLastDayTimecard(model, timecardInProgress, timecardInProgressPrev, attendanceInCut)) {
              // 打刻当日の勤怠を前日の退勤扱いとするため当日のタイムカードを前日のものに更新
              timecardInProgress = modifyTimecardToLastDay(timecardInProgress);
              leaveNightTimecard(model, timecardInProgress, timecardInProgressPrev, user, attendanceInCut, callback);
            } else {
              // 出勤/退勤が日付を跨ぐケース
              // (日付が変わる前に出勤打刻し、日付が変わってから退勤打刻)
              if (timecardInProgressPrev) {
                leaveNightTimecard(model, timecardInProgress, timecardInProgressPrev, user, attendanceInCut, callback);
              }
              // 当日内に出勤/退勤するケース
              // (日付が変わる前に出勤/退勤打刻)
              else {
                leaveTimecard(model, timecard, timecardInProgress, user, callback);
              }
            }
          }
          // 出勤打刻
          else if (model.type == 'manual_enter' || model.type == 'enter') {
            logger.debug('タイムカード 手動出勤');
            enterTimecard(model, timecard, timecardsOtherMatter, timecardInProgressOtherMatter, user, attendanceInCut, callback);
          }
          // pass_type 明確指定なし
          else if (!model.type || model.type == 'unknown') {

            // 退勤打刻(当日中)
            if (timecard) {
              logger.debug('タイムカード 自動退勤');
              leaveTimecard(model, timecard, timecardInProgress, user, callback);
            }
            // 夜勤退勤打刻
            else if (timecardInProgressPrev) {
              logger.debug('タイムカード 自動夜勤退勤');
              leaveTimecard(model, timecardInProgressPrev, null, user, callback);
            }
            // 出勤打刻
            else {
              logger.debug('タイムカード 自動出勤');
              enterTimecard(model, timecard, timecardsOtherMatter, timecardInProgressOtherMatter, user, attendanceInCut, callback);
            }

          } else {
            logger.error('invalid model type.');
            if (callback) {
              callback();
            }
          }

        } else {
          logger.info('not allowed.');
          if (callback) {
            callback();
          }
        }
      });
    },
  ], callback);
};

var enterTimecard = function(model, timecard, timecardsOtherMatter, timecardInProgressOtherMatter, user, attendanceInCut, callback) {

  var Timecard = mongoose.model('Timecard');

  async.series([
    function(callback) {
      if (timecardInProgressOtherMatter) {
        leaveTimecard(model, timecardInProgressOtherMatter, null, user, callback);
      } else {
        callback();
      }
    },
  ], function(err, results) {
    var workdate = datetimeutil.workdate(model.timestamp);

    // 案件に紐づくタイムカードが存在する場合は、勤怠データを生成しない
    if (timecardsOtherMatter.length > 0) {
      logger.info('skip create timecard');
      logger.info(model.matterId);
      logger.info(timecardsOtherMatter);
      callback();
      return;
    }

    if (!timecard) {
      logger.info('A new time card will be created.');
      var timecardDocument = new Timecard({
        userId:              user.id,
        matterId:            model.matterId,
        matter:              model.matter,
        actualMatterId:      model.matterId,
        actualMatter:        model.matter,
        user:                user,
        year:                workdate.year,
        month:               workdate.month,
        day:                 workdate.day,
        actualInTimestamp:   model.timestamp,
        editedInTimestamp:   model.timestamp
      });
      timecardDocument.modifyInTimestamp(workdate, attendanceInCut);
      timecardDocument.save(function(err, timecard) {
        timecard.updateRestHours('enter', callback);
      });
    }
  });
}

var leaveTimecard = function(model, timecard, timecardInProgress, user, callback) {

  var Timecard = mongoose.model('Timecard');
  if (timecardInProgress) {
    // 進行中タイムカードがあれば優先して更新
    logger.info('Update "actualOutTimestamp".');
    timecardInProgress.actualOutTimestamp = model.timestamp;
    timecardInProgress.editedOutTimestamp = model.timestamp;
    timecardInProgress.save(function(err, timecard) {
      timecard.updateRestHours('leave', callback);
    });

  } else if (timecard) {
    // 退室時刻を更新する
    logger.info('Update "actualOutTimestamp".');
    timecard.actualOutTimestamp = model.timestamp;
    timecard.editedOutTimestamp = model.timestamp;
    timecard.save(function(err, timecard) {
      timecard.updateRestHours('leave', callback);
    });
  } else {
    // 進行中のタイムカードがないときは「退室」しようがないので何もしない
    logger.info('No time card in progress was found.');
    if (callback) {
      callback();
    }
  }
}

var leaveNightTimecard = function(model, timecardInProgress, timecardInProgressPrev, user, attendanceInCut, callback) {
  var Timecard = mongoose.model('Timecard');
  // 前日の進行中タイムカードがあれば優先して更新
  if (timecardInProgressPrev) {
    timecardInProgressPrev.actualOutTimestamp = model.timestamp;
    timecardInProgressPrev.editedOutTimestamp = model.timestamp;
    timecardInProgressPrev.save(function(err, timecard) {
      timecard.updateRestHours('night_leave', callback);
    });
  }
  //  当日の進行中タイムカードがあれば前日のタイムカードに書き換えて更新
  else if (timecardInProgress) {
    timecardInProgress.actualOutTimestamp = model.timestamp;
    timecardInProgress.editedOutTimestamp = model.timestamp;
    timecardInProgress.save(function(err, timecard) {
      timecard.updateRestHours('night_leave', callback);
    });
  }
}

/**
 * 翌日以降に(日付が変わってから)出勤打刻された勤怠を前日の夜勤勤怠扱いとするかを返却
 *
 */
var isLastDayTimecard = function(model, timecardInProgress, timecardInProgressPrev, attendanceInCut) {
  if (attendanceInCut.isNightShift && !timecardInProgressPrev && timecardInProgress) {
    var workdate       = datetimeutil.workdate(model.timestamp);
    var outTimestamp   = attendanceInCut.getDate(workdate, 'outTimeNight').getTime();
    var zeroTimestamp  = (new Date(workdate.year, workdate.month-1, workdate.day)).getTime();
    var logInTimestamp = timecardInProgress.actualInTimestamp.getTime();
    if (logInTimestamp >= zeroTimestamp && logInTimestamp < outTimestamp) {
      return true;
    }
  }
  return false;
}

var modifyTimecardToLastDay = function(timecardInProgress) {
  var prevDate = new Date(timecardInProgress.year, timecardInProgress.month, timecardInProgress.day);
  prevDate.addDays(-1);

  timecardInProgress.year  = prevDate.getFullYear();
  timecardInProgress.month = prevDate.getMonth();
  timecardInProgress.day   = prevDate.getDate();

  return timecardInProgress;
}

schema.methods.saveTimecard = function (model, callback) {
  return saveTimecard(model, callback);
};

schema.post('save', saveAttendanceLog);
schema.post('save', saveTimecard);

mongoose.model('PassHistory', schema);
