'use strict';

var mongoose = require('mongoose');
var logger = log4js.getLogger();
var Schema = mongoose.Schema;
var datetimeutil = require('../utils/datetimeutil');
var workReport = require('../utils/workReport');
var Koyomi = require('koyomi');
var async = require('async');
var config = require('../config/environment');
var AttendanceLog = mongoose.model('AttendanceLog');

/**
 * Thing Schema
 */
var schema = new Schema({
  timecard: { type:Schema.ObjectId, required: false, ref:'Timecard' },
  user: { type:Schema.ObjectId, required: true, ref:'User' },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  day: { type: Number, required: true },
  beforeMatter: { type:Schema.ObjectId, required: false, ref:'Matter' },
  beforeInTimestamp: { type:Date, required: false },
  beforeOutTimestamp: { type:Date, required: false },
  beforeRestHours: { type: Number, required: false },
  afterMatter: { type:Schema.ObjectId, required: false, ref:'Matter' },
  afterInTimestamp: { type:Date, required: false },
  afterOutTimestamp: { type:Date, required: false },
  afterRestHours: { type: Number, required: false },
  updateUser: { type:Schema.ObjectId, required: true, ref:'User' },
});

schema.index({ timecard:1, updateUser:1 }, { unique: false });

mongoose.model('TimecardEditing', schema);
