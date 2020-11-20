'use strict';

var mongoose = require('mongoose'),
Schema = mongoose.Schema;

/**
 * 家族ユーザ Schema
 */
var schema = new Schema({
  // 家族名
  name: { type: String, required: false },
  // メールアドレス
  mail: { type: String, required: true },
  // メールアドレスアクティベート
  mailActivated: { type: Boolean, required: true, default: false },
  // ユーザ
  user: { type: Schema.ObjectId, required: true, ref:'User', childPath:'family' },
  // トークンパス
  tokenPath: { type: String, required: true, index: {unique: true} },
  // トークンパスの有効期限
  tokenExpiration: { type: Date, required: true },
});

schema.index({ mail:1, user: 1 }, { unique: true });

mongoose.model('FamilyUser', schema);
