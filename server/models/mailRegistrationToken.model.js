'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  // ユーザドキュメント
  user: {type: Schema.ObjectId, required: true, index: true, ref: 'User'},
  // 個別受信メールアドレスに含めるユニークな文字列
  token: { type: String, required: true, index: true}
});

mongoose.model('MailRegistrationToken', schema);
