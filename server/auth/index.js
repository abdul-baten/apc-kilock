'use strict';

var express = require('express');
var url = require('url');
var _ = require('lodash');
var passport = require('passport');
var config = require('../config/environment');
var authService = require('./auth.service');
var logger = log4js.getLogger();

passport.serializeUser(function (user, done) {
  var serializedUser = authService.createSerializedUser(user);
  done(null, serializedUser);
});

passport.deserializeUser(function (serializedUser, done) {
  if (!serializedUser || !serializedUser.id) {
    done(null, null);
  }
  var additional = _.clone(serializedUser);
  delete additional.id;
  authService.findLoginUser({
      id: serializedUser.id
    },
    additional,
    function (err, user, info) {
      if (err || info) {
        logger.error(err || info);
      }
      if (err) {
        done(err);
      } else {
        done(null, user);
      }
    });
});

var router = express.Router();

// ログアウト
router.get('/signout', function (req, res) {
  logger.trace('ログアウト処理');
  if (req.user) {
    var signout = function () {
      var logoutPath = req.user.logoutPath || '/';
      delete req.session.redirectPath;
      req.logout();
      res.redirect(logoutPath);
    };
    if (req.user.revokePath) {
      var protocol;
      var options = url.parse(req.user.revokePath);
      var isHttps = options.protocol && options.protocol.indexOf('https') >= 0;
      protocol = isHttps ? require('https') : require('http');
      options = {
        host: options.host,
        path: options.path,
        port: options.port || isHttps ? 443 : 80,
        method: 'GET',
      };
      protocol.get(options, function (res) {
        signout();
      }).on('error', function (err) {
        logger.error(err);
      });
    } else {
      signout();
    }
  } else {
    res.redirect('/');
  }
});

var authInfo = {};

// Passport Configuration
if (require('./local/passport').setup(config, authService)) {
  authInfo.local = false;
  router.use('/local', require('./local'));
}
if (require('./cas/passport').setup(config, authService)) {
  authInfo.cas = true;
  router.use('/cas', require('./cas'));
}
if (require('./google/passport').setup(config, authService)) {
  authInfo.google = false;
  router.use('/google', require('./google'));
}
if (require('./twitter/passport').setup(config, authService)) {
  authInfo.twitter = false;
  router.use('/twitter', require('./twitter'));
}
if (require('./facebook/passport').setup(config, authService)) {
  authInfo.facebook = false;
  router.use('/facebook', require('./facebook'));
}
if (require('./github/passport').setup(config, authService)) {
  authInfo.github = false;
  router.use('/github', require('./github'));
}
if (require('./googleplus/passport').setup(config, authService)) {
  // authInfo.googleplus = {
  //   clientId: config.authentication.googleplus.clientId
  // };
  authInfo.googleplus = false;
  router.use('/googleplus', require('./googleplus'));
}
// 登録画面処理
require('./signup').setup(router);

router.get('/auth.json', function (req, res) {
  logger.trace('認証情報API');
  res.status(200);
  var respJson = _.clone(authInfo);
  respJson.redirectPath = req.user ? '/' : null;
  return res.json(respJson);
});

module.exports = router;
