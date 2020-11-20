'use strict';

var mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Schema = mongoose.Schema;
var datetimeutil = require('../utils/datetimeutil');
var Koyomi = require('koyomi');
var config = require('../config/environment');
var async = require('async');

/**
 * Thing Schema
 */
var schema = new Schema({
  userId: { type: Number, required: true },
  user: { type:Schema.ObjectId, required: true, ref:'User' },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  day: { type: Number, required: true },
  inTimestamp: { type:Date, required: true },
  outTimestamp: { type:Date, required: true },
  autoInTimestamp: { type:Date, required: false },
  autoOutTimestamp: { type:Date, required: false },
  overtimeRequest: {type: Schema.ObjectId, required: false, default: null, ref: 'OvertimeRequest'},
  updated: {type:Date, required: true, default: Date.now },
  reasonOfEditing: { type:String, required: false },
  attendanceType: {type: Schema.ObjectId, required: false, ref: 'AttendanceType'},
  travelCost: {type: Schema.ObjectId, required: false, ref: 'TravelCost'},
});

schema.index({ userId:1, year: 1, month: 1, day: 1 }, { unique: true });

var defaultCurrentTimestamp = function (next) {
  var model = this;
  if (model.ignoreCurrentTimestamp) {
    next();
    return;
  }
  var now = Date.now();
  var CollectionSummary = mongoose.model('CollectionSummary');
  CollectionSummary.update(
    { name: model.collection.name },
    { updated: now },
    { upsert: true },
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

/**
 * passHistoryより自動記録される出勤タイムスタンプと、手動記録可能な出勤タイムスタンプが一致しているか判定する。
 * @returns {boolean} trueの場合は一致、falseの場合は不一致
 */
schema.methods.equalsInTimestamps = function () {
  return this.autoInTimestamp.getTime() === this.inTimestamp.getTime();
};

/**
 * 紐づくタイムカードの休憩時間の合計を返す。
 *
 * @returns {Date} 休憩時間
 */
schema.methods.getRestHours = function(callback) {
  var Timecard = mongoose.model('Timecard');
  var $this = this;
  async.parallel({
    timecards: function(callback) {
      var conditions = {
        userId: $this.userId,
        year:   $this.year,
        month:  $this.month,
        day:    $this.day,
      };
      Timecard.find(conditions, callback);
    },
  }, function(err, results) {
    var restHours = 0;
    var timecards = results.timecards;
    async.each(timecards, function(timecard, callback) {
      if (timecard.editedRestHours) {
        restHours += timecard.editedRestHours;
      }
    });

    callback(restHours);
  });
};

/**
 * 打刻時刻によって save の必要/不要を返却する
 * @returns {Boolean} save必要: true  save不要: false
 */
schema.methods.needSave = function (timestamp) {
  if (timestamp.isBefore(this.autoInTimestamp) ||
      timestamp.isAfter(this.autoOutTimestamp)) {
    return true;
  } else {
    return false;
  }
};

/**
 * 打刻時刻によって inTimestamp/autoInTimestamp/outTimestamp/autoOutTimestamp を更新する
 * @params timestamp {Date} 打刻時刻
 */
schema.methods.setTimestamp = function (timestamp, stampType) {
  // 初期登録された休日データには、inTimestamp, autoInTimestamp に、勤務日の 0:00:00.000 時刻が格納される
  // このデータに対して打刻した際に、まだ勤怠データが存在していない場合と同等の扱いとする
  // (autoInTimestamp は、サーバー再起動時の補完処理によって、inTimestamp がコピーされた場合に上記の値となる)
  // (config/upgradedata/main.js)
  var zero = new Date(this.year, this.month-1, this.day);

  if (!this.autoInTimestamp || this.autoInTimestamp.getTime() == zero.getTime()) {
    this.autoInTimestamp = timestamp;
  }
  // 初期登録された休日データの場合にもinTimestampを更新する
  if (!this.inTimestamp || this.inTimestamp.getTime() == zero.getTime()) {
    this.inTimestamp = timestamp;
  }
  if (timestamp.isBefore(this.autoInTimestamp)) {
    this.inTimestamp = timestamp;
    this.autoInTimestamp = timestamp;
  }
  if (!this.autoOutTimestamp) {
    this.autoOutTimestamp = timestamp;
  }
  if (stampType == 'leave' && timestamp.isAfter(this.autoOutTimestamp)) {
    this.outTimestamp = timestamp;
    this.autoOutTimestamp = timestamp;
  }
}

// 曜日定義
var weekDays = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 打刻日付が休日であるかどうかを返却
 * @return 休日ならば true
 */
schema.methods.isHoliday = function () {
  var today = new Date(this.year, this.month - 1, this.day);
  var weekDay = weekDays[today.getDay()];

  if (weekDay === '土' || Koyomi.getHolidayName(today)) {
    return true;
  } else {
    return false;
  }
}

/**
 * 打刻日付が法定休日であるかどうかを返却
 * @return 法定休日ならば true
 */
schema.methods.isLegalHoliday = function () {
  var today = new Date(this.year, this.month - 1, this.day);
  var weekDay = weekDays[today.getDay()];

  if (weekDay === '日') {
    return true;
  } else {
    return false;
  }
}

/**
 * 出勤打刻時刻補正
 */
schema.methods.modifyInTimestamp = function(workdate, attendanceInCut) {
  if (!attendanceInCut) {
    return;
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
  if (this.autoInTimestamp.getTime() > inTimeEarlyDate.getTime() &&
      this.autoInTimestamp.getTime() < inTimeDate.getTime()) {
    this.inTimestamp = inTimeDate;
  }
  // 夜勤勤務開始時刻前１時間以内
  else if (inTimeNightDate &&
           this.autoInTimestamp.getTime() > inTimeNightEarlyDate.getTime() &&
           this.autoInTimestamp.getTime() < inTimeNightDate.getTime()) {
    this.inTimestamp = inTimeNightDate;
  }

  return;
}


/**
 * 勤務時間(分)を返却
 * @return 勤務時間(分)
 */
schema.methods.getWorkMinutesInDay = function (attendanceInCut, timecards, stamping, callback) {
  var $this = this;
  var Timecard = mongoose.model('Timecard');

  var workMinutes = 0;
  var conditions = {
    year:   $this.year,
    month:  $this.month,
    day:    $this.day,
    userId: $this.userId,
  };

  var getTotal = function(err, timecards) {
    async.each(timecards, function(timecard, callback) {
      // 打刻時の場合は attendanceLog -> timecard の順で更新する。
      // 夜勤退勤打刻の際は、情報がまだ timecard に反映されていないためここで設定する。
      // (夜勤退勤判定のため、attendanceLog -> timecard の更新順とする必要がある)
      if (!timecard.editedOutTimestamp && stamping) {
        timecard.editedOutTimestamp = $this.autoOutTimestamp;
      }

      // 紐づくattendanceLog, attendanceType を設定
      timecard.attendanceLog  = $this;
      timecard.attendanceType = $this.attendanceType;

      workMinutes += timecard.getWorkMinutes(attendanceInCut);
      callback();
    }, function(err) {
      if (err) {
        logger.error(err);
      }
      callback(err, workMinutes);
    });
  };

  if (timecards) {
    getTotal(null, timecards);
  } else {
    Timecard.find(conditions, function(err, timecards) {
      getTotal(null, timecards);
    });
  }
}

schema.methods.isValidWorkTime = function () {
  var targetTypes = ['休日', '振休', '欠勤', '有休', '特別休', '法定休日'];

  // 出勤打刻のみの時点では未設定の場合もあるため、null を許容する
  if (this.attendanceType != null && targetTypes.indexOf(this.attendanceType.name) !== -1) {
    return false;
  } else {
    return true;
  }
}

schema.methods.isValidRestHours = function () {
  // 休出/法定休出の休憩時間のデフォルトは 0 のため、打刻時に休憩時間を計上しない
  var targetTypes = ['休日', '振休', '欠勤', '有休', '特別休', '法定休日', '休出', '法定休出' ];

  // 出勤打刻のみの時点では未設定の場合もあるため、null を許容する
  if (this.attendanceType != null && targetTypes.indexOf(this.attendanceType.name) !== -1) {
    return false;
  } else {
    return true;
  }
}

/**
 * 紐づく timecard に画面からの修正状態を返却
 */
schema.methods.timeModified = function (callback) {
  var Timecard = mongoose.model('Timecard');
  var conditions = {
    year:   this.year,
    month:  this.month,
    day:    this.day,
    userId: this.userId,
  };
  var modified = false;
  Timecard.find(conditions, function(err, timecards) {
    if (timecards) {
      async.each(timecards, function(timecard, callback) {
        if (timecard.timeModified()) {
          modified = true;
        }
        callback();
      }, function() {
        callback(null, modified);
      });
    } else {
      callback(null, false);
    }
  });
};

/**
 * 勤怠区分を設定
 * @param {Object} attendanceInCut 打刻時刻補正情報
 * @param {Object} attendanceTypes 勤怠区分データ配列(name => _id)
 * @param {String} stampType       出退勤種別('enter' | 'leave' | 'night_leave')
 */
schema.methods.setAttendanceType = function (attendanceInCut, attendanceTypes, stampType) {
  var inTimestamp;
  var outTimestamp;
  var workdate     = datetimeutil.workdate(this.inTimestamp);
  var nextWorkdate = datetimeutil.workdate(this.inTimestamp, {d: 1});

  if (attendanceInCut) {
    // 夜勤退勤時
    if (stampType == 'night_leave') {
      if (attendanceInCut.isNightShift) {
        inTimestamp  = attendanceInCut.getDate(workdate, 'inTimeNight').getTime();
        outTimestamp = attendanceInCut.getDate(nextWorkdate, 'outTimeNight').getTime();

        if (this.outTimestamp.getTime() < outTimestamp) {
          this.attendanceType = attendanceTypes['夜勤早退']._id;

        } else if (this.inTimestamp.getTime() > inTimestamp) {
          this.attendanceType = attendanceTypes['夜勤遅刻']._id;

        } else {
          this.attendanceType = attendanceTypes['夜勤']._id;
        }

      } else {
        this.attendanceType = attendanceTypes['出勤']._id;
      }
    }
    // 日勤退勤時
    else if (stampType == 'leave') {
      inTimestamp  = attendanceInCut.getDate(workdate, 'inTime').getTime();
      outTimestamp = attendanceInCut.getDate(workdate, 'outTime').getTime();

      if (this.isHoliday() && !attendanceInCut.isNightShift) {
        this.attendanceType = attendanceTypes['休出']._id;

      } else if (this.isLegalHoliday() && !attendanceInCut.isNightShift) {
        this.attendanceType = attendanceTypes['法定休出']._id;

      } else if (this.outTimestamp.getTime() < outTimestamp) {
        this.attendanceType = attendanceTypes['早退']._id;

      } else if (this.inTimestamp.getTime() > inTimestamp) {
        this.attendanceType = attendanceTypes['遅刻']._id;

      } else  {
        this.attendanceType = attendanceTypes['出勤']._id;
      }

    }
    // 出勤時
    else if (stampType == 'enter') {
      if (this.isHoliday() && !attendanceInCut.isNightShift) {
        this.attendanceType = attendanceTypes['休出']._id;

      } else if (this.isLegalHoliday() && !attendanceInCut.isNightShift) {
        this.attendanceType = attendanceTypes['法定休出']._id;
      }
    }

  } else {
    if (this.isHoliday()) {
      this.attendanceType = attendanceTypes['休出']._id;

    } else if (this.isLegalHoliday()) {
      this.attendanceType = attendanceTypes['法定休出']._id;

    } else  {
      if (stampType == 'leave' || stampType == 'night_leave') {
        this.attendanceType = attendanceTypes['出勤']._id;
      }
    }
  }
}

schema.pre('save', defaultCurrentTimestamp);

mongoose.model('AttendanceLog', schema);
