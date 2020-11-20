'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
    
/**
 * Thing Schema
 */
var schema = new Schema({
  outsideCall: String,
  extension: String,
  user: { type:Schema.ObjectId, required: true, ref:'User', childPath:'phones' }
});

/**
 * Validations
 */
// schema.path('xxx').validate(function (value) {
//   return true;
// }, 'xxx is invalid');

mongoose.model('Phone', schema);
