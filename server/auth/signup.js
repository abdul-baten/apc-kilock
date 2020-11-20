'use strict';

var async = require('async');
var mongoose = require('mongoose');
var _ = require('lodash');
var logger = log4js.getLogger();
var User = mongoose.model('User');
var authService = require('./auth.service');
var validator = require('../utils/validator');

var createMethodGet = function () {
  return function (req, res) {
    var registerUser = req.session.registerUser;
    var displayName = null;
    if (registerUser && registerUser.profile) {
      displayName = registerUser.profile.displayName;
    }
    var username = null;
    var sourcename = null;
    var authType = null;
    if (registerUser) {
      username = registerUser.username;
      sourcename = registerUser.sourcename;
      authType = registerUser.authType;
    }
    res.status(200);

    res.json({
      register : {
        name: username,
        authType: authType,
        sourcename: sourcename,
      }
    });
  };
};

var createMethodPost = function (options) {
  var callbackResponse = options.callbackResponse;
  var createSourceData = options.createSourceData ||
    function (registerUser) {
      return { id: registerUser.profile.id };
    };
  var mappingUser = options.mappingUser ||
    function (user) {
      user.autoLoginId();
    };
  return function (req, res, next) {
    var registerUser = req.session.registerUser;
    validator(req).checkBody('name').notEmpty();
    var validateErrors = req.validationErrors();
    if (validateErrors) {
      // バリデートエラー
      logger.info({validateErrors: validateErrors});
      res.status(400);
      return res.json(validateErrors);
    }
    var reqParams = {
      name: req.body.name,
    };
    var sourcename = registerUser.sourcename;
    if (!sourcename) {
      res.status(400);
      return res.json({ redirect: '/badRequest'});
    }

    async.waterfall([
      function (callback) {
        authService.findCurrentSource(req, sourcename, callback);
      },
      function (source, callback) {
        // insert
        var user = new User({
          name: reqParams.name,
          enabled: true,
          displayOrder: 9999000,
          organization: source.organization,
          sourcename : source.name,
          sourcetype : source.type,
          source : createSourceData(registerUser),
          sources: [{
            source: source,
            data: createSourceData(registerUser),
            primary: true,
          }],
        });
        mappingUser(user, registerUser);
        user.save(callback);
      },
      ],
      function (err, user) {
        if (err) {
          logger.error(err);
          res.status(500);
          return res.json({ redirect: '/500'});
        }
        var additional = _.clone(registerUser.additional);
        delete req.session.registerUser;
        authService.findLoginUser(
          {id: user.id},
          additional,
          callbackResponse(req, res, next));
      });
  };
};

module.exports.setup = function (router, options) {
  options = options || {};
  var authType = options.authType;
  var customValidate = options.customValidate;
  if (!options.callbackResponse) {
    router.route('/signup.json')
      .all(authService.signupValidate({json: true}, authType, customValidate))
      .get(createMethodGet());
  } else {
    router.route('/signup.json')
      .all(authService.signupValidate({json: true}, authType, customValidate))
      .post(createMethodPost(options));
  }
};
