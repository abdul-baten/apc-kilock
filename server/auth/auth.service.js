'use strict';

var _ = require('lodash');
var mongoose = require('mongoose');
var async = require('async');
var passport = require('passport');
var synchronization = require('../utils/synchronization');
var config = require('../config/environment');
var logger = log4js.getLogger();
var User = mongoose.model('User');
var Source = mongoose.model('Source');
var Organization = mongoose.model('Organization');

var createRedirectResponse = function (res, isJson) {
  return function (status, path) {
    if (isJson) {
      res.status(status);
      res.json({
        redirect: path
      });
    } else {
      return res.status(500).redirect(path);
    }
  };
};

exports.login = function () {
  return function (req, res, next) {

    // 組織パスの取得と設定
    if (!req.params.orgpath && config.rootOrganizationPath) {
      req.params.orgpath = config.rootOrganizationPath;
    }
    if (!req.user) {
      req.session.redirectPath = req.url;
      return res.redirect('/auth/signin');
    }
    next();
  };
};

/**
 * ログインユーザ情報を取得する
 * @param filter {Object} - ユーザ検索条件
 * @param additional {Object} - ユーザ情報に付与する情報
 * @param done {Function} - コールバック関数 ユーザ情報が返る
 */
exports.findLoginUser = function (filter, additional, done) {
  async.waterfall([
      // ユーザ情報を同期する
      function (callback) {
        synchronization.users({
          forceUpdate: false,
        }, callback);
      },
      // ユーザ取得
      function (callback) {
        var condition = _.merge(filter || {}, {
          enabled: true
        });
        User.findOne(condition)
          .populate('organization')
          .exec(callback);
      },
    ],
    function (err, user) {
      if (err) {
        return done(err);
      }
      if (!user) {
        return done(null, null);
      }
      user = _.merge(user, additional);
      if (!user.expiration) {
        user.expiration = new Date(Date.now() + (60 * 60 * 1000));
      }
      done(null, user);
    });
};

/**
 * リクエストとソース名からソースを取得
 * @param orgpath {String} - 組織を示すパス
 * @param sourcename {String} - 認証に対応するソース名
 * @param done {Function} - コールバック関数 ソース情報が返る
 */
exports.findCurrentSource = function (req, sourcename, callback) {
  // 組織パスの取得と設定
  if (!req.params.orgpath && config.rootOrganizationPath) {
    req.params.orgpath = config.rootOrganizationPath;
  }
  var orgpath = req.params.orgpath;
  async.waterfall([
    function (callback) {
      if (!orgpath) {
        return callback(null, null);
      }
      Organization.findOne({
          path: orgpath
        })
        .exec(callback);
    },
    function (organization, callback) {
      if (orgpath && !organization) {
        // 組織が見つからないのでソースもなし
        logger.warn('organization not found. path: %s', orgpath);
        return callback(null, null);
      }
      Source.findOne({
          name: sourcename,
          organization: organization || null,
        })
        .populate('organization')
        .exec(callback);
    },
  ], callback);
};

exports.signupValidate = function (options, authType, customValidate) {
  options = options || {};
  return function (req, res, next) {
    var redirectResponse = createRedirectResponse(res, !!options.json);
    var registerUser = req.session.registerUser;
    if (!registerUser) {
      return redirectResponse(200, '/auth/signin');
    }
    if (authType && registerUser.authType !== authType) {
      return redirectResponse(403, '/forbidden');
    }
    if (customValidate && _.isFunction(customValidate) &&
      !customValidate(registerUser)) {
      delete req.session.registerUser;
      return redirectResponse(200, '/auth/signin');
    }
    // 認証有効期限切れ
    if (registerUser.expiration < new Date(Date.now())) {
      logger.trace('registerUser expired.');
      delete req.session.registerUser;
      return redirectResponse(200, '/auth/signin');
    }
    next();
  };
};

exports.signinResponse = function (options, req, res, next) {
  options = options || {};
  var redirectResponse = createRedirectResponse(res, !!options.json);
  return function (err, user, registerUser) {
    if (err) {
      logger.error(err);
      return next(err);
    }

    if (!options.ignoreSignup && !user && registerUser) {
      // 登録処理に移行
      req.session.registerUser = registerUser;
      return redirectResponse(200, '/auth/signup');
    }

    if (!user) {
      return redirectResponse(403, '/forbidden');
    }

    logger.trace('ログイン処理');
    req.login(user, function (err) {
      if (err) {
        logger.error(err);
        return next(err);
      }

      logger.trace(req.session)

      const date = new Date()

      const time = date.getTime() + (10 * 60 * 1000);

      // var redirectPath = `${req.session.redirectPath}?timeOut=${date.getTime()}` || `/?timeOut=${date.getTime()}`;
      var redirectPath = `/?timeOut=${time}`;
      delete req.session.redirectPath;
      return redirectResponse(200, redirectPath);
    });
  };
};

exports.createSerializedUser = function (user) {
  return {
    id: user.id,
    logoutPath: user.logoutPath,
    revokePath: user.revokePath,
  };
};
