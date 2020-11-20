'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var DeviceType = [
  'mobile',
  'nfc',
];

/**
 * Thing Schema
 */
var schema = new Schema({
  token: { type: String, required: true, index: {unique: true} },
  name: { type: String, required: true },
  uuid: { type: String, required: false},
  udid: { type: String, required: false},
  type: { type: String, required: true, enum: DeviceType, },
  user: { type:Schema.ObjectId, required: false, ref:'User', childPath:'devices' }
});

/**
 * Validations
 */
// schema.path('xxx').validate(function (value) {
//   return true;
// }, 'xxx is invalid');

mongoose.model('Device', schema);
