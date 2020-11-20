'use strict';

var mongoose = require('mongoose'),
Schema = mongoose.Schema;

/**
* Thing Schema
*/
var schema = new Schema({
  name: { type: String, required: true },
  path: { type: String, required: true, index: {unique: true} },
});

mongoose.model('Organization', schema);
