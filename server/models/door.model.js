'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var ActionType = [
  'open',
  'passonly',
];

/**
 * Thing Schema
 */
var schema = new Schema({
  key: { type: String, required: true, index: {unique: true} },
  name: { type: String, required: true },
  action: { type: String, required: true, enum: ActionType, },
  location: { type:Schema.ObjectId, required: false, ref:'Location' },
});

mongoose.model('Door', schema);
