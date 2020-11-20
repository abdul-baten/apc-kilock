'use strict';

var _ = require('lodash');
var mongoose = require('mongoose');
var User = mongoose.model('User');
var FamilyUser = mongoose.model('FamilyUser');
var logger = log4js.getLogger();
var validator = require('../../utils/validator');
var config = require('../../config/environment');
var async = require('async');

var common = function (res, reqParam, callback) {
  FamilyUser.findOne({
    tokenPath: reqParam.token,
    tokenExpiration: { $gt: Date.now() },
  })
  .populate('user')
  .exec(function (err, familyUser) {
    if (err) {
      logger.error(err);
      res.status(500);
      return res.send(500);
    }
    if (!familyUser || !familyUser.user ||
      familyUser.user.id !== reqParam.userId) {
      // 条件が一致しない
      res.status(403);
      return res.send(403);
    }
    callback(familyUser);
  });
};

exports.get = function (req, res) {
  validator(req).checkQuery('userId').notEmpty().isInt();
  validator(req).checkQuery('token').notEmpty();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParam = {
    userId: parseInt(req.query.userId),
    token: req.query.token,
  };
  common(res, reqParam, function (familyUser) {
    res.status(200);
    return res.json({
      user: {
        name: familyUser.user.name || '',
      },
      family: {
        name: familyUser.name || '',
        mail: familyUser.mail || '',
        mailActivated: familyUser.mailActivated || false
      },
    });
  });
};

exports.post = function (req, res) {
  validator(req).checkBody('userId').notEmpty();
  validator(req).checkBody('token').notEmpty();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParam = {
    userId: parseInt(req.body.userId),
    token: req.body.token,
    familyName: req.body.familyName,
  };
  common(res, reqParam, function (familyUser) {
    // メールアクティベート処理
    familyUser.name = reqParam.familyName;
    familyUser.mailActivated = true;
    familyUser.tokenExpiration = new Date(0);
    familyUser.save(function (err) {
      if (err) {
        logger.error(err);
        res.status(500);
        return res.send(500);
      }
      // レスポンス
      res.status(200);
      res.json({
        result: 'OK',
      });
      // メール送信(非同期)
      if (!config.mailer) {
        logger.warn('not found mail settings.');
        return;
      }
      FamilyUser.populate(familyUser.user, 'family', function (err, user) {
        if (err) {
          logger.error(err);
          return;
        }
        var to = _(user.family).filter(function (familyUser) {
          return familyUser.mailActivated && familyUser.mail;
        }).pluck('mail').value();
        if (to.length === 0) {
          // 送信先がない
          return;
        }
        var Postbox = require('../../utils/postbox');

        // TODO メールテンプレートをDBに持つ
        var mailBody = [
          'メール配信先に以下のアドレスが追加されました。',
          familyUser.mail,
          'このメールに覚えのない場合は塾クセジュ本部イデアル(0120-542-901)までお問い合わせください。',
        ].join('\n');

        Postbox.postMailGeneral(
          to,
          'メール配信サービス登録完了',
          mailBody,
          'tag',
          function (err) {
            if (err) {
              logger.error(err);
              return;
            }
            logger.info('メールを送信しました to:' + to);
          });
      });
    });
  });
};

/**
 * リクエストにて受け取ったメールアドレスと同一のメールアドレスが登録されている家族を削除する。
 * @param {Object} req リクエストオブジェクト
 * @param {Object} res レスポンスオブジェクト
 */
exports.delete = function (req, res) {
  var validateMailAddress = function (mailAddress) {
    var validator = require('validator');
    var customValidator = require('../../utils/validator')();

    return validator.isEmail(mailAddress) ||
      customValidator.isJpMobileEmail(mailAddress);

  };

  validator(req).checkBody('userId').notEmpty().isInt();
  validator(req).checkBody('token').notEmpty().isLength(14, 14);
  validator(req).checkBody('mailAddress').notEmpty();
  var validateErrors = req.validationErrors();
  var mailAddressFormat = validateMailAddress(req.body.mailAddress);

  if (validateErrors || !mailAddressFormat) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    logger.info('mailValidation: ' + mailAddressFormat);
    res.status(400);
    res.end();
    return;
  }

  var reqParam = {
    userId: parseInt(req.body.userId),
    token: req.body.token
  };

  /**
   * メールを送信する。家族削除後に実行する。
   * @param {Array} to 宛先
   * @param {String} deleteOperationFamilyMailAddress 削除操作を行った家族のメールアドレス
   * @param {String} deleteTargetFamilyMailAddress 削除された家族のメールアドレス
   */
  var sendMailForFamilyDeleteAfter = function (to, deleteOperationFamilyMailAddress, deleteTargetFamilyMailAddress) {
    // TODO メールテンプレートをDBに持つ
    var mailBody = [
      deleteOperationFamilyMailAddress + ' のアドレスから、下記のアドレスが削除されました。',
      '',
      '削除アドレス: ' + deleteTargetFamilyMailAddress,
      '',
      'このメールに覚えのない場合は塾クセジュ本部イデアル(0120-542-901)までお問い合わせください。'
    ].join('\n');

    logger.debug(mailBody);

    // メール送信(非同期)
    if (!config.mailer) {
      logger.warn('not found mail settings.');
      return;
    }

    var Postbox = require('../../utils/postbox');
    Postbox.postMailGeneral(
      to,
      '配信用アドレス削除',
      mailBody,
      'family_delete',
      function (err) {
        if (err) {
          logger.error(err);
          res.end();
          return;
        }
        logger.info('メールを送信しました to:' + to);
      });
  };

  /**
   * req.mailAddressの内容と等しいメールアドレスを所有する家族を削除する。
   * なお、この関数は共通処理実行後のcallbackとして利用される。
   * @param deleteOperationFamilyUser 家族削除処理を実行している家族ユーザのドキュメント
   */
  var deleteFamilyUser = function (deleteOperationFamilyUser) {
    // ユーザが1度でも登録処理が完了しているか確認
    if (!deleteOperationFamilyUser.mailActivated) {
      res.status(403);
      res.end();
      return;
    }

    async.waterfall(
      [
        // 処理完了後のメール送信先を取得する。
        function (waterfallDone) {
          FamilyUser.populate(deleteOperationFamilyUser.user, 'family', function (err, user) {
            if (err) {
              res.status(500);
              waterfallDone(err);
              return;
            }

            var to = _(user.family).filter(function (familyUser) {
              return familyUser.mailActivated && familyUser.mail;
            }).pluck('mail').value();
            if (to.length === 0) {
              res.status(500);
              waterfallDone('メール送信先が存在しません');
            } else {
              logger.debug('メール送信先:' + to);
              waterfallDone(null, to);
            }
          });
        },

        // 家族の削除
        function (to, waterfallDone) {
          FamilyUser.populate(deleteOperationFamilyUser.user, 'family', function (err, user) {
            if (err) {
              res.status(500);
              waterfallDone(err);
            }

            var deleteTargetFamilyUser = _.find(user.family, function (familyUser) {
              return familyUser.mail && (familyUser.mail === req.body.mailAddress);
            });

            // 削除対象ユーザの存在確認
            if (!deleteTargetFamilyUser) {
              res.status(404);
              waterfallDone('削除対象ユーザが存在しません');
              return;
            }

            user.family.remove(deleteTargetFamilyUser);
            async.parallel(
              [
                function (parallelCallback) {
                  user.save(parallelCallback);
                },
                function (parallelCallback) {
                  deleteTargetFamilyUser.remove(parallelCallback);
                },
                // トークン期限切れ対応
                function (parallelCallback) {
                  if (deleteOperationFamilyUser.mail === deleteTargetFamilyUser.mail) {
                    parallelCallback();
                  } else {
                    deleteOperationFamilyUser.tokenExpiration = new Date(0);
                    deleteOperationFamilyUser.save(parallelCallback);
                  }
                }
              ],
              function (err) {
                if (err) {
                  res.status(500);
                  waterfallDone(err);
                } else {
                  waterfallDone(null, to, deleteTargetFamilyUser.mail);
                }
              });
          });
        },
      ],
      function (err, to, deleteTargetFamilyMailAddress) {
        if (err) {
          logger.error(err);
          res.end();
        } else {
          res.status(200);
          res.json({});
          sendMailForFamilyDeleteAfter(to, deleteOperationFamilyUser.mail, deleteTargetFamilyMailAddress);
        }
      });
  };

  common(res, reqParam, deleteFamilyUser);
};
