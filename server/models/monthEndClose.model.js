'use strict';

var mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  Schema = mongoose.Schema;

var CloseStatus = [
  'closed',
  'not close'
];

/**
 * Thing Schema
 */
var schema = new Schema({
  user: { type: Schema.ObjectId, required: true, ref: 'User' },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  closeStatus: { type: String, required: true, enum: CloseStatus },
  updated: {type: Date, required: true, default: Date.now }
});

schema.index({ user: 1, year: 1, month: 1 }, { unique: true });

mongoose.model('MonthEndClose', schema);
