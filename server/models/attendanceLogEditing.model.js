'use strict';

var mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  attendanceLog: { type:Schema.ObjectId, required: false, ref:'AttendanceLog' },
  user: { type:Schema.ObjectId, required: true, ref:'User' },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  day: { type: Number, required: true },
  beforeReasonOfEditing: { type:String, required: false },
  beforeAttendanceType: {type: Schema.ObjectId, required: false, ref: 'AttendanceType'},
  afterReasonOfEditing: { type:String, required: false },
  afterAttendanceType: {type: Schema.ObjectId, required: false, ref: 'AttendanceType'},
  updateUser: { type:Schema.ObjectId, required: true, ref:'User' },
});

schema.index({ attendanceLog: 1, updateUser: 1 }, { unique: true });

mongoose.model('AttendanceLogEditing', schema);
