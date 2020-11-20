'use strict';

/**
 * @fileOverview 勤怠区分を表すコレクションを定義
 */

var mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  Schema = mongoose.Schema;

/**
 * 勤怠区分
 */
var schema = new Schema({
  // 勤怠区分名称
  name: { type: String, required: true },
  // 所定労働時間
  predefinedWorkHours: { type: Date, required: true, default: new Date(1970, 0, 1, 0, 0, 0) },
  // 表示順
  displayOrder: { type: Number, required: true, default: 2147483647, index: true },
  // 所属組織
  organization: { type: Schema.ObjectId, required: false, ref: 'Organization' }
});

schema.index({ name: 1, organization: 1 }, { unique: true });

/**
 * 所定労働時間時間(分)を返却
 * @return 所定労働時間(分)
 */
schema.methods.getPredefinedWorkMinutes = function () {
  return this.predefinedWorkHours.getHours() * 60 + this.predefinedWorkHours.getMinutes();
}

mongoose.model('AttendanceType', schema);
