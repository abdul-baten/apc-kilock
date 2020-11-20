'use strict';

var _ = require('lodash'),
    async = require('async'),
    uuid = require('node-uuid'),
    mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    User = mongoose.model('User'),
    Nfc = mongoose.model('Nfc'),
    OneTimeToken = mongoose.model('OneTimeToken'),
    config = require('../../config/environment'),
    validator = require('../../utils/validator');

var DeviceType = {
  MOBILE: 'mobile',
  NFC: 'nfc',
};

var responseUser = function (res, reqParams) {
  var condition = { id: reqParams.userId };
  async.parallel({
    user: function (callback) {
      User.findOne(condition)
        .populate('devices')
        .exec(callback);
    }
  }, function (err, results) {
    if (!err) {
      var user = results.user;
      var data = {
        id: user.id,
        name: user.name,
        hasDevice: (user.devices && user.devices.length > 0),
        devices: user.devices,
        maxNumOfDevices: config.maxNumberOfDevicesPerUser,
      };
      return res.json(data);
    } else {
      logger.error(err);
      res.status(500);
      res.send(err);
    }
  });
};

var removeToken = function (userId, token, callback) {
  var condition = {id: userId};
  async.waterfall([
    function (callback) {
      User.findOne({id: userId})
        .populate('devices')
        .exec(callback);
    },
    function (user, callback) {
      var device = _.find(user.devices, function(device) {
        return device.token === token;
      });
      if (!device) {
        var err = new Error();
        callback(err, null);
        return;
      }
      device.remove(callback);
    },
  ], callback);
};

var createOneTimeToken = function () {
  // 100000-999999
  var tokenNumber = 100000 + Math.floor(Math.random() * 900000);
  return tokenNumber.toString();
};

var responseToken = function (res, reqParams) {
  var condition = { id: reqParams.userId };
  async.parallel({
    user: function (callback) {
      User.findOne(condition)
        .populate('devices')
        .exec(function (err, user) {
          // 既存のtokenを削除
          OneTimeToken.remove({ user: user }).exec();
          callback(err, user);
        });
    },
  }, function (err, results) {
    if (!err) {
      var user = results.user;
      async.parallel({
        registeronetimetoken: function (callback) {
          var onetimetoken = new OneTimeToken({
            token: createOneTimeToken(),
            type: 'DeviceMobile',
            user: user,
            // +5分まで
            expiration: new Date(Date.now() + (5 * 60 * 1000)),
          });
          onetimetoken.save(callback);
        },
      }, function (err, results) {
        if (!err) {
          var data = {
            id: user.id,
            name: user.name,
            hasDevice: (user.devices && user.devices.length > 0),
            devices: user.devices,
            onetimetoken: results.registeronetimetoken[0].token,
            maxNumOfDevices: config.maxNumberOfDevicesPerUser,
          };
          return res.json(data);
        } else {
          logger.error(err);
          res.status(500);
          res.send(err);
        }
      });
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
  var loginuser = req.user;
  // 管理者か自分のみ編集可
  if (!loginuser.admin &&
    reqParams.userId !== loginuser.id) {
    // 権限エラー
    res.status(403);
    return res.json(validateErrors);
  }
  responseUser(res, reqParams);
};

exports.post = function (req, res) {
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
  var loginuser = req.user;
  // 管理者か自分のみ編集可
  if (!loginuser.admin &&
    reqParams.userId !== loginuser.id) {
    // 権限エラー
    res.status(403);
    return res.json(validateErrors);
  }
  responseToken(res, reqParams);
};

exports.delete = function (req, res) {
  var loginuser = req.user;
  /*
  if (!loginuser.admin) {
    res.status(403);
    return res.json(validateErrors);
  }
  */

  var token = req.query.token;
  removeToken(loginuser.id, token, function(err, __unused) {
    var statusCode = !!err ? 400 : 200;
    res.status(statusCode);
    res.end();
  });
};
