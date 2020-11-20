'use strict';

var _ = require('lodash'),
    logger = log4js.getLogger(),
    async = require('async'),
    config = require('../../config/environment'),
    mongoose = require('mongoose'),
    Personnel = mongoose.model('Personnel'),
    Project = mongoose.model('Project'),
    Group = mongoose.model('Group'),
    User = mongoose.model('User'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic');

exports.get = function (req, res) {
  // バリデーション
  validator(req).checkQuery('projectId').nullable().isLength(0, 24);
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  var params = {
    approvalToSelf: req.query.approvalToSelf === 'true' ? true : false,
  };

  async.waterfall([
    function(callback) {
      if (params.approvalToSelf) {
        logic.getApprovalToSelfUsers(req.user, req.query.projectId, callback);
      } else {
        logic.getApprovalUsers(req.user, req.query.projectId, false, callback);
      }
    },
  ], function(err, users) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);
      return;
    }
    var resUsers = users.map(function(user) {
      return {
        _id:  user._id,
        name: user.name,
      };
    });
    return res.json({users: resUsers});
  });
};
