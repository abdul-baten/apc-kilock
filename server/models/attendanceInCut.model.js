'use strict';

// 案件情報取り込み時に、該当ユーザーの主案件として紐づいている場合に、
// 本コレクションに情報を取り込む

var mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  config = require('../config/environment'),
  Schema = mongoose.Schema;

var timestampMatch  = [ /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/, '時刻のフォーマットhh:mmに一致しません' ];

/**
 * Thing Schema
 */
var schema = new Schema({
  user: { type: Schema.ObjectId, required: true, ref: 'User' },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  inTime: { type: String, required: true, match: timestampMatch },
  outTime: { type: String, required: true, match: timestampMatch },
  restHours: { type: Number, required: true },
  isNightShift: { type: Boolean, required: true, default: false},
  inTimeNight: { type: String, required: true, match: timestampMatch },
  outTimeNight: { type: String, required: true, match: timestampMatch },
  restHoursNight: { type: Number, required: true },

  // 登録元の主案件
  matterId: { type: Number, required: false },
  matter: { type:Schema.ObjectId, required: false, ref:'Matter' },
});

schema.index({user: 1, year: 1, month: 1}, { unique: true });

/**
 * attendanceInCut モデル内の各時刻フィールドをDateにして返却
 * @param {Object} workdate 勤務時間日時
 * @param {String} field フィールド名
 * @returns {Date} 補正後の各時刻
 */
schema.methods.getDate = function (workdate, field) {
  if (!this[field]) {
    return null;
  }

  var times = this[field].split(':');

  //日本時間に合わせる
  var days    = Math.floor(times[0] / 24);
  var hours   = times[0] % 24;
  var minutes = times[1];

  var date = new Date(workdate.year, workdate.month - 1, workdate.day + days);
  date.setUTCMinutes(minutes);
  date.setUTCSeconds(0);
  date.setUTCMilliseconds(0);
  date.setUTCHours(date.getUTCHours() + hours);

  return date;
};

schema.methods.getMinutes = function (field) {
  var times = this[field].split(':');
  var hours   = parseInt(times[0]);
  var minutes = parseInt(times[1]);

  return hours * 60 + minutes;
};

/**
 * 打刻時刻の補正に使用できる状態であるか返却
 */
schema.methods.isActive = function() {
  if (!this.matter) {
    return false;
  }

  // 案件が無効状態
  if (!this.matter.valid) {
    return false;
  }

  return true;
}

mongoose.model('AttendanceInCut', schema);
