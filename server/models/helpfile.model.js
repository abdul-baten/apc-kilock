'use strict';

var mongoose = require('mongoose');
var logger = log4js.getLogger();
var Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  filename:   { type: String, required: true },
  data:       { type: Buffer, required: true },
  uploadDate: { type: Date, required: true, default: Date.now },
});

schema.index({ filename: 1 }, { unique: true });
mongoose.model('Helpfile', schema);
