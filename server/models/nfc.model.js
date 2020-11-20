'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  number: { type: String, required: true, index: {unique: true} },
  user: { type:Schema.ObjectId, required: true, ref:'User', childPath:'nfcs' },
  temp: {type: Boolean, required: false }
});

/**
 * Validations
 */
// schema.path('xxx').validate(function (value) {
//   return true;
// }, 'xxx is invalid');

mongoose.model('Nfc', schema);
