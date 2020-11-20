'use strict';

var mongoose = require('mongoose');
var logger = log4js.getLogger();
var Schema = mongoose.Schema;
var datetimeutil = require('../utils/datetimeutil');
var workReport = require('../utils/workReport');
var _ = require('lodash');
var Koyomi = require('koyomi');
var moment = require('moment');
var async = require('async');
var config = require('../config/environment');
var AttendanceLog = mongoose.model('AttendanceLog');
var RestTime = mongoose.model('RestTime');

/**
 * Thing Schema
 */
var schema = new Schema({
  userId: {
    type: Number,
    required: true
  },
  user: {
    type: Schema.ObjectId,
    required: true,
    ref: 'User'
  },
  matterId: {
    type: Number,
    required: false
  },
  matter: {
    type: Schema.ObjectId,
    required: false,
    ref: 'Matter'
  },
  actualMatterId: {
    type: Number,
    required: false
  },
  actualMatter: {
    type: Schema.ObjectId,
    required: false,
    ref: 'Matter'
  },
  year: {
    type: Number,
    required: true
  },
  month: {
    type: Number,
    required: true
  },
  day: {
    type: Number,
    required: true
  },
  actualInTimestamp: {
    type: Date,
    required: true
  },
  actualOutTimestamp: {
    type: Date,
    required: false
  },
  actualRestHours: {
    type: Number,
    required: false
  },
  editedInTimestamp: {
    type: Date,
    required: false
  },
  editedOutTimestamp: {
    type: Date,
    required: false
  },
  editedRestHours: {
    type: Number,
    required: false
  },
  updated: {
    type: Date,
    required: true,
    default: Date.now
  },
  reasonOfEditing: {
    type: String,
    required: false
  },
  isManualAdded: {
    type: Boolean,
    required: false
  },
});

schema.index({
  userId: 1,
  matterId: 1,
  year: 1,
  month: 1,
  day: 1
}, {
  unique: false
});

var defaultCurrentTimestamp = function (next) {
  var model = this;
  if (model.ignoreCurrentTimestamp) {
    next();
    return;
  }
  var now = Date.now();
  var CollectionSummary = mongoose.model('CollectionSummary');
  CollectionSummary.update({
      name: model.collection.name
    }, {
      updated: now
    }, {
      upsert: true
    },
    function (err) {
      if (err) {
        logger.error(err);
        next(err);
      } else {
        model.updated = now;
        next();
      }
    }
  );
};

// 分の切り下げ単位
var roundMinute = 15;

var SECOND_MILLISECOND = 1000;
var MINUTE_MILLISECOND = 60 * SECOND_MILLISECOND;
var HOUR_MILLISECOND = 60 * MINUTE_MILLISECOND;
var DAY_MILLISECOND = 24 * HOUR_MILLISECOND;

// 曜日定義
var weekDays = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 時間外基準時刻を返却
 * @return 時間外基準時刻
 */
schema.methods.getOvertimePivot = function () {
  return new Date(this.year, this.month - 1, this.day, 7, 30, 0);
}

/**
 * 休出基準時刻を返却
 * @return 休出基準時刻
 */
schema.methods.getDayOffPivot = function () {
  return new Date(this.year, this.month - 1, this.day + 1, 0, 0, 0);
}

/**
 * 打刻日付の翌日が休日であるかどうかを返却
 * @return 休日ならば true
 */
schema.methods.isTomorrowHoliday = function () {
  var today = new Date(this.year, this.month - 1, this.day);
  var tomorrow = new Date(today.getTime() + DAY_MILLISECOND);
  var weekDay = weekDays[tomorrow.getDay()];

  if (weekDay === '土' || Koyomi.getHolidayName(tomorrow)) {
    return true;
  } else {
    return false;
  }
}

/**
 * 打刻日付の翌日が法定休日であるかどうかを返却
 * @return 法定休日ならば true
 */
schema.methods.isTomorrowLegalHoliday = function () {
  var today = new Date(this.year, this.month - 1, this.day);
  var tomorrow = new Date(today.getTime() + DAY_MILLISECOND);
  var weekDay = weekDays[tomorrow.getDay()];

  if (weekDay === '日') {
    return true;
  } else {
    return false;
  }
}

/**
 * 主とするタイムカードであるかを判定し自身へ設定する
 *
 * 同一年月日、同一案件のタイムカードが複数存在しする場合
 *   主案件が存在する  : 主案件に紐づくタイムカードのうちeditedInTimestampが最小のものを主とする
 *   主案件が存在しない: タイムカードのうちeditedInTimestampが最小のものを主とする
 *
 * @param timecards 対象のタイムカード群
 * @param matterId  主案件ID
 */
schema.methods.setIsMainTimecard = function (timecards, matterId) {
  var mainMatterTimecard;
  var subMatterTimecard;

  for (var i in timecards) {
    if (timecards[i].matterId == matterId) {
      if (!mainMatterTimecard ||
        mainMatterTimecard.editedInTimestamp.getTime() > timecards[i].editedInTimestamp.getTime()) {
        mainMatterTimecard = timecards[i];
      }
    } else {
      if (!subMatterTimecard ||
        subMatterTimecard.editedInTimestamp.getTime() > timecards[i].editedInTimestamp.getTime()) {
        subMatterTimecard = timecards[i];
      }
    }
  }

  this.isMainTimecard = false;
  if (mainMatterTimecard) {
    if (this._id == mainMatterTimecard._id) {
      this.isMainTimecard = true;
    }
  } else if (subMatterTimecard) {
    if (this._id == subMatterTimecard._id) {
      this.isMainTimecard = true;
    }
  }
}

/**
 * 同日付のタイムカード群の休憩時間(actualRestHours)を更新する
 *
 * 同日付のタイムカードが複数存在する場合は、打刻時点ではいずれか一つのタイムカードに休憩時間を反映する。
 * (主案件の打刻に対して優先的に休憩時間を設定する。)
 * 打刻のたびに、どのタイムカードに休憩時間を反映するべきかが変化するため、同日付のタイムーカードを全て更新する。
 * 但し、ここでは actualRestHours を更新し、値が空の場合を除き、editedRestHours は更新しない。
 * (editedRestHours は、分割勤務表画面から更新される。）
 */
schema.methods.updateRestHours = function (stampType, callback) {
  var User = mongoose.model('User');
  var AttendanceLog = mongoose.model('AttendanceLog');
  var AttendanceInCut = mongoose.model('AttendanceInCut');
  var Timecard = mongoose.model('Timecard');
  var $this = this;

  async.parallel({
    reportType: function (callback) {
      User.findOne({
        _id: $this.user
      }, function (err, user) {
        workReport.getReportType(user, callback);
      });
    },
    attendanceLog: function (callback) {
      AttendanceLog.findOne({
        user: $this.user,
        year: $this.year,
        month: $this.month,
        day: $this.day,
      }).populate('attendanceType').exec(callback);
    },
    attendanceInCut: function (callback) {
      AttendanceInCut.findOne({
        user: $this.user,
        year: $this.year,
        month: $this.month,
      }, callback);
    },
    restTime: function (callback) {
      var date = new Date($this.year, $this.month - 1, $this.day);
      RestTime.findOne({
        user: $this.user,
        'period.start': {
          $lte: date
        },
        'period.end': {
          $gte: date
        },
      }, callback);
    },
  }, function (err, results) {
    var reportType = results.reportType;
    var attendanceLog = results.attendanceLog;
    var attendanceInCut = results.attendanceInCut;
    var restTime = results.restTime;

    var mainMatterId;
    if (attendanceInCut && attendanceInCut.matterId) {
      mainMatterId = attendanceInCut.matterId;
    }
    Timecard.find({
      user: $this.user,
      year: $this.year,
      month: $this.month,
      day: $this.day,
    }, function (err, timecards) {
      async.each(timecards, function (timecard, callback) {
        timecard.setIsMainTimecard(timecards, mainMatterId);
        timecard.saveRestHours(attendanceLog, restTime, attendanceInCut, reportType, stampType, callback);
      }, callback);
    });
  });
};

/**
 * NEC休憩時間テーブル
 */
var necRestTimeTable = [
  [-24300000, -23400000], //  2:15 -  2:30
  [-23400000, -22500000], //  2:30 -  2:45
  [-1800000, -900000], //  8:30 -  8:45
  [10800000, 11700000], // 12:00 - 12:15
  [11700000, 12600000], // 12:15 - 12:30
  [12600000, 13500000], // 12:30 - 12:45
  [13500000, 14400000], // 12:45 - 13:00
  [30600000, 31500000], // 17:30 - 17:45
  [34200000, 35100000], // 18:30 - 18:45
  [35100000, 36000000], // 18:45 - 19:00
  [45000000, 45900000], // 21:30 - 21:45
  [45900000, 46800000], // 21:45 - 22:00
  [62100000, 63000000], // 26:15 - 26:30 (  2:15 -  2:30)
  [63000000, 63900000], // 26:30 - 26:45 (  2:30 -  2:45)
  [83700000, 84600000], // 32:15 - 32:30 (  8:15 -  8:30)
  [98100000, 99000000], // 36:15 - 36:30 ( 12:15 - 12:30)
  [99000000, 99900000], // 36:30 - 36:45 ( 12:30 - 12:45)
  [99900000, 100800000], // 36:45 - 37:00 ( 12:45 - 13:00)
  [100800000, 101700000], // 37:00 - 37:15 ( 13:00 - 13:15)
];

/**
 * NEC 休憩時間(分)を返却
 *
 * @param inTimestamp  出勤時刻
 * @param outTimestamp 退勤時刻
 * @return NEC休憩時間(分)
 */
var getNecRestMinutes = function (inTimestamp, outTimestamp) {
  var inTimeDate = new Date(inTimestamp.getTime());
  inTimeDate.setFullYear(1970);
  inTimeDate.setMonth(0);
  inTimeDate.setDate(1);

  var outTimeDate = new Date(outTimestamp.getTime());
  outTimeDate.setFullYear(1970);
  outTimeDate.setMonth(0);
  if (inTimestamp.getDate() === outTimestamp.getDate()) {
    outTimeDate.setDate(1);
  } else {
    outTimeDate.setDate(2);
  }

  var inTime = inTimeDate.getTime();
  var outTime = outTimeDate.getTime();
  var restMinutes = 0;
  for (var i in necRestTimeTable) {
    var restStart = necRestTimeTable[i][0];
    var restEnd = necRestTimeTable[i][1];
    if (inTime <= restStart && outTime >= restEnd) {
      var stDate = new Date(restStart);
      var endDate = new Date(restEnd);
      restMinutes += 15;
    }
  }

  return restMinutes;
}

/**
 * NEC 休憩時間を返却
 *
 * @param stampType {String} 出退勤種別('enter' | 'leave' | 'night_leave')
 * @param attendanceLog {Object} 勤怠情報
 * @praam attendanceInCut {Object} 主案件情報
 */
var getNecRestHours = function (timecard, stampType, attendanceLog, attendanceInCut) {
  var restHours;

  // デフォルト休憩時間
  restHours = attendanceLog.isValidWorkTime() ? 1 : 0;

  // NEC休憩時間設定
  switch (stampType) {
    case 'enter':
      // 出勤時はNEC休憩時間算出できないため、一時的にAPC休憩時間を設定
      if (attendanceInCut) {
        restHours = attendanceInCut.restHours;
      }
      break;
    case 'leave':
    case 'night_leave':
      restHours = getNecRestMinutes(timecard.editedInTimestamp, timecard.editedOutTimestamp) / 60;

      break;
  }

  return restHours;
}

/**
 * APC 休憩時間を返却
 *
 * @param isMainTimecard {Boolean}
 * @param stampType {String} 出退勤種別('enter' | 'leave' | 'night_leave')
 * @param attendanceLog {Object} 勤怠情報
 * @praam attendanceInCut {Object} 主案件情報
 */
var getApcRestHours = function (timecard, isMainTimecard, stampType, attendanceLog, attendanceInCut, leaveAtNextDay) {
  var restHours;

  // メインタイムカードでなければ休憩時間は反映しない
  if (!isMainTimecard) {
    return 0;
  }

  // デフォルト休憩時間
  restHours = attendanceLog.isValidWorkTime() ? 1 : 0;
  // 主案件情報より休憩時間設定
  if (attendanceInCut != null) {
    switch (stampType) {
      case 'enter':
        restHours = attendanceInCut.restHours;
        break;
      case 'leave':
      case 'night_leave':
        if (attendanceInCut.isNightShift && attendanceInCut.restHoursNight != null && leaveAtNextDay) {
          restHours = attendanceInCut.restHoursNight;
        } else {
          restHours = attendanceInCut.restHours;
        }
        break;
    }
  }

  return restHours;
}

/**
 * 休憩時間を設定する
 *
 * @param attendanceLog   {Object} 勤怠情報
 * @param restTime        {Object} RestTimeオブジェクト
 * @param attendanceInCut {Object} 主案件情報
 * @param reportType      {Object} 勤務表種別
 * @param stampType       {String} 出退勤種別('enter' | 'leave' | 'night_leave')
 */
schema.methods.saveRestHours = function (attendanceLog, restTime, attendanceInCut, reportType, stampType, callback) {
  var restHours = 0;

  var inDayTimestamp = new Date(this.editedInTimestamp);
  var nextDayOfInDayTimestamp = new Date(inDayTimestamp.getTime() + 86400000);
  var outDayTimestamp = new Date(this.editedOutTimestamp);
  var leaveAtNextDay;
  if (nextDayOfInDayTimestamp.getDate() == outDayTimestamp.getDate()) {
    leaveAtNextDay = true;
  } else {
    leaveAtNextDay = false;
  }

  if (attendanceLog.isValidRestHours()) {
    // 設定期間の休憩時間の登録がある場合
    if (this.isValidRestTime(restTime)) {
      restTime.times.forEach(function (time) {
        if (this.editedInTimestamp == null || this.editedOutTimestamp == null) {
          return;
        }
        var configuredInDayRestStart = moment(time.start, 'HH:mm')
          .year(this.editedInTimestamp.getFullYear())
          .month(this.editedInTimestamp.getMonth())
          .date(this.editedInTimestamp.getDate());
        var configuredInDayRestEnd = moment(time.end, 'HH:mm')
          .year(this.editedInTimestamp.getFullYear())
          .month(this.editedInTimestamp.getMonth())
          .date(this.editedInTimestamp.getDate());
        // 休憩時刻が日付をまたぐ場合
        if (configuredInDayRestStart.valueOf() > configuredInDayRestEnd.valueOf()) {
          configuredInDayRestEnd = configuredInDayRestEnd.add(1, 'day');
        }
        var restInDayStart = _.max([this.editedInTimestamp.getTime(), configuredInDayRestStart.valueOf()]);
        var restInDayEnd = _.min([this.editedOutTimestamp.getTime(), configuredInDayRestEnd.valueOf()]);
        if (restInDayEnd > restInDayStart) {
          var inTime = datetimeutil.roundUp(new Date(restInDayStart), roundMinute);
          var outTime = datetimeutil.roundDown(new Date(restInDayEnd), roundMinute);
          restHours += (outTime - inTime) / (1000 * 60 * 60);
        }

        if (leaveAtNextDay) {
          var configuredOutDayRestStart = moment(time.start, 'HH:mm')
            .year(this.editedOutTimestamp.getFullYear())
            .month(this.editedOutTimestamp.getMonth())
            .date(this.editedOutTimestamp.getDate());
          var configuredOutDayRestEnd = moment(time.end, 'HH:mm')
            .year(this.editedOutTimestamp.getFullYear())
            .month(this.editedOutTimestamp.getMonth())
            .date(this.editedOutTimestamp.getDate());
          // 休憩時刻が日付をまたぐ場合
          if (configuredOutDayRestStart.valueOf() > configuredOutDayRestEnd.valueOf()) {
            configuredOutDayRestEnd = configuredOutDayRestEnd.add(1, 'day');
          }
          var restOutDayStart = _.max([this.editedInTimestamp.getTime(), configuredOutDayRestStart.valueOf()]);
          var restOutDayEnd = _.min([this.editedOutTimestamp.getTime(), configuredOutDayRestEnd.valueOf()]);
          if (restOutDayEnd > restOutDayStart) {
            var inTime = datetimeutil.roundUp(new Date(restOutDayStart), roundMinute);
            var outTime = datetimeutil.roundDown(new Date(restOutDayEnd), roundMinute);
            restHours += (outTime - inTime) / (1000 * 60 * 60);
          }
        }
      }.bind(this));
    }
    // 休憩時間の登録がない場合
    else {
      if (workReport.isApcReportType(reportType)) {
        restHours = getApcRestHours(this, this.isMainTimecard, stampType, attendanceLog, attendanceInCut, leaveAtNextDay);
      } else {
        restHours = getNecRestHours(this, stampType, attendanceLog, attendanceInCut);
      }
    }
  }

  // 画面から休憩時間が変更されていた場合は、打刻時に休憩時間を更新しない
  if (!this.editedRestHours || this.editedRestHours == this.actualRestHours) {
    this.editedRestHours = restHours;
  }
  this.actualRestHours = restHours;
  this.save(callback);
}

/**
 * timecard にとって有効なrestTimeであるか

 * @param restTime restTimeオブジェクト
 * @return Boolean 有効なrestTimeであるか
 */
schema.methods.isValidRestTime = function (restTime) {
  if (restTime == null) {
    return false;
  }

  if (restTime.times.length <= 0) {
    return false;
  }

  var date = new Date(this.year, this.month - 1, this.day);
  if (date.getTime() < restTime.period.start.getTime() ||
    date.getTime() > restTime.period.end.getTime()) {
    return false;
  }

  return true;
}

/**
 * 画面からの修正状況を返却
 */
schema.methods.timeModified = function () {
  var roundedActualIn = null;
  if (this.actualInTimestamp != null) {
    roundedActualIn = datetimeutil.roundUp(this.actualInTimestamp, roundMinute);
  }
  var roundedEditedIn = null;
  if (this.editedInTimestamp != null) {
    roundedEditedIn = datetimeutil.roundUp(this.editedInTimestamp, roundMinute);
  }
  var roundedActualOut = null;
  if (this.actualOutTimestamp != null) {
    roundedActualOut = datetimeutil.roundDown(this.actualOutTimestamp, roundMinute);
  }
  var roundedEditedOut = null;
  if (this.editedOutTimestamp != null) {
    roundedEditedOut = datetimeutil.roundDown(this.editedOutTimestamp, roundMinute);
  }

  var isDiff = function (actual, edited) {
    if (actual == null && edited != null) {
      return true;
    } else if (actual != null) {
      if (typeof actual.getTime == 'function' && typeof edited.getTime == 'function') {
        return actual.getTime() != edited.getTime();
      } else {
        return actual != edited;
      }
      return true;
    } else {
      return false;
    }
  }

  if (this.isManualAdded) {
    return true;

  } else if (isDiff(roundedActualIn, roundedEditedIn) ||
    isDiff(roundedActualOut, roundedEditedOut) ||
    isDiff(this.actualRestHours, this.editedRestHours) ||
    isDiff(this.actualMatterId, this.matterId)) {
    return true;

  } else {
    return false;
  }
}

// 曜日定義
var weekDays = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 指定日付が休日であるかどうかを返却
 * @return 休日ならば true
 */
schema.methods.isHoliday = function (date) {
  var weekDay = weekDays[date.getDay()];

  if (weekDay === '土' || Koyomi.getHolidayName(date)) {
    return true;
  } else {
    return false;
  }
}

/**
 * 指定日付が法定休日であるかどうかを返却
 * @return 法定休日ならば true
 */
schema.methods.isLegalHoliday = function (date) {
  var weekDay = weekDays[date.getDay()];

  if (weekDay === '日') {
    return true;
  } else {
    return false;
  }
}


/**
 * 休憩時間(分)を返却する
 *
 * @return 休憩時間(分)
 */
schema.methods.getRestMinutes = function () {
  if (!this.editedRestHours) {
    return 0;
  }

  return this.editedRestHours * 60;
}

// 「休出（振）」「法定休出（振）」は通常勤務と同ロジック
var onDayTargetTypes = ['出勤', '遅刻', '早退', '休出（振）', '法定休出（振）'];
var onNightTargetTypes = ['夜勤', '夜勤遅刻', '夜勤早退'];
var onHolidayTargetTypes = ['休出', '法定休出'];
var offTargetTypes = ['休日', '法定休日', '振休', '欠勤', '有休', '特別休'];

/**
 * 勤務時間(分)を返却
 *
 * @return 勤務時間(分)
 */
schema.methods.getWorkMinutes = function (attendanceInCut) {
  var targetTypes = [];
  targetTypes = targetTypes.concat(onDayTargetTypes, onNightTargetTypes, onHolidayTargetTypes);

  // 勤務時間については attendanceType と紐付けられていない場合を許容する
  if (this.attendanceType != null && targetTypes.indexOf(this.attendanceType.name) === -1) {
    return 0;
  }

  // 退勤打刻ない場合
  if (this.editedOutTimestamp == null) {
    return 0;
  }

  var inTime = datetimeutil.roundUp(this.editedInTimestamp, roundMinute);
  var outTime = datetimeutil.roundDown(this.editedOutTimestamp, roundMinute);
  var workMinutes = datetimeutil.getDiffMinutes(inTime, outTime) - this.getRestMinutes();

  return workMinutes > 0 ? workMinutes : 0;
}

/**
 * 時間外(分)を返却
 * @return 時間外(分)
 */
schema.methods.getOvertimeMinutes = function (attendanceLogs, attendanceLogsNextAndLastMonth, timecards, callback) {
  var $this = this;

  if (!this.attendanceType) {
    callback(0);
    return;
  }

  // 退勤打刻ない場合
  if (this.editedOutTimestamp == null) {
    callback(0);
    return;
  }

  // 主とするタイムカード以外は0返却
  if (!this.isMainTimecard) {
    callback(0);
    return;
  }

  var targetTypes = [];
  targetTypes = targetTypes.concat(onDayTargetTypes, onNightTargetTypes, onHolidayTargetTypes);
  if (targetTypes.indexOf(this.attendanceType.name) === -1) {
    callback(0);
    return;
  }

  var sumWorkMinutes = 0;
  var totalOvertimeMinutes = 0;
  var predefinedWorkMinutes = this.attendanceType.getPredefinedWorkMinutes();
  var existAttendanceLog = true;

  var logs = attendanceLogs;
  if (attendanceLogsNextAndLastMonth) {
    logs = logs.concat(attendanceLogsNextAndLastMonth);
  }

  async.eachSeries(timecards, function (timecard, callback) {
    var inDate = new Date(timecard.editedInTimestamp);
    var outDate = new Date(timecard.editedOutTimestamp);
    var zeroDate = new Date(inDate.getFullYear(), inDate.getMonth(), inDate.getDate());
    var outDatePivot = new Date(outDate.getFullYear(), outDate.getMonth(), outDate.getDate());
    var appliedRestMinutes = false;
    for (var date = inDate;
      (new Date(date.getFullYear(), date.getMonth(), date.getDate())).getTime() <= outDatePivot.getTime(); date = new Date(date.getTime() + DAY_MILLISECOND)) {

      // 出勤打刻日の超過時間
      if (date.getDate() == inDate.getDate()) {
        var inTime = datetimeutil.roundUp(inDate, roundMinute);
        if (inDate.getDate() == outDate.getDate()) {
          var outTime = datetimeutil.roundDown(outDate, roundMinute);
        } else {
          var outTime = datetimeutil.roundUp(datetimeutil.workenddate(date), roundMinute);
        }
      }
      // 退勤打刻日の超過時間
      else if (date.getDate() == outDate.getDate()) {
        if (inDate.getDate() == outDate.getDate()) {
          var inTime = datetimeutil.roundUp(inDate, roundMinute);
        } else {
          var inTime = datetimeutil.workstartdate(date);
        }
        var outTime = datetimeutil.roundDown(outDate, roundMinute);
      }
      // 中日打刻日の超過時間
      else {
        var inTime = datetimeutil.workstartdate(date);
        var outTime = datetimeutil.roundUp(datetimeutil.workenddate(date), roundMinute);
      }

      var workMinutes = datetimeutil.getDiffMinutes(inTime, outTime);
      if ((inDate.getTime() != zeroDate.getTime() || outDate.getTime() != zeroDate.getTime()) && !appliedRestMinutes) {
        workMinutes -= timecard.getRestMinutes();
        appliedRestMinutes = true;
      }

      sumWorkMinutes += workMinutes;

      // 該当日付のattendanceLogを取得
      var attendanceLog = logs.filter(function (item, index) {
        if (item.userId == timecard.userId &&
          item.year == date.getFullYear() &&
          item.month == date.getMonth() + 1 &&
          item.day == date.getDate()) {
          return true;
        }
      })[0];

      // 超過時間算出時に翌日以降の勤怠区分未登録を検出した場合、各フィールドを空にして返却(Redmine#109623)
      if (!attendanceLog) {
        existAttendanceLog = false;
        callback();
        return;
      }

      // 勤怠日の勤怠区分もしくは算出対象日の勤怠区分が日勤勤務系、夜勤勤務系であれば、超過時間を計上
      var targetTypes = [];
      targetTypes = targetTypes.concat(onDayTargetTypes, onNightTargetTypes);
      // 翌日分の超過時間計算時、翌日が['休出', '法定休出', '休日', '法定休日', '振休']以外の場合のみ、24時以降計上する
      // Redmine#113287
      var excludeNextDayTargetTypes = ['休出', '法定休出', '休日', '法定休日', '振休'];

      var satisfyTargetDayCond = function () {
        if (($this.day == attendanceLog.day) &&
          (($this.attendanceType != null && targetTypes.indexOf($this.attendanceType.name) >= 0) ||
            (attendanceLog.attendanceType != null && targetTypes.indexOf(attendanceLog.attendanceType.name) >= 0))) {
          return true
        } else {
          return false
        }
      }

      var satisfyLogDayCond = function () {
        if ($this.day != attendanceLog.day) {
          if (($this.attendanceType != null && onNightTargetTypes.indexOf($this.attendanceType.name) < 0) &&
            (attendanceLog.attendanceType != null && excludeNextDayTargetTypes.indexOf(attendanceLog.attendanceType.name) >= 0)) {
            return false
          } else {
            return true
          }
        } else {
          return false
        }
      }

      if (satisfyTargetDayCond() || satisfyLogDayCond()) {
        if ($this.day != attendanceLog.day &&
          onHolidayTargetTypes.indexOf($this.attendanceType.name) >= 0) {
          totalOvertimeMinutes += workMinutes;

        } else {
          if (sumWorkMinutes > predefinedWorkMinutes) {
            var remainWorkMinutes = predefinedWorkMinutes - (sumWorkMinutes - workMinutes);
            if (remainWorkMinutes < 0) {
              remainWorkMinutes = 0;
            }
            var overtimeMinutes = workMinutes - remainWorkMinutes;
            if (overtimeMinutes < 0) {
              overtimeMinutes = 0;
            }
            totalOvertimeMinutes += overtimeMinutes;
          }
        }
      }
    }
    callback();

  }, function (err, results) {
    // 超過時間算出時に翌日以降の勤怠区分未登録を検出した場合、各フィールドを空にして返却(Redmine#109623)
    if (!existAttendanceLog) {
      callback(0);
    } else if (totalOvertimeMinutes > 0) {
      callback(totalOvertimeMinutes);
    } else {
      callback(0);
    }
  });
}

/**
 * 休憩時間(分)を返却
 * @return 休憩時間(分)
 */
schema.methods.getDayOffMinutes = function () {
  if (!this.attendanceType) {
    return 0;
  }

  if (!this.editedRestHours) {
    return 0;
  }

  // 退勤打刻ない場合
  if (this.editedOutTimestamp == null) {
    return 0;
  }

  var targetTypes = [];
  targetTypes = targetTypes.concat(onDayTargetTypes, onNightTargetTypes, onHolidayTargetTypes);
  if (targetTypes.indexOf(this.attendanceType.name) === -1) {
    return 0;
  }

  return this.getRestMinutes();
}

/**
 * 深夜残業時間(分)を返却
 * @return 深夜残業時間(分)
 */
schema.methods.getMidnightOvertimeMinutes = function () {
  if (!this.attendanceType) {
    return 0;
  }

  // 退勤打刻ない場合
  if (this.editedOutTimestamp == null) {
    return 0;
  }

  var targetTypes = [];
  targetTypes = targetTypes.concat(onDayTargetTypes, onHolidayTargetTypes);
  if (targetTypes.indexOf(this.attendanceType.name) === -1) {
    return 0;
  }

  var midnightMinutes = 0;

  // 深夜1(0:00 - 5:00) 算出
  var midnight1Begin = new Date(this.year, this.month - 1, this.day, 0, 0, 0);
  var midnight1End = new Date(this.year, this.month - 1, this.day, 5, 0, 0);
  var startTimestamp = Math.max(this.editedInTimestamp.getTime(), midnight1Begin.getTime());
  var endTimestamp = Math.min(this.editedOutTimestamp.getTime(), midnight1End.getTime());
  var diffTimestamp = endTimestamp - startTimestamp;
  if (diffTimestamp > 0) {
    midnightMinutes += diffTimestamp / MINUTE_MILLISECOND;
  }

  // 深夜2(22:00 - 29:00) 算出
  var midnight2Begin = new Date(this.year, this.month - 1, this.day, 22, 0, 0);
  var midnight2End = new Date(this.year, this.month - 1, this.day + 1, 5, 0, 0);
  var startTimestamp = Math.max(this.editedInTimestamp.getTime(), midnight2Begin.getTime());
  var endTimestamp = Math.min(this.editedOutTimestamp.getTime(), midnight2End.getTime());
  var diffTimestamp = endTimestamp - startTimestamp;
  if (diffTimestamp > 0) {
    midnightMinutes += diffTimestamp / MINUTE_MILLISECOND;
  }

  // 切り下げ
  midnightMinutes -= midnightMinutes % roundMinute;
  return midnightMinutes > 0 ? midnightMinutes : 0;
}

/**
 * 遅早時間(分)を返却
 * @return 遅早時間(分)
 */
schema.methods.getExcludeMinutes = function (totalWorkMinutes) {
  if (!this.attendanceType) {
    return 0;
  }

  // 退勤打刻ない場合
  if (this.editedOutTimestamp == null) {
    return 0;
  }

  // 主とするタイムカード以外は0返却
  if (!this.isMainTimecard) {
    return 0;
  }

  var targetTypes = [];
  targetTypes = targetTypes.concat(onDayTargetTypes, onNightTargetTypes);
  if (targetTypes.indexOf(this.attendanceType.name) === -1) {
    return 0;
  }

  var predefinedWorkMinutes = this.attendanceType.getPredefinedWorkMinutes();
  if (totalWorkMinutes < predefinedWorkMinutes) {
    var excludeMinutes = predefinedWorkMinutes - totalWorkMinutes;
    return excludeMinutes > 0 ? excludeMinutes : 0;
  } else {
    return 0;
  }
}

/**
 * 夜勤時間(分)を返却
 * @return 夜勤時間(分)
 */
schema.methods.getNightShiftMinutes = function () {
  if (!this.attendanceType) {
    return 0;
  }

  // 退勤打刻ない場合
  if (this.editedOutTimestamp == null) {
    return 0;
  }

  var targetTypes = onNightTargetTypes;
  if (targetTypes.indexOf(this.attendanceType.name) === -1) {
    return 0;
  } else {
    return this.getWorkMinutes();
  }
}

/**
 * 休出時間(分)を返却
 * @return 休出時間(分)
 */
schema.methods.getHolidayWorkMinutes = function (attendanceLogs, attendanceLogsNextAndLastMonth, totalWorkMinutes) {
  var $this = this;

  if (!this.attendanceType) {
    return 0;
  }

  // 退勤打刻ない場合
  if (this.editedOutTimestamp == null) {
    return 0;
  }

  // 勤務日の翌日が「休出」となる場合、日付を超えて翌日退勤の際に翌日勤務時間を休出時間とする
  // 「休出（振）」の場合は、holidayWorkMinutes には計上しない
  // 但し、勤務日が「夜勤」「夜勤遅刻」「夜勤早退」の場合は、翌日分も holidayWorkMinutes には計上しない
  var targetTypes = [];
  targetTypes = targetTypes.concat(onDayTargetTypes, onHolidayTargetTypes);
  if (targetTypes.indexOf(this.attendanceType.name) === -1) {
    return 0;
  }

  var inTime = datetimeutil.roundUp(this.editedInTimestamp, roundMinute);
  var outTime = datetimeutil.roundDown(this.editedOutTimestamp, roundMinute);
  var endTimeInday;
  if (inTime.getDate() == outTime.getDate()) {
    endTimeInday = outTime;
  } else {
    endTimeInday = datetimeutil.roundUp(datetimeutil.workenddate(this.editedInTimestamp), roundMinute);
  }

  var holidayWorkMinutes = 0;

  // 勤務日が「休出」の場合、当日内の休出時間を加算
  // inTime -> endTimeInday までを計上
  if (inTime.getDate() == this.day && this.attendanceType.name == '休出') {
    holidayWorkMinutes += datetimeutil.getDiffMinutes(inTime, endTimeInday) - this.getRestMinutes();
  }

  // 退勤が翌日に跨り、かつ翌日の勤怠区分が休出の場合、翌日勤務分を加算
  // endTimeInday -> outTime までを計上
  var predefinedWorkMinutes = this.attendanceType.getPredefinedWorkMinutes();
  if (outTime.getDate() != this.day) {
    var logs = attendanceLogs;
    if (attendanceLogsNextAndLastMonth) {
      logs = logs.concat(attendanceLogsNextAndLastMonth);
    }
    // 該当日付のattendanceLogを取得
    var attendanceLog = logs.filter(function (item, index) {
      if (item.userId == $this.userId &&
        item.year == outTime.getFullYear() &&
        item.month == outTime.getMonth() + 1 &&
        item.day == outTime.getDate()) {
        return true;
      }
    })[0];

    var targetTypes = ['休出', '休日', '振休'];
    if (attendanceLog && attendanceLog.attendanceType &&
      targetTypes.indexOf(attendanceLog.attendanceType.name) >= 0) {

      var holidayMinutes;
      if (inTime.getDate() == outTime.getDate()) {
        holidayMinutes = datetimeutil.getDiffMinutes(inTime, outTime) - this.getRestMinutes();
      } else {
        holidayMinutes = datetimeutil.getDiffMinutes(endTimeInday, outTime);
      }
      if (onHolidayTargetTypes.indexOf(this.attendanceType.name) >= 0) {
        // 24時以降を超過した分を休出時間として加算
        holidayWorkMinutes += holidayMinutes;

      } else {
        if (totalWorkMinutes > predefinedWorkMinutes) {
          // 24時以降かつ、勤務時間が7.5hを超過した分を休出時間として加算
          var overMinutes = totalWorkMinutes - predefinedWorkMinutes;
          holidayWorkMinutes += _.min([overMinutes, holidayMinutes])
        }
      }
    }
  }

  return holidayWorkMinutes;
}

/**
 * 法定休出時間(分)を返却
 * @return 法定休出時間(分)
 */
schema.methods.getLegalHolidayWorkMinutes = function (attendanceLogs, attendanceLogsNextAndLastMonth, totalWorkMinutes) {
  var $this = this;

  if (!this.attendanceType) {
    return 0;
  }

  // 退勤打刻ない場合
  if (this.editedOutTimestamp == null) {
    return 0;
  }

  // 勤務日の翌日が「法定休出」となる場合、日付を超えて翌日退勤の際に翌日勤務時間を法定休出時間とする
  // 「法定休出（振）」の場合は、legalHolidayWorkMinutes には計上しない
  // 但し、勤務日が「夜勤」「夜勤遅刻」「夜勤早退」の場合は、翌日分も legalHolidayWorkMinutes には計上しない
  var targetTypes = [];
  targetTypes = targetTypes.concat(onDayTargetTypes, onHolidayTargetTypes);
  if (targetTypes.indexOf(this.attendanceType.name) === -1) {
    return 0;
  }

  var inTime = datetimeutil.roundUp(this.editedInTimestamp, roundMinute);
  var outTime = datetimeutil.roundDown(this.editedOutTimestamp, roundMinute);
  var endTimeInday;
  if (inTime.getDate() == outTime.getDate()) {
    endTimeInday = outTime;
  } else {
    endTimeInday = datetimeutil.roundUp(datetimeutil.workenddate(this.editedInTimestamp), roundMinute);
  }

  var legalHolidayWorkMinutes = 0;

  // 勤務日が「法定休出」の場合、当日内の法定休出時間を加算
  // inTime -> endTimeInday までを計上
  if (inTime.getDate() == this.day && this.attendanceType.name == '法定休出') {
    legalHolidayWorkMinutes += datetimeutil.getDiffMinutes(inTime, endTimeInday) - this.getRestMinutes();
  }

  // 退勤が翌日、かつ翌日の勤怠区分が法定休出の場合、翌日勤務分を加算
  // endTimeInday -> outTime までを計上
  var predefinedWorkMinutes = this.attendanceType.getPredefinedWorkMinutes();
  if (outTime.getDate() != this.day) {
    var logs = attendanceLogs;
    if (attendanceLogsNextAndLastMonth) {
      logs = logs.concat(attendanceLogsNextAndLastMonth);
    }
    // 翌日のattendanceLogを取得
    var attendanceLog = logs.filter(function (item, index) {
      if (item.userId == $this.userId &&
        item.year == outTime.getFullYear() &&
        item.month == outTime.getMonth() + 1 &&
        item.day == outTime.getDate()) {
        return true;
      }
    })[0];

    var targetTypes = ['法定休出', '法定休日'];
    if (attendanceLog && attendanceLog.attendanceType &&
      targetTypes.indexOf(attendanceLog.attendanceType.name) >= 0) {

      var legalHolidayMinutes;
      if (inTime.getDate() == outTime.getDate()) {
        legalHolidayMinutes = datetimeutil.getDiffMinutes(inTime, outTime) - this.getRestMinutes();
      } else {
        legalHolidayMinutes = datetimeutil.getDiffMinutes(endTimeInday, outTime);
      }
      if (onHolidayTargetTypes.indexOf(this.attendanceType.name) >= 0) {
        // 24時以降を超過した分を休出時間として加算
        legalHolidayWorkMinutes += legalHolidayMinutes;

      } else {
        if (totalWorkMinutes > predefinedWorkMinutes) {
          // 24時以降かつ、勤務時間が7.5hを超過した分を休出時間として加算
          var overMinutes = totalWorkMinutes - predefinedWorkMinutes;
          legalHolidayWorkMinutes += _.min([overMinutes, legalHolidayMinutes])
        }
      }
    }
  }

  return legalHolidayWorkMinutes;
}

/**
 * 出勤打刻時刻補正
 */
schema.methods.modifyInTimestamp = function (workdate, attendanceInCut) {
  if (!attendanceInCut) {
    return;
  }

  if (!config) {
    config = require('../config/environment');
  }

  // 日勤勤務開始予定時刻
  var inTimeDate = attendanceInCut.getDate(workdate, 'inTime');
  var inTimeEarlyDate =
    new Date(inTimeDate.getTime() - config.workEarlyHour * 60 * 60 * 1000);

  // 夜勤勤務開始予定時刻
  var inTimeNightDate = attendanceInCut.getDate(workdate, 'inTimeNight');
  if (inTimeNightDate) {
    var inTimeNightEarlyDate =
      new Date(inTimeNightDate.getTime() - config.workEarlyHour * 60 * 60 * 1000);
  }

  // 日勤勤務開始時刻以前の出勤打刻
  if (this.editedInTimestamp.getTime() > inTimeEarlyDate.getTime() &&
    this.editedInTimestamp.getTime() < inTimeDate.getTime()) {
    this.actualInTimestamp = inTimeDate;
    this.editedInTimestamp = inTimeDate;
  }
  // 夜勤勤務開始時刻前（1時間以内)
  else if (inTimeNightDate &&
    this.editedInTimestamp.getTime() > inTimeNightEarlyDate.getTime() &&
    this.editedInTimestamp.getTime() < inTimeNightDate.getTime()) {
    this.actualInTimestamp = inTimeNightDate;
    this.editedInTimestamp = inTimeNightDate;
  }

  return;
}

schema.pre('save', defaultCurrentTimestamp);

mongoose.model('Timecard', schema);
