'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  // タグ名
  name: { type: String, required: true },
  // 所属組織
  organization: { type:Schema.ObjectId, required: false, ref:'Organization' },
});

schema.index({ name:1, organization: 1 }, { unique: true });

mongoose.model('GroupTag', schema);
