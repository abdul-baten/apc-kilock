'use strict';

var express = require('express');
var passport = require('passport');
var logger = log4js.getLogger();
var authService = require('../auth.service');

var router = express.Router();

router.get('/', function(req, res, next) {
  passport.authenticate('local', authService.signinResponse({json: false}, req, res, next))(req, res, next);
});

require('../signup').setup(router, {
  authType: 'local',
  customValidate: function (registerUser) {
    return registerUser.login;
  },
  createSourceData: function (registerUser) {
    return { login: registerUser.login };
  },
  callbackResponse: function (req, res, next) {
    return authService.signinResponse({json: true}, req, res, next);
  }
});

module.exports = router;
