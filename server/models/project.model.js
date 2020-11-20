'use strict';

var mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  // プロジェクトのsalesforcId
  id: { type: String, required: false },
  // プロジェクト名
  name: { type:String, required: false },
  // salesforce URL
  url: { type:String, required: false },
  // 人数
  memberNum: { type: Number, required: false },
  // GM
  gm: {
    // salesforcId
    id: { type: String, required: false },
    // 要員名
    name: { type:String, required: false },
    // salesforce URL
    url: { type:String, required: false },
  },
  // 部門
  department: {
    // salesforcId
    id: { type: String, required: false },
    // 部門名
    name: { type:String, required: false },
    // salesforce URL
    url: { type:String, required: false },
  },
  // group
  group: { type: Schema.ObjectId, required: true, ref: 'Group' },
  // 有効/無効
  valid: { type: Boolean, required: true, default: false },
  // 同期日時
  synchronizedAt: {type:Date, required: true, default: Date.now },
});
schema.index({ id:1 }, { unique: true });

mongoose.model('Project', schema);
