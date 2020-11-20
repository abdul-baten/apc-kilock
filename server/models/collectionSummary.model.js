'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

/**
 * Schema
 */
var schema = new Schema({
  name: {type:String, required: true, index: {unique: true} },
  updated: {type:Date, required: true }
});

mongoose.model('CollectionSummary', schema);
