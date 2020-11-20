'use strict';

var mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Schema = mongoose.Schema;

/**
 * Thing Schema
 */
var schema = new Schema({
  // autoincrementを使用するのでrequiredを有効にしない
  id: { type: Number, required: false, index: {unique: true} },
  // グループ名
  name: { type: String, required: true },
  // 表示順
  displayOrder: { type: Number, required: true, default: 2147483647, index: true },
  // true: 有効, false: 無効
  enabled: { type: Boolean, required: true, default: false },
  // 所属組織
  organization: { type:Schema.ObjectId, required: false, ref:'Organization' },
  // ユーザ一覧
  users: [{ type:Schema.ObjectId, ref:'User' }],
  // グループタグ一覧
  tags: [{ type:Schema.ObjectId, ref:'GroupTag' }],
  // 取得元名
  sourcename: { type: String, required: true },
  // 取得元種別
  sourcetype: { type: String, required: true },
  // ソース @deprecated sourcedataに変更 使用箇所がなくなり次第削除
  source: { type: Object, required: false },
  // ソース情報
  sourcedata: { type: Object, required: false },
  // 同期日時
  synchronizedAt: {type:Date, required: true, default: Date.now },
  // 更新日時
  updated: {type:Date, required: true, default: Date.now }
});

schema.index({ displayOrder:1, name: 1 });

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

mongoose.model('Group', schema);
