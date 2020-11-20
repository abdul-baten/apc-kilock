'use strict';

var _ = require('lodash'),
  config = require('../../../config/environment'),
  logger = log4js.getLogger(),
  async = require('async'),
  mongoose = require('mongoose'),
  MailRegistrationToken = mongoose.model('MailRegistrationToken'),
  User = mongoose.model('User'),
  Puid = require('puid'),
  ObjectId = require('mongoose').Types.ObjectId,
  FamilyUser = mongoose.model('FamilyUser'),
  customValidator = require('../../../utils/validator')();

var puid = new Puid(false);
var Postbox = null;

if (config.mailer) {
  Postbox = require('../../../utils/postbox');
}

/**
 * from_emailに含まれるトークンを取得し、jsonのプロパティtokenに取得した値を追加する。
 * @param mailJson メール情報
 * @param callback
 */
var scrapeToken = function (mailJson, callback) {
  var token = (mailJson.msg.email + '').split('@')[0].replace(/^reg/, '');
  logger.debug('get token -> ' + token);

  if (token) {
    mailJson.token = token;
    callback(null, mailJson);
  } else {
    callback('IDが確認できません');
  }
};

/**
 * mailJsonに含まれる各値(送信側メールアドレス、トークン、Mandrillのevent種別)のバリデーションを行う。
 * @param mailJson メール情報
 * @returns [boolean} 確認するすべての値のバリデーションを行い、問題がなければtrue。問題があればfalse。
 */
var validationMailJsonDetail = function (mailJson) {
  var validator = require('validator');

  return (validator.isEmail(mailJson.msg.from_email) ||
    customValidator.isJpMobileEmail(mailJson.msg.from_email)) &&
    validator.isLength(mailJson.token, 14, 14) &&
    validator.equals(mailJson.event, 'inbound');
};

/**
 * 受け取ったメール情報のバリデーションを行う。
 * @param mailJson メール情報
 * @param callback
 */
var validationMailJson = function (mailJson, callback) {
  if (validationMailJsonDetail(mailJson)) {
    callback(null, mailJson);
  } else {
    callback('validation error');
  }
};

/**
 * メール登録用トークンを検索する。エラー発生またはトークンが存在しない場合はエラーとする。
 * @param mailJson メール情報
 * @param callback
 */
var findMailRegistrationToken = function (mailJson, callback) {
  MailRegistrationToken.findOne({token: mailJson.token})
    .populate('user')
    .exec(function (err, mailRegistrationToken) {
      if (err) {
        callback(err);
      } else if (!mailRegistrationToken) {
        callback('メールアドレス登録用トークンが存在しません');
      } else {
        logger.debug('find mailregistration result: ' + mailRegistrationToken);
        callback(null, mailJson, mailRegistrationToken);
      }
    }
  );
};

/**
 * トークンの期限日を生成する
 * @return Date トークン期限日となるDateオブジェクト
 */
var createTokenExpiration = function () {
  var date = new Date();
  // 期限を、現在より1時間後とする
  date.setHours(date.getHours() + 1);

  return date;
};

/**
 * 家族情報を更新可能状態にする。
 * @param mailJson メール情報
 * @param familyUser 既存の家族情報
 * @param tokenPath 家族情報用トークンの値
 * @param callback
 */
var updateFamilyUser = function (mailJson, familyUser, tokenPath, callback) {
  FamilyUser.update(
    {_id: new ObjectId(familyUser._id)},
    {$set: {
      tokenPath: tokenPath,
      tokenExpiration: createTokenExpiration()
    }},
    function (err, numberAffected) {
      if (err) {
        callback(err);
      } else if (numberAffected === 1) {
        callback(null, familyUser.user, tokenPath);
      } else {
        callback('FamilyUserのトークン更新が行われませんでした。');
      }
    }
  );
};

/**
 * 家族情報を登録する。
 * @param mailJson メール情報
 * @param user 登録対象ユーザ
 * @param tokenPath 家族情報用トークンの値
 * @param callback
 */
var createFamilyUser = function (mailJson, user, tokenPath, callback) {
  var familyUser = new FamilyUser({
    mail: mailJson.msg.from_email,
    user: user,
    mailActivated: false,
    tokenPath: tokenPath,
    tokenExpiration: createTokenExpiration()
  });

  familyUser.save(function (err, familyUserSaveResult) {
    if (err) {
      callback(err);
    } else {

      if (!_.isArray(user.family)) {
        user.family = [];
      }
      user.family.push(familyUserSaveResult);

      user.save(function (familyAppendErr) {
        if (familyAppendErr) {
          callback(familyAppendErr);
        } else {
          callback(null, user, familyUserSaveResult.tokenPath);
        }
      });
    }
  });
};

/**
 * まだ存在していないtokenPath(14桁)を生成する。
 * 10回生成して重複する場合はエラーとみなす。
 * @param callback
 */
var createNonDuplicateTokenPath = function (callback) {
  async.retry(10,
    function (asyncRetryDone) {
      var tokenPath = puid.generate();

      FamilyUser.findOne(
        {tokenPath: tokenPath},
        function (err, familyUser) {
          if (err) {
            asyncRetryDone(err);
          } else if (familyUser) {
            logger.warn('生成したtokenPathがすでに存在していた。tokenPath: ' + tokenPath);
            asyncRetryDone('生成したtokenPathがすでに存在している');
          } else {
            asyncRetryDone(null, tokenPath);
          }
        });
    },
    function (err, tokenPath) {
      if (err) {
        callback(err);
      } else {
        logger.debug('生成したtokenPath: ' + tokenPath);
        callback(null, tokenPath);
      }
    });
};

/**
 * 家族情報を登録する。すでに存在している場合は、更新前フラグを立てる。
 * @param mailJson メール情報
 * @param mailRegistrationToken メールアドレス登録用トークン
 * @param callback
 */
var registerFamilyUserToken = function (mailJson, mailRegistrationToken, callback) {
  async.waterfall([
      function (next) {
        async.parallel(
          {
            familyUser: function (done) {
              FamilyUser.findOne({user: mailRegistrationToken.user, mail: mailJson.msg.from_email})
                .populate('user').exec(done);
            },
            tokenPath: createNonDuplicateTokenPath
          },
          function (err, result) {
            if (err) {
              next(err);
            } else {
              logger.debug(result);
              next(null, result);
            }
          });
      },
      function (result, next) {
        if (result.familyUser) {
          updateFamilyUser(mailJson, result.familyUser, result.tokenPath, next);
        } else {
          createFamilyUser(mailJson, mailRegistrationToken.user, result.tokenPath, next);
        }
      }
    ],
    function (err, user, tokenPath) {
      if (err) {
        callback(err);
      } else {
        callback(null, mailJson, user, tokenPath);
      }
    }
  );
};

/**
 * 送信するメールの本文を生成する。
 *
 * @param userId {String} 登録対象ユーザのID
 * @param tokenPath {String} 家族登録用トークン
 * @returns {String} メール本文
 */
var createMailBody = function (userId, tokenPath) {
  var url = config.familyRegistrationUrl || '';

  var body = '以下のURLより、メールアドレスの本登録を完了させてください。\n\n\n:url/user/:userId/family/:tokenPath';
  body = body.replace(':url', url);
  body = body.replace(':userId', userId);
  body = body.replace(':tokenPath', tokenPath);

  return body;
};

/**
 * 家族情報に関する処理が完了後に、メールを送信する。
 * @param mailJson メール情報
 * @param user 登録対象ユーザ
 * @param tokenPath 家族情報用トークンの値
 * @param callback
 */
var sendMailToFamilyUser = function (mailJson, user, tokenPath, callback) {
  var to = [mailJson.msg.from_email];
  var subject = 'メール配信サービス登録';
  var body = createMailBody(user.id, tokenPath);
  var mandrillTag = 'tag';

  if (Postbox === null) {
    logger.warn('not found mail settings.');
    callback();
    return;
  }

  Postbox.postMailGeneral(to, subject, body, mandrillTag,
    function (err) {
      if (err) {
        callback(err);
      } else {
        logger.debug('メールを送信しました to:' + to);
        callback();
      }
    });
};

/**
 * Mandrillからメール送信情報を受け取る。
 * @param req リクエスト
 * @param res レスポンス
 */
exports.webhookReciever = function (req, res) {
  var mailJsonArray = JSON.parse(req.body.mandrill_events);

  res.status(200);
  res.json({status: 'ok'});

  logger.info('mailJson length: ' + mailJsonArray.length);

  // json情報毎に処理を並列で実行する
  async.each(mailJsonArray,
    function (mailJson, done) {
      async.waterfall(
        [
          // 値の設定
          function (next) {
            next(null, mailJson);
          },
          // トークン取得
          scrapeToken,
          // バリデーション
          validationMailJson,
          // トークン存在確認
          findMailRegistrationToken,
          // 登録 or 更新処理
          registerFamilyUserToken,
          // メール送信処理
          sendMailToFamilyUser
        ],
        function (err) {
          if (err) {
            logger.error('error detail: ' + err);
            logger.error(mailJson);
            done(err);
          } else {
            done();
          }
        }
      );
    },
    function (err) {
      if (err) {
        logger.error('エラーが発生しました。確認してください。');
        logger.error(err);
      } else {
        logger.info('家族登録用トークン処理が完了しました。');
      }
    }
  );
};
