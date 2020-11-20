'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  logger = log4js.getLogger(),
  ObjectId = require('mongoose').Types.ObjectId,
  AttendanceLog = mongoose.model('AttendanceLog');

/**
 * Thing Schema
 */
var schema = new Schema({
  requestUser: { type: Schema.ObjectId, required: true, ref: 'User'}, /* 申請者 */
  approveUser: { type: Schema.ObjectId, required: true, ref: 'User' }, /* 承認者 */
  approveProject: { type: Schema.ObjectId, required: false, ref: 'Project'}, /* 承認者プロジェクト */
  year: { type: Number, required: true}, /* 申請した残業日時 年 */
  month: { type: Number, required: true}, /* 申請した残業日時 月 */
  day: { type: Number, required: true}, /* 申請した残業日時 日 */
  hour: { type: Number, required: true }, /* 申請した残業日時 時 */
  minute: { type: Number, required: true }, /* 申請した残業日時 分 */
  reason: { type: String, required: true }, /* 残業申請理由 */
  remandReason: { type: String, required: false }, /* 差戻し申請理由 */  
  approveStatus: { type: Number, required: true }, /* 承認ステータス 0:申請, 1:承認, 2:非承認, 3:差戻し */
  requestTime: { type: Date, required: true, default: Date.now() }, /* 申請日時 */
  approveTime: { type: Date, required: false }, /* 承認日時 */
  updated: {type: Date, required: true, default: Date.now() } /* レコード更新日 */
});

schema.index(
  { requestUser: 1, year: -1, month: 1, day: 1},
  { unique: true }
);

/**
 * 対応するAttendanceLogに対して、saveしたオブジェクトのIDを設定する。
 * @param model
 */
var saveAfterProcess = function (model) {
  AttendanceLog.findOne({
    user: model.requestUser,
    year: model.year,
    month: model.month,
    day: model.day
  }).exec(function(err, result){
    if(err) {
      logger.error(err);
    } else if (!result) {
      logger.error('recieve model null');
    } else {
      AttendanceLog.update(
        {_id: new ObjectId(result._id) },
        {$set: {overtimeRequest:new ObjectId(model._id)}}
      ).exec(function(update_err) {
        if(update_err) logger.error(update_err);
      });
    }
  });
};

schema.post('save', saveAfterProcess);
mongoose.model('OvertimeRequest', schema);
