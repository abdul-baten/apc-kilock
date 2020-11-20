'use strict';

var mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  config = require('../config/environment'),
  Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({

  // autoincrementを使用するのでrequiredを有効にしない
  id: { type: Number, required: false, index: {unique: true} },

  // テンプレート名
  name: { type:String, required: true },

  // 休憩時間
  times: [{
    start: { type:String, required: true },
    end:   { type:String, required: true },
  }],
});


var autoincrement = function (next) {
  var model = this;
  if (!model.isNew) {
    next();
    return;
  }
  var Sequence = mongoose.model('Sequence');
  Sequence.findOneAndUpdate(
    { name: model.collection.name },
    { $inc: { seq: 1 } },
    { upsert: true },
    function (err, data) {
      if (!err && data) {
        model.id = data.seq;
        next();
      } else {
        logger.error(err);
        next(err || data);
      }
    }
  );
};

schema.pre('save', autoincrement);

mongoose.model('RestTimeTemplate', schema);
