'use strict';

var mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Schema = mongoose.Schema;

/**
 * Schema
 */
var schema = new Schema({
  passTypeId: { type: Number, required: true, unique: true},
  subject: { type: String, required: true },
  text: { type: String, required: true },
});

mongoose.model('MailTemplate', schema);
