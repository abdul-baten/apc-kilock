'use strict';

var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');
var logger = log4js.getLogger();
var passHistoriesLogic = require('../../logics/pass_histories_logic');
var MailTemplate = mongoose.model('MailTemplate');
var attendance_logic = require('../../logics/attendance_logic');
var helper = require('../../logics/helper');
var validator = require('../../utils/validator');
var RestTime = mongoose.model('RestTime');
var User = mongoose.model('User');

exports.get = function (req, res) {
  async.waterfall([
    function (callback) {
      var conditions = { enabled: true };
      if (req.query.userId) {
        conditions = _.assign(conditions, {
          id: req.query.userId,
        });
      } else {
        conditions = _.assign(conditions, {
          _id: req.user._id,
        });
      }
      User.findOne(conditions, function(err, user) {
        if (err) {
          callback(err);
        }
        if (user == null) {
          callback('user not found.');
        }
        callback(err, user);
      });
    },
    function (user, callback) {
      RestTime.find({
        user: user._id,
      }).sort({'period.start':-1}).exec(callback);
    },
  ], function(err, restTimes) {
    if (err) {
      logger.error(err);
      res.status(500);
      return res.json(null);
    }

    res.status(200);
    return res.json({
      restTimes: restTimes
    });
  });
};

exports.post = function (req, res) {
  var restTimes       = JSON.parse(req.body.restTimes);
  var deleteRestTimes = JSON.parse(req.body.deleteRestTimes);

  async.waterfall([
    function (callback) {
      var conditions = { enabled: true };
      if (req.body.userId) {
        conditions = _.assign(conditions, {
          id: req.body.userId,
        });
      } else {
        conditions = _.assign(conditions, {
          _id: req.user._id,
        });
      }
      User.findOne(conditions, function(err, user) {
        if (err) {
          callback(err);
        }
        if (user == null) {
          callback('user not found.');
        }
        callback(err, user);
      });
    },
    function (user, callback) {
      attendance_logic.updateRestTimes(
        user._id || req.user._id,
        req.user._id,
        restTimes,
        deleteRestTimes,
        callback);
    },
  ], function(err, data) {
    if (err) {
      logger.error(err);
      res.status(500);
      return res.json(err);
    }
    res.status(200);
    return res.json({});
  });
};
