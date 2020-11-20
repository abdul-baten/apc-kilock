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
  project: { type: Schema.ObjectId, required: true, ref: 'Project' },
  permission: { type: Number, required: true },
});
schema.index({user: 1, project: 1, permission: 1}, { unique: true });

mongoose.model('AttendancePermission', schema);
