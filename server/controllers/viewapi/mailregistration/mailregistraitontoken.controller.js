'use strict';

var config = require('../../../config/environment'),
  logger = log4js.getLogger(),
  async = require('async'),
  mongoose = require('mongoose'),
  MailRegistrationToken = mongoose.model('MailRegistrationToken'),
  User = mongoose.model('User'),
  Puid = require('puid'),
  ObjectId = require('mongoose').Types.ObjectId,
  _ = require('lodash'),
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
 * トークンのUUID含んだレスポンスの生成を行う。
 * @param mailRegistrationToken メールアドレス登録用トークン
 * @returns {{token: (*|schema.uuid|reqParams.uuid|device.uuid|uuid|jQuery.uuid)}}
 */
var createResponseJson = function (mailRegistrationToken) {
  return {
    token: mailRegistrationToken.token,
    domain: config.mailer.recieveDomain
  };
};

/**
 * エラーレスポンス
 * @param res レスポンス
 * @param err エラー内容
 * @param mailRegistrationToken メールアドレス登録用トークン
 */
var responseError = function (res, err, mailRegistrationToken) {
  logger.error(err);
  res.status(500);

  // すでにトークンが存在している場合は、発行済みトークンのUUIDを返す。
  if (mailRegistrationToken) {
    res.json(createResponseJson(mailRegistrationToken));
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
 * トークン文字列の生成を行い、生成したトークンがすでに利用されていないことを確認する。
 * トークンが利用されていなければ、コールバック関数に値を受け渡す。
 * @param {Function} callback コールバック関数
 */
var createTokenString = function (callback) {
  var puid = new Puid(false);
  var token = puid.generate();

  MailRegistrationToken.findOne(
    {token: token},
    function (err, mailRegistrationToken) {
      if (err) {
        callback(err);
      } else if (mailRegistrationToken) {
        callback('同じトークンがすでに存在している');
      } else {
        callback(null, token);
      }
    });
};

/**
 * 家族登録用トークンの生成を行う。
 * @param {Object} user トークン生成対象ユーザ
 * @param {Function} callback コールバック関数
 */
var registrationTokenProcess = function (user, callback) {
  async.retry(5,
    function (retryCallback) {
      async.waterfall([
          createTokenString,
          function (token, waterfallCallback) {
            var document = new MailRegistrationToken({user: user, token: token});
            document.save(function (errSave, mailRegistrationToken) {
              if (errSave) {
                waterfallCallback(errSave);
              } else {
                waterfallCallback(null, mailRegistrationToken);
              }
            });
          }
        ],
        function (err, mailRegistrationToken) {
          if (err) {
            retryCallback(err);
          } else {
            logger.debug(user.name + ' -> ' + mailRegistrationToken.token);
            retryCallback(null, mailRegistrationToken);
          }
        });
    },
    function (err, mailRegistration) {
      if (err) {
        callback(err);
      } else {
        callback(null, mailRegistration);
      }
    });
};

/**
 * 保護者メールアドレス登録用トークンを生成する。
 * @param req リクエスト
 * @param res レスポンス
 */
exports.createToken = function (req, res) {
  validator(req).checkParams('id').isInt();

  if (validation(req, res)) return;
  if (isInvalidUser(req.params.id,
    req.user.id,
    req.user.admin)
    ) return responseError(res, '権限がありません');

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
        MailRegistrationToken.findOne({user: user},
          function (err, mailRegistrationToken) {
            if (err) {
              callback(err);
            } else if (mailRegistrationToken) {
              callback('すでにユーザがトークンを保持している', user, mailRegistrationToken);
            } else {
              callback(null, user);
            }
          });
      },
    ],
    function (err, user, mailRegistrationToken) {
      if (err) {
        responseError(res, err, mailRegistrationToken);
        return;
      }
      registrationTokenProcess(user, function (err, mailRegistrationToken) {
        if (err) {
          responseError(res, err);
        } else {
          res.status(200);
          res.json(createResponseJson(mailRegistrationToken));
        }
      });
    }
  );
};

/**
 * 全ユーザの家族登録用トークンを生成する。
 * @param {Object} req リクエストオブジェクト
 * @param {Object} res レスポンスオブジェクト
 */
exports.bulk = function (req, res) {
  if (!(req.user && req.user.admin)) {
    res.status(401);
    res.end();
    return;
  }

  async.waterfall(
    [
      function (done) {
        async.parallel({
          allUsers: function (parallelDone) {
            User.find({}).exec(parallelDone);
          },
          allMailRegistrationTokens: function (parallelDone) {
            MailRegistrationToken.find({}).exec(parallelDone);
          }
        }, function (err, result) {
          if (err) {
            done(err);
          } else {
            done(null, result);
          }
        });
      },
      // トークン登録を行うユーザの抽出
      function (result, done) {
        if (!result.allUsers || (result.allUsers.length === 0)) {
          done('ユーザが存在しません');
          return;
        }

        logger.debug('user num: ' + result.allUsers.length);

        if (!result.allMailRegistrationTokens || (result.allMailRegistrationTokens.length === 0)) {
          done(null, result.allUsers);
        } else {
          logger.debug('token num: ' + result.allMailRegistrationTokens.length);

          var allUsers = result.allUsers;
          var allMailRegistrationTokens = result.allMailRegistrationTokens;

          var filterdUser = allUsers.filter(function (user) {
            var foundToken = _.find(allMailRegistrationTokens, function (token) {
              return user._id.toString() === token.user.toString();
            });

            if (!foundToken) {
              return true;
            }
            // ユーザに対応するトークンを削除
            _.remove(allMailRegistrationTokens, function (token) {
              return token === foundToken;
            });

            return false;
          });

          done(null, filterdUser);
        }
      },
      // 家族登録用トークンの生成
      function (users, done) {
        if (users.length === 0) {
          logger.warn('すべてのユーザがトークンを保持している');
          done();
        } else {
          logger.debug('register users num: ' + users.length);

          async.eachLimit(
            users,
            10,
            registrationTokenProcess,
            function (err) {
              if (err) {
                done(err);
              } else {
                done();
              }
            });
        }
      }
    ],
    function (err) {
      if (err) {
        responseError(res, err);
      } else {
        res.status(200);
        res.end();
      }
    }
  );
};



