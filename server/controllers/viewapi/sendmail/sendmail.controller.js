'use strict';

var config = require('../../../config/environment'),
  logger = log4js.getLogger(),
  async = require('async'),
  _ = require('lodash'),
  mongoose = require('mongoose'),
  MailTemplate = mongoose.model('MailTemplate'),
  User = mongoose.model('User'),
  Group = mongoose.model('Group'),
  FamilyUser = mongoose.model('FamilyUser'),
  validator = require('../../../utils/validator');

// 参照するテンプレートのID
var defaultTemplateId = 3;
var subjectMaxLength = 30;

var postbox = null;

if (config.mailer) {
  postbox = require('../../../utils/postbox');
}

/**
 * エラーレスポンス
 * @param {Object} res レスポンスオブジェクト
 * @param {Object} err エラーオブジェクト
 */
var responseError = function (res, err) {
  logger.error(err);
  res.status(500);
  res.json({});
};

/**
 * グループメール送信用のテンプレートを返す
 * @param {Object} req リクエストオブジェクト
 * @param {Object} res レスポンスオブジェクト
 */
exports.getTemplate = function (req, res) {
  async.waterfall([
      // セッションの確認。存在すればセッション情報を元にユーザの検索を行う。
      function (done) {
        if (!req.user) {
          done('セッションが存在しません');
        } else {
          User.findOne({id: req.user.id}).exec(done);
        }
      },
      // ユーザが存在し、管理者権限を保有しているか確認する。
      function (user, done) {
        if (user.admin) {
          done();
        } else {
          done('メール送信権限を保有していません');
        }
      },
      //メールテンプレートの取得
      function (done) {
        MailTemplate.findOne({passTypeId: defaultTemplateId}).exec(done);
      }
    ],
    function (err, result) {
      if (err) {
        responseError(res, err);
      } else if (!result) {
        responseError(res, 'メールテンプレートが存在していません');
      } else {
        res.status(200);
        res.json({
          subject: result.subject,
          text: result.text,
          textMaxLength: config.mailTemplateEditor.maxTextLength,
          subjectMaxLength: subjectMaxLength
        });
      }
    });
};

/**
 * すべてのグループに所属するユーザに対してメールを送信する。
 * @param {Object} req リクエストオブジェクト
 * @param {Object} res レスポンスオブジェクト
 * @param {Array} groups 送信先のグループ一覧
 */
var sendGroupMail = function (req, res, groups) {
  /**
   * それぞれのグループに所属するユーザの積集合を取得する
   * @param {Function}done コールバック関数
   */
  var intersectionUsers = function (done) {
    var usersList = _.pluck(groups, 'users');

    var sendUsers = _.reduce(usersList, function (userList1, userList2) {
      return _.intersection(userList1, userList2);
    });

    // 無効なユーザ除外
    sendUsers = _.filter(sendUsers, function (user) {
      return user.enabled;
    });

    if (sendUsers.length === 0) {
      done('user not exist');
    } else {
      var familyUserList = _.reduce(_.pluck(sendUsers, 'family'), function (familyList1, familyList2) {
        return _.union(familyList1, familyList2);
      });

      var sendFamilyUserList = _.filter(familyUserList, function (familyUser) {
        return !!(familyUser.mailActivated);
      });

      done(null, sendFamilyUserList);
    }
  };

  /**
   * familyUsersに含まれるユーザに対してメールの送信を行う。
   * @param {Array} familyUsers 送信対象の家族
   * @param {Function} done コールバック関数
   */
  var sendMail = function (familyUsers, done) {
    var mailTag = 'groupmail';

    async.eachLimit(familyUsers, 5,
      function (familyUser, eachDone) {
        if (postbox === null) {
          logger.debug({to: familyUser.mail, subject: req.body.subject, body: req.body.text, tag: mailTag});
          eachDone();
        } else {
          logger.trace({to: familyUser.mail, subject: req.body.subject, body: req.body.text, tag: mailTag});
          postbox.postMailGeneral(familyUser.mail, req.body.subject, req.body.text, mailTag,
            function (err) {
              if (err) {
                logger.error('メールの送信に失敗しました: ' + familyUser.mail);
                logger.error(err);
              }
              eachDone();
            });
        }
      },
      function (err) {
        if (err) {
          done(err);
        } else {
          done();
        }
      });
  };

  async.waterfall(
    [
      intersectionUsers,
      sendMail
    ],
    function (err) {
      if (err) {
        logger.error(err);
      } else {
        logger.info('group mail send end.');
      }
    });
};

/**
 * テンプレートの保存と、グループに所属するユーザに対してメール送信を行う。
 * @param {Object} req リクエストオブジェクト
 * @param {Object} res レスポンスオブジェクト
 */
exports.sendGroupMail = function (req, res) {
  logger.trace(req.body);

  async.waterfall([
      // セッションの確認。存在すればセッション情報を元にユーザの検索を行う。
      function (done) {
        if (!req.user) {
          done('セッションが存在しません');
        } else {
          User.findOne({id: req.user.id}).exec(done);
        }
      },
      // ユーザが存在し、管理者権限を保有しているか確認する。
      function (user, done) {
        if (user.admin) {
          done();
        } else {
          done('メール送信権限を保有していません');
        }
      },
      // バリデーション
      function (done) {
        validator(req).checkBody('subject').notEmpty().isLength(1, 30);
        validator(req).checkBody('text').notEmpty().isLength(1, config.mailTemplateEditor.maxTextLength);
        validator(req).checkBody('groups').notEmpty();

        var errors = req.validationErrors();
        if (errors) {
          done(errors);
        } else {
          done();
        }
      },
      //メールテンプレートの更新
      function (done) {
        MailTemplate.findOneAndUpdate(
          {passTypeId: defaultTemplateId},
          {subject: req.body.subject, text: req.body.text}
        ).exec(function (err) {
            if (err) {
              done(err);
            } else {
              done();
            }
          });
      },
      // ユーザの取得
      function (done) {
        // フォームにて、グループが重複して選択できる仕様となっているため、重複要素を取り除く。
        var uniqueGroups = _.uniq(req.body.groups);
        var groupsFindCondition = _.map(uniqueGroups, function (group) {
          return { name: group };
        });

        Group.find({ $or: groupsFindCondition }, {users: 1}).populate('users', 'enabled family')
          .exec(function (err, findResult) {
            if (err) {
              done(err);
            } else if (!findResult || (findResult.length === 0)) {
              done('group not exist');
            } else {
              var populateOptions = {
                path: 'users.family',
                select: 'mail mailActivated'
              };

              FamilyUser.populate(findResult, populateOptions, function (err, docs) {
                if (err) {
                  done(err);
                } else {
                  done(null, docs);
                }
              });
            }
          });
      }
    ],
    function (err, groups) {
      if (err) {
        responseError(res, err);
      } else {
        // ユーザにレスポンスを返してから、メール送信処理を行う。
        res.status(200);
        res.json({});

        logger.debug(groups);
        sendGroupMail(req, res, groups);
      }
    });

};
