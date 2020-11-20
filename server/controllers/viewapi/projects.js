'use strict';

var _ = require('lodash'),
    logger = log4js.getLogger(),
    async = require('async'),
    config = require('../../config/environment'),
    mongoose = require('mongoose'),
    User = mongoose.model('User'),
    Project = mongoose.model('Project'),
    Group = mongoose.model('Group'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic');

exports.get = function (req, res) {
  // バリデーション
  validator(req).checkQuery('nameWithCount').nullable().isIn(['true', 'false']);
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  var params = {
    all: req.query.all === 'true' ? true : false,
    approvalToSelf: req.query.approvalToSelf === 'true' ? true : false,
  };

  async.waterfall([
    function(callback) {
      if (params.approvalToSelf) {
        logic.getApprovalToSelfProjects(req.user, callback);
      } else {
        logic.getApprovalProjects(req.user, params.all, callback);
      }
    },
  ], function(err, projects) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);
      return;
    }
    var filteredProjects = projects.filter(function(project) {
      if (project.group != null) {
        return true;
      }
    });
    var resProjects = filteredProjects.map(function(project) {
      return {
        _id   : project._id,
        id    : project.id,
        name  : (project.name || '') + (params.nameWithCount ? ' (' + project.group.users.length + ')' : ''),
        count : project.group.users.length || 0,
        group : {
          id: project.group.id,
        },
      };
    });
    return res.json({
      projects: resProjects,
      allowall: req.user.admin || req.user.top,
    });
  });
};
