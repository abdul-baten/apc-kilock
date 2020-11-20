'use strict';

var _ = require('lodash'),
    logger = log4js.getLogger(),
    async = require('async'),
    config = require('../../config/environment'),
    mongoose = require('mongoose'),
    User = mongoose.model('User'),
    Group = mongoose.model('Group'),
    Project = mongoose.model('Project'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic');

var mapGroups = function (reqParams, results, allowall) {
  return {
    limit       : reqParams.limit || 0,
    offset      : reqParams.offset,
    total_count : results.count,
    timestamp   : results.timestamp,
    allowall    : allowall,
    groups      : _.map(results.groups, function (group) {
      return {
        id    : group.id,
        name  : (group.name || '') + (reqParams.nameWithCount ? ' (' + group.users.length + ')' : ''),
        count : group.users.length || 0,
      };
    })
  };
};

exports.get = function (req, res) {
  var loginuser = req.user;
  var param = req.query;
  validator(req).checkQuery('limit').nullable().isInt();
  validator(req).checkQuery('offset').nullable().isInt();
  validator(req).checkQuery('nameWithCount').nullable().isIn(['true', 'false']);
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParams = {
    limit : param.limit,
    offset : param.offset || 0,
    nameWithCount: param.nameWithCount === 'true' ? true : false,
  };
  var responseGroups = function (user, allowedGroupIds) {
    var condition = {};
    condition.$and = [];
    if (!user.admin && !user.top) {
      var groupIds = allowedGroupIds;
      if (user.manageGroups && user.manageGroups.length > 0) {
        groupIds = groupIds.concat(user.manageGroups);
      }
      // 所属グループと管理グループで絞込
      condition.$and.push({
        $or: [
          { users: user },
          { id: { $in: groupIds } },
        ]
      });
    }
    condition.$and.push({ enabled: true });

    async.parallel({
      count: function (callback) {
        Group.count(condition).exec(callback);
      },
      groups: function (callback) {
        var queryGroup = Group.find(condition)
          .skip(reqParams.offset);
        if (reqParams.limit) {
          queryGroup.limit(reqParams.limit);
        }
        queryGroup.sort({displayOrder: 1, name: 1});
        queryGroup.exec(callback);
      }
    }, function (err, results) {
      if (!err) {
        var data = mapGroups(reqParams, results, user.admin || user.top);
        return res.json(data);
      } else {
        logger.error(err);
        res.status(500);
        res.send(err);
      }
    });
  };
  User.findOne({ id: loginuser.id }, function(err, user) {
    logic.getPermissionGroups(user._id, function(err, perms) {
      if (err) {
        logger.error(err);
        res.status(500);
        res.send(err);
        return;
      }

      var groupIds = perms.middle.concat(perms.better);
      responseGroups(user, groupIds);
    });
  });
};
