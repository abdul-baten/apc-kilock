'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var SourceType = [
  'local',
  'kilock-converter',
  'redmine',
  'google',
  'twitter',
  'facebook',
  'github',
  'salesforce',
];

var AuthType = [
  'none',
  'cas',
  'google',
  'twitter',
  'facebook',
  'github',
  'salesforce',
];

/**
 * Schema
 */
var schema = new Schema({
  // 名称
  name: {type:String, required: true },
  // 表示名
  displayName: {type:String, required: false },
  // 種別
  type: {type:String, required: true, enum: SourceType },
  // 種別
  authType: {type:String, required: true, enum: AuthType, default: 'none' },
  // 設定
  settings: { type: Object, required: false },
  // 所属組織 TODO いずれ必須にする
  organization: { type:Schema.ObjectId, required: false, ref:'Organization' },
  // 同期日時
  synchronizedAt: {type:Date, required: true, default: Date.now },
});

schema.index({ name:1, organization: 1 }, { unique: true });

mongoose.model('Source', schema);
