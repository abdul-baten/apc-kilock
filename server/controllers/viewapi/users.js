'use strict';

var _ = require('lodash'),
    logger = log4js.getLogger(),
    async = require('async'),
    config = require('../../config/environment'),
    logic = require('../../logics/attendance_logic'),
    mongoose = require('mongoose'),
    Group = mongoose.model('Group'),
    User = mongoose.model('User'),
    validator = require('../../utils/validator');

var showEdit = function(loginuser, targetuser, permission) {
  return loginuser.admin || loginuser.id === targetuser.id;
};

var showPassHistories = function(loginuser, targetuser, permission) {
  if (permission.middle || permission.better || permission.admin) {
    return true;
  } else {
    return loginuser.admin || loginuser.top || loginuser.id === targetuser.id;
  }
}

var showAttendance = function(loginuser, targetuser, permission) {
  if (permission.middle || permission.better || permission.admin) {
    return true;
  } else {
    return loginuser.admin || loginuser.top || loginuser.id === targetuser.id;
  }
};;

var mapForList = function (loginuser, reqParams, results, callback) {
  async.eachSeries(results.users, function(user, callback) {
    logic.getUserPermissions(loginuser._id, user._id, function(err, perm) {
      if (err) {
        callback(err);
        return;
      }
      user.showEdit = showEdit(loginuser, user, perm);
      user.showPassHistories = showPassHistories(loginuser, user, perm);
      user.showAttendance = showAttendance(loginuser, user, perm);
      callback();
    });
  }, function(err) {
    callback(err, {
      limit: reqParams.limit || 0,
      offset: reqParams.offset,
      totalCount: results.count,
      showNewRegister: loginuser.admin,
      requestTime: reqParams.requestTime,
      users: _.map(results.users, function (user) {
        var sourceName;
        if (user.sources && _.isArray(user.sources) && user.sources.length > 0) {
          sourceName = _(user.sources).map(function (source) {
            return source.source.name;
          }).join(',');
        } else {
          sourceName = '';
        }

        return {
          id: user.id,
          login: user.login,
          name: user.name,
          employeeCode: user.employeeCode,
          mail: user.mail || null,
          extensionPhoneNumber: user.extensionPhoneNumber,
          sourceName: sourceName,
          hasNfc: (user.nfcs && user.nfcs.length > 0) ? true : false,
          hasDevice: (user.devices && user.devices.length > 0) ? true : false,
          enabled: user.enabled,
          showEdit: user.showEdit,
          showPassHistories: user.showPassHistories,
          showAttendance: user.showAttendance,
        };
      })
    });
  });
};

exports.get = function (req, res) {
  var param = req.query;
  validator(req).checkQuery('groupId').nullable().isInt();
  validator(req).checkQuery('limit').nullable().isInt();
  validator(req).checkQuery('offset').nullable().isInt();
  validator(req).checkQuery('userEnabled').nullable().isLength(0, 10);
  validator(req).checkQuery('searchText').nullable().isLength(0, 50);
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParams = {
    groupId: param.groupId,
    limit : param.limit,
    offset : param.offset || 0,
    requestTime : param.requestTime,
  };
  var responseUsers = function (group, sort) {
    var condition = {};
    condition.$and = [];
    if (group) {
      condition.$and.push({ _id: { $in: group.users } });
    }
    if(param.searchText && typeof param.searchText === 'string') {
      var reg =  new RegExp(param.searchText.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"));
      condition.$and.push({
        $or: [
          { login: reg },
          { name : reg },
        ]
      });
    }
    if(param.userEnabled === 'disabled') {
      condition.$and.push({ enabled: false});
    } else if(param.userEnabled === 'enabled'){
      condition.$and.push({ enabled: true});
    }
    if (condition.$and.length === 0) {
      condition = {};
    }

    async.parallel({
      count: function (callback) {
        User.count(condition).exec(callback);
      },
      users: function (callback) {
        var queryUser = User.find(condition)
          .skip(reqParams.offset);
        if (reqParams.limit) {
          queryUser.limit(reqParams.limit);
        }
        var sortCondition = {};
        if (_.has(sort, 'employeeCode')) {
          sortCondition['employeeCode'] = sort.employeeCode;
        } else {
          sortCondition['displayOrder'] = 1;
        }
        queryUser.sort(sortCondition);
        queryUser.exec(User.populateSource(callback));
      }
    }, function (err, results) {
      if (!err) {
        mapForList(req.user, reqParams, results, function(err, data) {
          return res.json(data);
        });
      } else {
        logger.error(err);
        res.status(500);
        res.send(err);
      }
    });
  };
  async.waterfall([
    function (callback) {
      User.findOne({id: req.user.id}).exec(callback);
    },
    function (user, callback) {
      logic.getPermissionGroups(user._id, function(err, perms) {
        var gorupIds = user.manageGroups.concat(perms.middle).concat(perms.better);
        callback(err, user, gorupIds);
      });
    },
    function (user, gorupIds, callback) {
      if (user.admin || user.top) {
        Group.findOne({id: reqParams.groupId}).exec(callback);
      } else if (gorupIds && gorupIds.length > 0) {
        Group.findOne({
          id: reqParams.groupId,
          $or: [
            { users: user },
            { id: { $in: gorupIds } },
          ]
        }).exec(callback);
      } else {
        Group.findOne({id: reqParams.groupId, users: user}).exec(callback);
      }
    },
  ], function (err, group) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);
    } else if (!group && !req.user.admin && !req.user.top) {
      res.status(403);
      return res.json({});
    } else {
      responseUsers(group, JSON.parse(param.sort) || {});
    }
  });
};
