'use strict';

var express = require('express');
var passport = require('passport');
var logger = log4js.getLogger();
var authService = require('../auth.service');

var router = express.Router();

router.get('/', passport.authenticate('google', {
  failureRedirect: '/auth/signin',
  scope: [
    'https://www.googleapis.com/auth/userinfo.profile'
  ],
  session: false
}));

router.get('/callback', function (req, res, next) {
  passport.authenticate('google', authService.signinResponse({json: false}, req, res, next))(req, res, next);
});

require('../signup').setup(router, {
  authType: 'google',
  customValidate: function (registerUser) {
    return registerUser.profile && registerUser.profile.id;
  },
  createSourceData: function (registerUser) {
    return { id: registerUser.profile.id };
  },
  callbackResponse: function (req, res, next) {
    return authService.signinResponse({json: true}, req, res, next);
  }
});

module.exports = router;
