'use strict';

var config = require('../../config/environment');
var _ = require('lodash'),
    async = require('async'),
    mongoose = require('mongoose'),
    moment = require('moment'),
    logger = log4js.getLogger(),
    User = mongoose.model('User'),
    Project = mongoose.model('Project'),
    AttendanceStatus = mongoose.model('AttendanceStatus'),
    AttendanceStatusLog = mongoose.model('AttendanceStatusLog'),
    ObjectId = require('mongoose').Types.ObjectId,
    datetimeutil = require('../../utils/datetimeutil'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic'),
    helper = require('../../logics/helper');

var getResponse = function(req, list, totalCount, callback) {
  async.parallel({
    projects: function(callback) {
      Project.find({
        valid: true
      }, {}, {sort: {displayOrder: 1, name: 1}}, function(err, projects) {
        var list = projects.map(function(project) {
          return {
            _id:  project._id,
            name: project.name,
          }
        });
        callback(err, list);
      });
    },
  }, function(err, results) {
    callback(err, {
      loginuser:          req.user._id,
      list:               list,
      totalCount:         totalCount,
      projects:           results.projects,
      attendanceStatuses: config.attendanceStatuses,
      attendanceActions:  config.attendanceActions,
    });
  });
};

exports.get = function (req, res) {
  // Validation
  validator(req).checkQuery('targetUserName').nullable();
  validator(req).checkQuery('targetUserProject').nullable();
  validator(req).checkQuery('updateUserName').nullable();
  validator(req).checkQuery('updateUserProject').nullable();
  validator(req).checkQuery('startDate').nullable().isDate();
  validator(req).checkQuery('endDate').nullable().isDate();
  validator(req).checkQuery('offset').nullable();
  validator(req).checkQuery('limit').nullable();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  async.waterfall([
    function(callback) {
      logic.getAllUserPermissions(req.user, callback);
    },
    function(allUserPermissions, callback) {
      logic.getAttendanceStatusLogs(
        req.user,
        req.query.targetUserName,
        req.query.targetUserProject,
        req.query.updateUserName,
        req.query.updateUserProject,
        req.query.startDate,
        req.query.endDate,
        req.query.offset,
        req.query.limit,
        allUserPermissions,
        callback);
    },
  ], function(err, attendanceStatusLogs) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);
    }

    var list = [];
    var totalCount = attendanceStatusLogs.totalCount;
    if (attendanceStatusLogs.list.length <= 0) {
      getResponse(req, list, totalCount, function(err, response) {
        res.status(200);
        res.json(response);
      });
      return;
    }
    async.eachSeries(attendanceStatusLogs.list, function(item, callback) {
      logic.getUserPermissions(req.user._id, item.attendanceStatus.user._id, function(err, permissions) {
        list.push({
          targetUser: {
            _id         : item.attendanceStatus.user._id,
            id          : item.attendanceStatus.user.id,
            name        : item.attendanceStatus.user.name,
            employeeCode: item.attendanceStatus.user.employeeCode,
          },
          updateUser: {
            _id         : item.updateUser._id,
            id          : item.updateUser.id,
            name        : item.updateUser.name,
            employeeCode: item.attendanceStatus.user.employeeCode,
          },
          year:                item.attendanceStatus.year,
          month:               item.attendanceStatus.month,
          attendanceAction:    item.action,
          attendanceStatus:    item.attendanceStatus,
          updated:             item.updated,
          isMine:              item.attendanceStatus.user.id == req.user.id ? true : false,
          isAdmin:             req.user.admin,
          isProjectManager:    permissions.admin,
          isMiddleManager:     permissions.middle,
          isBetterManager:     permissions.better,
          isTopManager:        req.user.top,
        });
        callback();
      });
    }, function(err, results) {
      getResponse(req, list, totalCount, function(err, response) {
        res.status(200);
        res.json(response);
      });
    });
  });
};
