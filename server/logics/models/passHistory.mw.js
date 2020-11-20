'use strict';

var config = require('../../config/environment');
var mongoose = require('mongoose');
var logger = log4js.getLogger();
var async = require('async');
var _ = require('lodash');
var datetimeutil = require('../../utils/datetimeutil');

/**
 * PassHistoryがsaveされたときに実行するmiddlewareの関数
 * 受け取ったPassHistoryを元に、AttendanceLogの生成・更新を実行する。
 * @param {PassHistory} model passHistory
 * @param {Function} done コールバック関数
 */
var saveAttendanceLogOnce = function (model, done) {
  var User = mongoose.model('User');
  var AttendanceLog = mongoose.model('AttendanceLog');
  var Timecard = mongoose.model('Timecard');
  var AttendanceType = mongoose.model('AttendanceType');
  var AttendanceInCut = mongoose.model('AttendanceInCut');
  if (!model.userId) {
    done();
    return;
  }

  // 当日および前日の勤務日を取得
  var passDate     = new Date(model.timestamp.getTime() - config.offsetInDayTimestamp);
  var workdate     = datetimeutil.workdate(passDate);
  var prevWorkdate = datetimeutil.workdate(passDate, {d: -1});

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
        log: function (callback) {
          AttendanceLog.findOne({
            userId: model.userId,
            year:   workdate.year,
            month:  workdate.month,
            day:    workdate.day,
          }).populate('attendanceType').exec(callback);
        },
        prevLog: function (callback) {
          AttendanceLog.findOne({
            userId: model.userId,
            year:   prevWorkdate.year,
            month:  prevWorkdate.month,
            day:    prevWorkdate.day,
          }).populate('attendanceType').exec(callback);
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
        preSavedLog: function (callback) {
          AttendanceLog.findOne({
            userId: model.userId,
            year:   workdate.year,
            month:  workdate.month,
            day:    workdate.day,
            $or: [
              {autoInTimestamp:  model.timestamp},
              {autoOutTimestamp: model.timestamp},
            ],
          }, function(err, preSavedAttendanceLog) {
            if (preSavedAttendanceLog) {
              preSavedAttendanceLog.save(callback);
            } else {
              callback();
            }
          });
        },
        attendanceTypes: function (callback) {
          AttendanceType.find({}).exec(function(err, findAttendanceTypes) {
            // 勤怠区分(attendanceType)を name をキーとした配列に格納
            var attendanceTypes = [];
            for (var i in findAttendanceTypes) {
              attendanceTypes[findAttendanceTypes[i].name] = findAttendanceTypes[i];
            }
            callback(null, attendanceTypes);
          });
        },
        attendanceInCut: function (callback) {
          var conditions = {
            user:     user._id,
            year:     workdate.year,
            month:    workdate.month,
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
          logger.error(err);
          callback(err);
          return;
        }
        if (!data.user) {
          logger.error('user取得失敗');
          callback('user取得失敗');
          return;
        }
        if (!data.attendanceTypes) {
          logger.error('attendanceType取得失敗');
          callback('attendanceType取得失敗');
          return;
        }
        // 打刻アプリによる二回目の打刻の場合は pass_histories の更新のみ
        if (data.preSavedLog) {
          logger.info('同一時刻による打刻(打刻アプリによる二回目の打刻)のため勤怠データ更新スキップ');
          callback();
          return;
        }


        // 退勤打刻(当日中)
        if (model.type == 'manual_leave' || model.type == 'leave') {
          logger.info('手動退勤');

          // 当日内に出勤/退勤するケース
          // (日付が変わる前に出勤/退勤打刻)
          if (data.log) {
            registLeave(data, model, callback);
          }
          // 出勤/退勤が日付を跨ぐケース
          // (日付が変わる前に出勤打刻し、日付が変わってから退勤打刻)
          else if (data.prevLog && data.timecardInProgressPrev) {
            registNightLeave(data, model, callback);
          }
          // 上記以外は更新なし
          else {
            callback();
          }

        // 夜勤退勤打刻
        } else if (model.type == 'manual_night_leave') {
            logger.info('手動夜勤退勤');

            // 翌日以降に(日付が変わってから)出勤打刻された勤怠を前日の夜勤勤怠に含めるケース
            // (日付が変わってから出勤/退勤打刻)
            if (data.attendanceInCut && data.attendanceInCut.isNightShift && isLastDayAttendance (data, model)) {
              // 打刻当日の勤怠を前日の退勤扱いとするため当日の勤怠を削除
              data.log.remove();
              registNightLeave(data, model, callback);
            }
            else {
              // 出勤/退勤が日付を跨ぐケース
              // (日付が変わる前に出勤打刻し、日付が変わってから退勤打刻)
              if (data.prevLog && data.timecardInProgressPrev) {
                registNightLeave(data, model, callback);
              }
              // 当日内に出勤/退勤するケース
              // (日付が変わる前に出勤/退勤打刻)
              else if (data.log) {
                registLeave(data, model, callback);
              }
              // 上記以外は更新なし
              else {
                callback();
              }
            }

        // 出勤打刻
        } else if (model.type == 'manual_enter' || model.type == 'enter') {
          logger.info('手動出勤');
          registEnter(data, model, callback);

        // pass_type 明確指定なし
        } else if (!model.type || model.type == 'unknown') {

          // 初期登録された休日データには、inTimestamp, autoInTimestamp に、勤務日の 0:00:00.000 時刻が格納される
          // このデータに対して打刻した際に、まだ勤怠データが存在していない場合と同等の扱いとする
          // (autoInTimestamp は、サーバー再起動時の補完処理によって、inTimestamp がコピーされた場合に上記の値となる)
          // (config/upgradedata/main.js)
          var zero = new Date(workdate.year, workdate.month-1, workdate.day);
          // 退勤打刻(当日中)
          if (data.log && data.log.autoInTimestamp &&
              data.log.autoInTimestamp.getTime() != zero.getTime()) {
            logger.info('自動退勤');
            registLeave(data, model, callback);
          }
          // 夜勤退勤打刻
          else if (data.prevLog && data.timecardInProgressPrev) {
            logger.info('自動夜勤退勤');
            registNightLeave(data, model, callback);
          }
          // 出勤打刻
          else {
            logger.info('自動出勤');
            registEnter(data, model, callback);
          }

        } else {
          logger.error('打刻失敗');
          callback();
          return;
        }
      });
    },
  ], done);
};

var registLeave = function(data, model, done) {
  var workdate = datetimeutil.workdate(model.timestamp);
  var attendanceTypes = data.attendanceTypes;
  var attendanceInCut = data.attendanceInCut;
  var log = data.log;

  // save 不要ならスキップ
  if (!log.needSave(model.timestamp)) {
    logger.info('打刻時刻が出勤時刻以降、もしくは退勤時刻以前のため勤怠データ更新をスキップ');
    return done();
  }

  // timestamp 更新
  log.setTimestamp(model.timestamp, 'leave');

  // 勤怠区分登録
  log.setAttendanceType(attendanceInCut, attendanceTypes, 'leave');

  // 更新日時更新
  log.updated = Date.now();

  logger.debug('save attendanceLog -> ' + log);
  log.save(done);
};

var registNightLeave = function(data, model, done) {
  var AttendanceLog = mongoose.model('AttendanceLog');
  var Timecard = mongoose.model('Timecard');
  var workdate     = datetimeutil.workdate(model.timestamp);
  var attendanceTypes = data.attendanceTypes;
  var attendanceInCut = data.attendanceInCut;
  var prevLog = data.prevLog;

  // save 不要ならスキップ
  if (!prevLog.needSave(model.timestamp)) {
    logger.info('打刻時刻が出勤時刻以降、もしくは退勤時刻以前のため勤怠データ更新をスキップ');
    return done();
  }

  // timestamp 更新
  prevLog.setTimestamp(model.timestamp, 'leave');

  async.waterfall([
    function(callback) {
      prevLog.getWorkMinutesInDay(attendanceInCut, null, true, callback);
    },
    function(prevWorkMinutes, callback) {
      // 勤怠区分登録
      prevLog.setAttendanceType(attendanceInCut, attendanceTypes, 'night_leave');

      // 休日/特別休 データを生成
      if (attendanceInCut) {
        var holiday = {
          userId:       data.user.id,
          user:         data.user,
          year:         workdate.year,
          month:        workdate.month,
          day:          workdate.day,
          inTimestamp:  model.timestamp,
          outTimestamp: model.timestamp,
        };

        if (attendanceInCut.isNightShift) {
          // 休日データ新規作成
          var holidayLog = new AttendanceLog(holiday);
          holidayLog.attendanceType = attendanceTypes['休日']._id;
          holidayLog.updated = Date.now();
          logger.debug('save holidayLog -> ' + holidayLog);
          holidayLog.save(callback);

        } else {
          // 勤務時間7.5H以上で翌日を特別休とする
          var workHours = (prevWorkMinutes / 60);
          if (workHours >= config.dayWorkerHour) {
            // 特別休データ新規作成
            var holidayLog = new AttendanceLog(holiday);
            holidayLog.attendanceType = attendanceTypes['特別休']._id;
            holidayLog.updated = Date.now();
            logger.debug('save holidayLog -> ' + holidayLog);
            holidayLog.save(callback);

          } else {
            callback();
          }
        }
      } else {
        callback();
      }
    }
  ], function(err, results) {
    // 更新日時更新
    prevLog.updated = Date.now();
    logger.debug('save previous attendanceLog -> ' + prevLog);
    prevLog.save(done);
  });
};

var registEnter = function(data, model, done) {
  var AttendanceLog = mongoose.model('AttendanceLog');
  var attendanceTypes = data.attendanceTypes;
  var attendanceInCut = data.attendanceInCut;
  var timecardsOtherMatter = data.timecardsOtherMatter;
  var workdate = datetimeutil.workdate(model.timestamp);
  var log = data.log;

  // 案件がNULLのタイムカードと、案件に紐づくタイムカードの混合を許容しない
  if (timecardsOtherMatter.length > 0) {
    logger.info('skip create attendanceLog');
    logger.info(model.matterId);
    logger.info(timecardsOtherMatter);
    done();
    return;
  }

  if (!log) {
    log = new AttendanceLog({
      userId:       data.user.id,
      user:         data.user,
      year:         workdate.year,
      month:        workdate.month,
      day:          workdate.day,
    });
  }

  // timestamp 更新
  log.setTimestamp(model.timestamp, 'enter');

  // 始業時刻設定
  log.modifyInTimestamp(workdate, attendanceInCut);
  if (log.outTimestamp == null) {
    log.outTimestamp = log.inTimestamp;
  }

  // 勤怠区分登録
  log.setAttendanceType(attendanceInCut, attendanceTypes, 'enter');

  // 当日打刻データを更新
  log.updated = Date.now();
  logger.debug('save attendanceLog -> ' + log);
  log.save(done);
};

/**
 * 翌日以降に(日付が変わってから)出勤打刻された勤怠を前日の夜勤勤怠扱いとするかを返却
 *
 */
var isLastDayAttendance = function(data, model, done) {
  var log = data.log;
  var attendanceInCut = data.attendanceInCut;
  var timecardInProgress     = data.timecardInProgress;
  var timecardInProgressPrev = data.timecardInProgressPrev;
  var workdate     = datetimeutil.workdate(model.timestamp);

  // 翌日に出勤打刻している勤怠に対して、前日の勤怠扱いとするため削除する
  if (log) {
    if (attendanceInCut.isNightShift && !timecardInProgressPrev && timecardInProgress) {
      var outTimestamp = attendanceInCut.getDate(workdate, 'outTimeNight').getTime();
      var zeroTimestamp  = (new Date(workdate.year, workdate.month-1, workdate.day)).getTime();
      var logInTimestamp = log.inTimestamp.getTime();
      if (logInTimestamp >= zeroTimestamp && logInTimestamp < outTimestamp) {
        logger.debug('log deleted: ' + log.day);
        return true;
      }
    }
  }

  return false;
}

module.exports = {
  saveAttendanceLogOnce: saveAttendanceLogOnce
};
