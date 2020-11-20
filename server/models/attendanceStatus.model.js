'use strict';

var mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  config = require('../config/environment'),
  Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  user: { type: Schema.ObjectId, required: true, ref: 'User' },
  personnel: { type: Schema.ObjectId, required: false, ref: 'Personnel' },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  status: { type: Number, required: true },
  middleUpdatedUser: { type: Schema.ObjectId, required: false, ref: 'User' },
  betterUpdatedUser: { type: Schema.ObjectId, required: false, ref: 'User' },
  topUpdatedUser: { type: Schema.ObjectId, required: false, ref: 'User' },
});
schema.index({user: 1, year: 1, month: 1}, { unique: true });

mongoose.model('AttendanceStatus', schema);
