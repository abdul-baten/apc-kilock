'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema;

var RegistStatusType = [
  'request',
  'registered',
  'authorized'
];

/**
 * Thing Schema
 */
var schema = new Schema({
  user: {type: Schema.ObjectId, required: true, ref: 'User'},
  email: {type: String, required: false},
  status: { type: String, required: true, enum: RegistStatusType },
  registerUuid: { type: String, required: true, index: true},
  authorizeUuid: { type: String, required: true, index: true},
  registerExpiration: {type: Date, required: true },
  authorizeExpiration: {type: Date, required: false }
});

mongoose.model('MailRegistration', schema);
