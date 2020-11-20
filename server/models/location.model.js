'use strict';

var mongoose = require('mongoose'),
Schema = mongoose.Schema;

/**
* Thing Schema
*/
var schema = new Schema({
  name: { type: String, required: true },
  organization: { type:Schema.ObjectId, required: true, ref:'Organization' },
});

schema.index({ name:1, organization: 1 }, { unique: true });

mongoose.model('Location', schema);
