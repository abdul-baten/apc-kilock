'use strict';

var mongoose = require('mongoose');
var logger = log4js.getLogger();
var Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  userId: {
    type: Number,
    required: true
  },
  loginUser: {
    type: Schema.ObjectId,
    required: true,
    ref: 'User'
  },
  year: {
    type: Number,
    required: true
  },
  month: {
    type: Number,
    required: true
  },
  day: {
    type: Number,
    required: true
  },
  attendanceTime: {
    type: String,
    required: false
  },
  timecardTime: {
    type: String,
    required: false
  },
  errorHappened: {
    type: Date,
    required: true,
    default: Date.now
  },
});


schema.index({
  user: 1,
  year: 1,
  month: 1,
  day: 1
}, {
  unique: false
});

mongoose.model('TimeCardLog', schema);
