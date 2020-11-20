'use strict';

var mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  config = require('../config/environment'),
  Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  attendanceStatus: { type: Schema.ObjectId, required: true, ref: 'AttendanceStatus' },
  action: { type: Number, required: true },
  updateUser: { type: Schema.ObjectId, required: true, ref: 'User' },
  updated: {type:Date, required: true, default: Date.now },
});

mongoose.model('AttendanceStatusLog', schema);
