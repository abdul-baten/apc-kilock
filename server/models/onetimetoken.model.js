'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var TokenType = [
  'DeviceMobile',
  'DeviceNfc',
];

/**
 * Thing Schema
 */
var schema = new Schema({
  token: { type: String, required: true, index: {unique: true} },
  type: { type: String, required: true, enum: TokenType, },
  user: { type:Schema.ObjectId, required: true, ref:'User' },
  expiration: {type:Date, required: true },
});

/**
 * Validations
 */
// schema.path('xxx').validate(function (value) {
//   return true;
// }, 'xxx is invalid');

mongoose.model('OneTimeToken', schema);
