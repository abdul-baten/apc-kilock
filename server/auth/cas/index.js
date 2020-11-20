'use strict';

var express = require('express');
var passport = require('passport');
var logger = log4js.getLogger();
var authService = require('../auth.service');

var router = express.Router();

router.get('/', function (req, res, next) {
  passport.authenticate('cas', authService.signinResponse({
    json: false,
    ignoreSignup: true,
  }, req, res, next))(req, res, next);
});

require('../signup').setup(router, {
  authType: 'cas',
  customValidate: function (registerUser) {
    return registerUser.profile && registerUser.profile.user;
  },
  createSourceData: function (registerUser) {
    return {
      login: registerUser.profile.user
    };
  },
  callbackResponse: function (req, res, next) {
    return authService.signinResponse({
      json: true
    }, req, res, next);
  }
});

module.exports = router;
