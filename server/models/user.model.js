'use strict';

var mongoose = require('mongoose');
var _ = require('lodash');
var logger = log4js.getLogger();
var Schema = mongoose.Schema;
var async = require('async');

/**
 * Schema
 */
var schema = new Schema({
  // autoincrementを使用するのでrequiredを有効にしない
  id: { type: Number, required: false, index: {unique: true} },
  // 名前
  name: { type: String, required: true },
  // 姓 @deprecated
  lastname: { type: String, required: false },
  // 名 @deprecated
  firstname: { type: String, required: false },
  // ログインID
  login: { type: String, required: true },
  // ユーザ番号
  code: { type: String, required: false },
  // メールアドレス
  mail: { type: String },
  // SIP URI
  sipuri: { type: String },
  // 内線番号
  extensionPhoneNumber: { type: String },
  // NFC一覧
  nfcs: [{ type:Schema.ObjectId, ref:'Nfc' }],
  // 電話番号一覧
  phones: [{ type:Schema.ObjectId, ref:'Phone' }],
  // 管理権限
  admin: { type: Boolean, required: true, default: false },
  // 総務確定権限
  top: { type: Boolean, required: true, default: false },
  // 管理できるグループのID
  manageGroups: [ { type: Number, required: false }],
  // デバイス一覧
  devices: [{ type:Schema.ObjectId, ref:'Device' }],
  // 画像URL
  imageurl: { type: String },
  // プロフィール
  profile: { type: String },
  // 社員番号
  employeeCode: { type: Number },
  // 表示順
  displayOrder: { type: Number, required: true, default: 2147483647, index: true },
  // 鍵開け
  doorOpen: { type: Boolean, required: true, default: false },
  // true: 有効, false: 無効
  enabled: { type: Boolean, required: true, default: false },
  // 所属組織
  organization: { type:Schema.ObjectId, required: false, ref:'Organization' },
  // 役割
  roles: [ { type: Schema.ObjectId, ref: 'Role'} ],
  // 家族
  family: [ { type:Schema.ObjectId, ref:'FamilyUser' } ],
  // 案件
  matters: [ { type:Schema.ObjectId, ref:'Matter' } ],
  // 適用中の休憩時間テンプレート
  restTimeTemplate: { type: Schema.ObjectId, ref: 'RestTimeTemplate'},
  // ソース情報一覧
  sources: [{
    // ソース
    source: { type: Schema.ObjectId, required: true, ref: 'Source'},
    // ソース情報
    data: { type: Object, required: true },
    // 主要フラグ
    primary: { type: Boolean, required: true, default: false },
    // 同期日時
    synchronizedAt: {type:Date, required: true, default: Date.now },
  }],
  // ソース名 @deprecated 使用箇所がなくなり次第削除
  sourcename: { type: String, required: true },
  // ソース種別 @deprecated 使用箇所がなくなり次第削除
  sourcetype: { type: String, required: true },
  // ソース情報 @deprecated 使用箇所がなくなり次第削除
  source: { type: Object, required: true },
  // 同期日時 @deprecated 使用箇所がなくなり次第削除
  synchronizedAt: {type:Date, required: true, default: Date.now },
  // 更新日時
  updated: {type:Date, required: true, default: Date.now }
});

schema.index({ login:1, organization: 1 }, { unique: true });

/**
 * Validations
 */
// schema.path('xxx').validate(function (value) {
//   return true;
// }, 'xxx is invalid');

/**
 * Methods
 */

/**
 * @param callback {Function} - コールバック関数
 */
schema.statics.populateSource = function (callback) {
   return function (err, result) {
     if (err) {
       return callback(err);
     }
     mongoose.model('Source').populate(result, 'sources.source', callback);
   };
};

/**
 * sourcesから対象のソースに一致するソース情報を取得する
 * @param targetSource {Source} - 対象のソース
 */
schema.methods.findSource = function (targetSource, model) {
  model = model || this;
  return _(model.sources).find(function (source) {
    if (!source || !source.source) {
      return false;
    }
    // if (!source.source.model) {
    //   throw new Error('source do not populated.');
    // }
    return source.source.equals(targetSource);
  });
};

/**
 * sourcesに対象のソースが含まれているか
 * @param targetSource {Source} - 対象のソース
 * @return {Boolean} - trueなら主要ソースが含まれている
 */
schema.methods.containSource = function (targetSource, model) {
  model = model || this;
  return !!schema.methods.findSource(targetSource, model);
};

/**
 * 対象のソースが主要ソースか確認
 * @param targetSource {Source} - 対象のソース
 * @return {Boolean} - trueなら主要ソース
 */
schema.methods.isPrimarySource = function (targetSource, model) {
  model = model || this;
  if (!model.sources || model.sources.length === 0) {
    // ソースを持っていない
    return false;
  }
  var primarySource = _(model.sources).find(function (source) {
    return source.primary;
  });
  // primaryがtrueでないなら先頭を取得
  primarySource = primarySource || model.sources[0];
  if (!primarySource || !primarySource.source) {
    // ソースを持っていない
    return false;
  }
  return primarySource.source.equals(targetSource);
};

/**
 * ソースを重複しないように追加する
 * @param source {Source} - 追加するソース
 * @param data {Object} - 追加するソース情報
 * @param overwite {Boolean} - trueなら上書き
 * @return {Boolean} - 追加または上書きされたかどうか
 */
schema.methods.addToSetSource = function (source, data, overwite, model) {
  model = model || this;
  if (!model.sources || !_.isArray(model.sources) || model.sources.length === 0) {
    model.sources = [];
  }
  var sourceData = schema.methods.findSource(source, model);
  if (!sourceData) {
    model.sources.push({
      source: source,
      data: data,
      // 主要ソースがなければこれを主要にする
      primary: model.sources.length === 0,
    });
    return true;
  } else if (overwite) {
    sourceData.data = data;
    return true;
  }
  return false;
};

schema.methods.removeSource = function (targetSource, model) {
  model = model || this;
  var sourceData = schema.methods.findSource(targetSource, model);
  var removeIndex = model.sources.indexOf(sourceData);
  if (removeIndex >= 0) {
    model.sources.splice(removeIndex);
  }
};

schema.methods.autoLoginId = function (model) {
  model = model || this;
  // loginはidと一致させるのでログインとりあえずタイムスタンプを入れる
  model.login = (new Date()).getTime().toString();
  model.loginToId = true;
  return model;
};

schema.methods.retrieveMailRecipients = function (callback) {
  var mailRecipients = function (familyList) {
    if (!familyList || familyList.length == 0) {
      return [];
    }

    var recipients = [];
    _.forEach(familyList, function (elem) {
      if (!elem.mailActivated) {
        return;
      }
      if (!elem.mail || elem.mail.length == 0) {
        return;
      }
      recipients.push({name: elem.name, address: elem.mail});
    });
    return recipients;
  };

  if (this.populated('family')) {
    callback(null, mailRecipients(this.family));
    return;
  }

  this.populate('family', function (err, user) {
    if (err) {
      callback(err);
      return;
    }
    callback(null, mailRecipients(user.family));
  });
};

schema.statics.getShiftType = function () {
  return ShiftType;
};

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

mongoose.model('User', schema);
