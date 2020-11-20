'use strict';

var mongoose = require('mongoose');
var logger = log4js.getLogger();
var config = require('../config/environment');
var Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  user: { type: Schema.ObjectId, required: false, ref: 'User' },
  period: {
    start: { type: Date, required: true },
    end:   { type: Date, required: false },
  },
  times: [{
    start: { type:String, required: true },
    end:   { type:String, required: true },
  }],
});

mongoose.model('RestTime', schema);
