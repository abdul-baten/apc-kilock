'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

/**
 * Schema
 */
var schema = new Schema({
  name: {type:String, required: true, index: {unique: true} },
  seq: {type:Number, required: true }
});

mongoose.model('Sequence', schema);
