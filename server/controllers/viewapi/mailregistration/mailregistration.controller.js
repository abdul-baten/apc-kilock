'use strict';

var config = require('../../../config/environment'),
  logger = log4js.getLogger(),
  async = require('async'),
  mongoose = require('mongoose'),
  MailRegistration = mongoose.model('MailRegistration'),
  User = mongoose.model('User'),
  uuid = require('node-uuid'),
  ObjectId = require('mongoose').Types.ObjectId,
  validator = require('../../../utils/validator');

/**
 * バリデーションの結果を確認し、問題がある場合はresponseを返す。
 * @param req リクエスト
 * @param res レスポンス
 * @return boolean バリデーションで引っかかった場合はtrue,それ以外はfalse
 */
var validation = function (req, res) {
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    res.json(validateErrors);
    return true;
  }

  return false;
};

/**
 * エラーレスポンス
 * @param res レスポンス
 * @param err エラー内容
 */
var responseError = function (res, err, mailRegistration) {
  logger.error(err);
  res.status(500);

  if (mailRegistration) {
    res.json(createResponseRegisterJson(mailRegistration));
  } else {
    res.json({});
  }
};

/**
 * メールアドレス登録権限があるか確認する
 * @param requestUserId リクエストパラメータとして送られてきたユーザID
 * @param sessionUserId セッションに格納されているユーザID
 * @param isAdmin 管理者権限
 * @return boolean メールアドレス登録権限がある場合はtrue,それ以外はfalse
 */
var isInvalidUser = function (requestUserId, sessionUserId, isAdmin) {
  return !((requestUserId === (sessionUserId + '')) || isAdmin);
};

/**
 * トークンの期限日を生成する。
 * @return Date トークン期限日となるDateオブジェクト
 */
var createExpirationDate = function () {
  var date = new Date();
  // 期限日を、現在より30日後とする
  date.setDate(date.getDate() + 30);

  return date;
};

/**
 * メール登録用トークンに関する情報をJSON形式で返す。
 * @param mailRegistration メール登録用トークン
 * @returns {{registerId: (*|schema.registerUuid), expiration: (*|schema.registerExpiration)}}
 */
var createResponseRegisterJson = function(mailRegistration) {
  return {
    registerId: mailRegistration.registerUuid,
    expiration: mailRegistration.registerExpiration
  };
};

/**
 * メールアドレス登録の申請を行う。
 * @param req リクエスト
 * @param res レスポンス
 */
exports.publish = function (req, res) {
  validator(req).checkParams('id').isInt();

  if (validation(req, res)) return;
  if (isInvalidUser(req.params.id, req.user.id,
    req.user.admin)) return responseError(res, '権限がありません');

  async.waterfall([
      //ユーザの取得
      function (callback) {
        User.findOne({id: req.params.id}).exec(function (err, user) {
          if (err) {
            callback(err);
          } else if (!user) {
            callback('ユーザが存在しない');
          } else {
            callback(null, user);
          }
        });
      },
      function (user, callback) {
        MailRegistration.findOne({$and: [
            {user: user},
            {status: {$ne: 'authorized' }},
            {$or: [
              {registerExpiration: {$gt: Date.now()}},
              {authorizeExpiration: {$gt: Date.now()}}
            ]}
          ]},
          function (err, mailRegistration) {
            if (err) {
              callback(err);
            } else if (mailRegistration) {
              callback('申請中の内容が存在する。', user, mailRegistration);
            } else {
              callback(null, user);
            }
          });
      }
    ],
    function (err, user, mailRegistration) {
      if (err) {
        responseError(res, err, mailRegistration);
        return;
      }

      var document = new MailRegistration({
        user: user, status: 'request', registerUuid: uuid.v1(),
        authorizeUuid: uuid.v1(),
        registerExpiration: createExpirationDate()
      });

      document.save(function (err, mailRegistration) {
        if (err) {
          responseError(res, err);
          return;
        }

        res.status(200);
        res.json(createResponseRegisterJson(mailRegistration));
        return;
      });
    }
  );
};

/**
 * URLパラメータに指定したidと有効なuuidが存在する場合、idに対応するユーザのメールアドレスを変更する。
 * @param req リクエスト
 * @param res レスポンス
 */
exports.register = function (req, res) {
  validator(req).checkParams('id').isInt();
  validator(req).checkParams('uuid').notEmpty();
  validator(req).checkBody('mail').isEmail();

  if (validation(req, res)) return;

  async.waterfall([
      // ユーザの取得
      function (callback) {
        User.findOne({id: req.params.id}).exec(function (err, user) {
          if (err) {
            callback(err);
          } else if (!user) {
            callback('ユーザが存在しない');
          } else {
            callback(null, user);
          }
        });
      },
      // トークンの取得
      function (user, callback) {
        MailRegistration.findOne({$and: [
            {user: user},
            {status: 'request' },
            {registerUuid: req.params.uuid},
            {$or: [
              {registerExpiration: {$gt: Date.now()}}
            ]}
          ]},
          function (err, mailRegistration) {
            if (err) {
              callback(err);
            } else if (!mailRegistration) {
              callback('トークンが存在しない');
            } else {
              callback(null, user, mailRegistration);
            }
          });
      },
      // ユーザのメールアドレス更新
      function (user, mailRegistration, callback) {
        User.update({_id: new ObjectId(user._id)}, {$set: {mail: req.body.mail}},
          function (err, numberAffected) {
            if (err) {
              callback(err);
            } else if (numberAffected === 1) {
              callback(null, user, mailRegistration);
            } else {
              callback('ユーザのメールアドレスが更新されていません。');
            }
          });
      }
    ],
    function (err, user, mailRegistration) {
      if (err) {
        responseError(res, err);
      }
      MailRegistration.update(
        {_id: new ObjectId(mailRegistration._id)},
        {$set: {status: 'authorized'}},
        function (err, numberAffected) {
          if (err) {
            responseError(res, err);
          } else if (numberAffected === 1) {
            res.status(200);
            res.json({status: true});
          } else {
            responseError(res, 'mailregistrationのstatusが更新されていません');
          }
        });
    });
};

