'use strict';

var mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  id: { type: Number, required: false, index: {unique: true} },
  matterGroupCode: { type:String, required: false },
  matterCode: { type:String, required: true },
  matterName: { type:String, required: false },
  contractStart:{ type:Date, required: false },
  contractEnd:{ type:Date, required: false },
  year: { type:Number, required: true },
  month: { type:Number, required: true },
  valid: { type: Boolean, required: true, default: false },
  project: { type:Schema.ObjectId, ref:'Project' },
  resources: [{
    user: { type: Schema.ObjectId, required: true, ref: 'User' },
    overtimeKPI: { type: Number, required: false },
    contractDivision: { type: String, required: false },
  }],
  updated: {type:Date, required: true, default: Date.now },
});

schema.index({ matterCode:1, year:1, month:1 }, { unique: true });

/**
 * Middlewares
 */

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
        if (model.loginToId) {
          model.login = data.seq.toString();
        }
        next();
      } else {
        logger.error(err);
        next(err || data);
      }
    }
  );
};

var versionIncrement = function (next) {
  var model = this;
  model.increment();
  next();
};

var defaultCurrentTimestamp = function (next) {
  var model = this;
  if (model.ignoreCurrentTimestamp) {
    next();
    return;
  }
  var now = Date.now();
  var CollectionSummary = mongoose.model('CollectionSummary');
  CollectionSummary.update(
    { name: model.collection.name },
    { updated: now },
    { upsert: true },
    function (err) {
      if (err) {
        logger.error(err);
        next(err);
      } else {
        model.updated = now;
        next();
      }
    }
  );
};

schema.pre('save', autoincrement);
schema.pre('save', versionIncrement);
schema.pre('save', defaultCurrentTimestamp);

mongoose.model('Matter', schema);
