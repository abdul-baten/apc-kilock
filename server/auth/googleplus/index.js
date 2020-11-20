'use strict';

var express = require('express');
var passport = require('passport');
var logger = log4js.getLogger();
var config = require('../../config/environment');
var authService = require('../auth.service');

var router = express.Router();

router.post('/callback.json', function (req, res, next) {
  passport.authenticate('googleplus', authService.signinResponse({json: true}, req, res, next))(req, res, next);
});

module.exports = router;
