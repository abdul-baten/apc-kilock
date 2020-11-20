'use strict';

var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');
var logger = log4js.getLogger();
var config = require('../../config/environment');
var validator = require('../../utils/validator');

var User = mongoose.model('User');

var responseUser = function (res, reqParams) {
  var condition = { id: reqParams.userId };
  async.parallel({
    user: function (callback) {
      User.findOne(condition)
        .populate('family')
        .exec(callback);
    }
  }, function (err, results) {
    if (!err) {
      var user = results.user;
      var data = {
        id: user.id,
        name: user.name,
        family: _(user.family).filter(function (familyUser) {
          return familyUser.mailActivated;
        }).value(),
      };
      return res.json(data);
    } else {
      logger.error(err);
      res.status(500);
      res.send(err);
    }
  });
};

exports.get = function (req, res) {
  // TODO 権限制御
  validator(req).checkQuery('userId').isInt();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParams = {
    userId: parseInt(req.query.userId),
  };
  // 管理者か自分のみ編集可
  if (!req.user.admin &&
    reqParams.userId !== req.user.id) {
    // 権限エラー
    res.status(403);
    return res.json(validateErrors);
  }
  responseUser(res, reqParams);
};

exports.delete = function (req, res) {
  validator(req).checkQuery('userId').isInt();
  validator(req).checkQuery('mail').notEmpty();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParams = {
    userId: parseInt(req.query.userId),
    mail: req.query.mail,
  };
  // 管理者か自分のみ編集可
  if (!req.user.admin &&
    reqParams.userId !== req.user.id) {
    // 権限エラー
    res.status(403);
    return res.json(validateErrors);
  }
  var condition = { id: reqParams.userId };
  async.waterfall([
    function (callback) {
      User.findOne(condition)
        .populate('family')
        .exec(callback);
    },
    function (user, callback) {
      if (!user || !user.family || user.family.length === 0) {
        res.status(400);
        return res.end();
      }
      var target = _(user.family).find(function (familyUser) {
        return familyUser.mail === reqParams.mail;
      });
      if (!target) {
        res.status(400);
        return res.end();
      }
      user.family.remove(target);
      async.parallel([
        function(callback){user.save(callback);},
        function(callback){target.remove(callback);},
        ], callback);
    },
    ],
    function (err) {
      if (err) {
        logger.error(err);
        res.status(500);
        return res.end();
      }
      res.status(200);
      return res.json({});
    });
};
