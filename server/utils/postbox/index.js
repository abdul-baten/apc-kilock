'use strict';

var config = require('../../config/environment');
var Postbox = require('./lib/postbox');
var url = require('url');
var _ = require('lodash');
var moment = require('moment');
var logger = log4js.getLogger();

var mongoose = require('mongoose');
var User = mongoose.model('User');

var postbox = null;
var PassHistoriesLogic = require('../../logics/pass_histories_logic');
var MailTemplate = null;

if (config.mailer) {
  MailTemplate = require('mongoose').model('MailTemplate');
}


/**
 * メール送信時のオプションを作成する。
 * @param to {Array} メール送信先
 * @param subject {String} メールタイトル
 * @param body {String} メール本文
 * @param tagName {String} Mandrill側で検索に利用するタグ
 * @param attachments {Array} 添付ファイル情報
 *                            [{filename: ファイル名, path: パス},...]
 * @returns {{to: *, headers: {X-MC-Tags: *}, subject: *, text: *}}
 */
var createMailOptions = function (to, subject, body, tagName, attachments) {

  var options = {
    to:          to,
    subject:     subject,
    text:        body,
    attachments: [],
  };

  // use as tag name, for Mandrill
  if (tagName !== undefined) {
    options['headers'] = {'X-MC-Tags': tagName};
  }

  // attachments
  if (attachments) {
    options['attachments'] = attachments;
  }

  return options;
};

/**
 * 変数postboxの内容が存在しない場合は、Postboxオブジェクトを生成する。
 */
var postboxInitialize = function () {
  if (!postbox) {
    var redisUrl = config.redis && config.redis.uri ? url.parse(config.redis.uri) : {};
    var configMailer = _.clone(config.mailer);
    if (!configMailer.kue.redis) {
      configMailer.kue.redis = {
        port: redisUrl.port || 6379,
        host: redisUrl.hostname,
        auth: redisUrl.auth ? redisUrl.auth.split(':')[1] : ''
      };
    }
    postbox = new Postbox(configMailer);
  }
};

/**
 * 汎用的なメール送信の関数
 * @param to {Array} メール送信先
 * @param subject {String} メールタイトル
 * @param body {String} メール本文
 * @param tagName {String} Mandrill側で検索に利用するタグ
 * @param callback {Function} 結果を受け取るコールバック関数
 */
var postMailGeneral = function (to, subject, body, tagName, attachments, callback) {
  var mailOptions = createMailOptions(to, subject, body, tagName, attachments, null);

  postboxInitialize();
  postbox.post_mail(mailOptions, callback);
};

var _postMail = function (user, templateType, subject, bodyText, callback) {
  var mailOptions;
  if (!templateType) {
    templateType = 'unknown';
  }
  if (!user) {
    if (callback) {
      callback(new Error());
    }
    return;
  }

  user.retrieveMailRecipients(function (err, recipients) {
    if (!recipients || recipients.length == 0) {
      logger.info('no recipients for user:' + user.id);
      callback();
      return;
    }

    mailOptions = {
      to: recipients,
      template: templateType, //old compat
      headers: {'X-MC-Tags': templateType}, //use as tag name, for Mandrill
      subject: subject,
      text: bodyText,
    };

    if (!postbox) {
      var redisUrl = config.redis && config.redis.uri ? url.parse(config.redis.uri) : {};
      var configMailer = _.clone(config.mailer);
      if (!configMailer.kue.redis) {
        configMailer.kue.redis = {
          port: redisUrl.port || 6379,
          host: redisUrl.hostname,
          auth: redisUrl.auth ? redisUrl.auth.split(':')[1] : '',
        };
      }
      postbox = new Postbox(configMailer);
    }
    return postbox.post_mail(mailOptions, callback);
  });
};

var mailBody = function (user, templateText, date) {
  if (!user || !user.name || user.name.length === 0) {
    return null;
  }

  if (!date) { date = new Date(); }

  if (!templateText) { templateText = ''; }

  var tzOffset = config.timeoffset * 60;
  var nowStr = moment(date).zone(-tzOffset).format('lll');
  var body = user.name + "\n" + templateText + "\n" + nowStr;
  return body;
};

var postMail = function (user, passType, date, callback) {

  //logger.info(user);
  if (PassHistoriesLogic.passTypeValueIsUnknown(passType)) {
    //nothing to do.
    if (callback) {
      callback();
    }
    return;
  }

  if (!MailTemplate) {
    throw new Error();
  }

  if (!user) {
    if (callback) {
      callback(new Error());
    }
    return;
  }

  if (!user.roles || user.roles.length == 0) {
    //nothing to do.
    if (callback) {
      callback();
    }
    return;
  }

  var shouldMail = _.some(user.roles, function (role) {
    return role.shouldMail;
  });

  if (!shouldMail) {
    //nothing to do.
    if (callback) {
      callback();
    }
    return;
  }

  if (!date) { date = new Date(); }

  var templateType = PassHistoriesLogic.passType[passType] || 'unknown';
  var condition = {passTypeId: parseInt(passType)};
  MailTemplate.findOne(condition).exec(function(err, mailTemplate) {
    if (err) {
      if (callback) { callback(err); }
      return;
    }

    var bodyText = mailBody(user, mailTemplate.text, date);
    if (!bodyText) {
      if (callback) { callback(new Error()); }
      return;
    }

    var subject = (mailTemplate.subject && mailTemplate.subject.length > 0) ? mailTemplate.subject : null;
    _postMail(user, templateType, subject, bodyText, callback);
  });
};

var postMailWithPopulateRoles = function (user, passType, date, callback) {
//  console.log('postMailWithPopulateRoles');
//  console.log('user: ');
//  console.log(user);

  if (!user) {
    if (callback) {
      callback(new Error());
    }
    return;
  }

  if (user.populated('roles')) {
    postMail(user, passType, date, callback);
    return;
  }

  user.populate('roles', function (err, fixedUser) {
    if (err) {
      callback(err);
      return;
    }
    postMail(fixedUser, passType, date, callback);
  });
};

//Postbox.postMail = postMail;
Postbox.postMail = postMailWithPopulateRoles;
Postbox.postMailGeneral = postMailGeneral;

module.exports = Postbox;
