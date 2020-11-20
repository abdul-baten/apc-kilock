'use strict';

var mongoose = require('mongoose');
var logger = log4js.getLogger();
var Schema = mongoose.Schema;
var Koyomi = require('koyomi');
var async = require('async');
var config = require('../config/environment');

/**
 * Thing Schema
 */
var schema = new Schema({
  user:      { type:Schema.ObjectId, required: true, ref:'User' },
  year:      { type: Number, required: true },
  month:     { type: Number, required: true },
  day:       { type: Number, required: true },
  bizAmount: { type: Number, required: true },
  note:      { type: String, required: false },
  items:     [{
    type:    { type: Number, required: true },
    purpose: { type: Number, required: true },
    amount:  { type: Number, required: true },
    routes:  [{ type: String, required: true }],
  }],
  attendanceLog: { type:Schema.ObjectId, required: true, ref:'AttendanceLog' },
});

/**
 * 交通費合計を返却
 *
 * @return 交通費合計
 */
schema.methods.getTotalAmount = function () {
  var total = 0;
  if(this.items.length > 0) {
    this.items.forEach(function(item) {
      total += item.amount ;
    });
  }
  return total;
}


schema.index({ user:1, year: 1, month: 1, day: 1 }, { unique: true });
mongoose.model('TravelCost', schema);
