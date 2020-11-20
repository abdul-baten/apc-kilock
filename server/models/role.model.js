'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

/**
* Thing Schema
*/
var schema = new Schema({
  name: { type: String, required: true },
  organization: { type:Schema.ObjectId, required: false, ref:'Organization' },
});

schema.index({ name:1, organization: 1 }, { unique: true });

schema.virtual('shouldMail').get(function () {
  // FIXME 権限などで判別させる
  if (this.name === '生徒' ||
      this.name === '社員') {
    return true;

  } else {
    return false;
  }

//  return (this.name === '生徒');
});

mongoose.model('Role', schema);
