'use strict';

var _ = require('lodash'),
    async = require('async'),
    config = require('../../config/environment'),
    mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Source = mongoose.model('Source'),
    Group = mongoose.model('Group'),
    User = mongoose.model('User'),
    CollectionSummary = mongoose.model('CollectionSummary'),
    validator = require('../../utils/validator'),
    synchronization = require('../../utils/synchronization');

var mapUsers = function (reqParams, results) {
  return {
    limit: reqParams.limit || 0,
    offset: reqParams.offset,
    total_count: results.count,
    timestamp: results.timestamp,
    users: _.map(results.users, function (user) {
      var sipuri = user.sipuri;
      if (!sipuri && user.extensionPhoneNumber) {
        sipuri = config.defaultSipUri.replace('%d', user.extensionPhoneNumber);
      }
      return {
        id: user.id,
        login: user.login || null,
        no: user.code || null,
        name: user.name,
        employeeCode: user.employeeCode,
        lastname: user.lastname || user.name,
        firstname: user.firstname || '',
        mail: user.mail || null,
        sipuri: sipuri || null,
        imageurl: user.imageurl || null,
        profile: user.profile || null,
        enabled: user.enabled,
        order: user.displayOrder,
        nfcs: _.map(user.nfcs, function (nfc) {
          return nfc.number;
        })
      };
    })
  };
};

exports.get = function (req, res) {
  var param = req.query;
  validator(req).checkQuery('unit').notEmpty();
  validator(req).checkQuery('limit').nullable().isInt();
  validator(req).checkQuery('offset').nullable().isInt();
  validator(req).checkQuery('timestamp').nullable().isInt();
  validator(req).checkQuery('group').nullable().isInt();
  validator(req).checkQuery('force_update').nullable().isIn(['true', 'false']);
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParams = {
    // TODO unitの存在チェック
    unit: param.unit,
    limit : param.limit,
    offset : param.offset || 0,
    search_word : param.name,
    timestamp : param.timestamp,
    group : param.group,
    sourcename : param.sourcename,
    forceUpdate: param.force_update === 'true' ? true : false,
  };
  var responseUsers = function (users, source) {
    var condition = {};
    if (users) {
      condition._id = { $in: users };
    }
    if (source) {
      condition.sources = {
        $elemMatch: { source: source },
      };
    }
    if (reqParams.timestamp) {
      var timestamp = parseInt(reqParams.timestamp);
      var updated = new Date(timestamp);
      condition.updated = { $gt: updated };
    }
    async.parallel({
        count: function (callback) {
          User.count(condition).exec(callback);
        },
        timestamp: function (callback) {
          CollectionSummary.findOne({name:User.collection.name})
            .exec(function (err, summary) {
              var updated = 0;
              if (summary) {
                updated = summary.updated.getTime();
              }
              callback(err, updated);
            });
        },
        users: function (callback) {
          var queryUser = User.find(condition)
            .populate('nfcs')
            .skip(reqParams.offset);
          if (reqParams.limit) {
            queryUser.limit(reqParams.limit);
          }
          //queryUser.sort({id: 1})
          queryUser.exec(callback);
        }
      }, function (err, results) {
        if (!err) {
          var data = mapUsers(reqParams, results);
          return res.json(data);
        } else {
          res.status(500);
          return res.send(err);
        }
      });
  };
  var syncOptions = {
    forceUpdate: reqParams.forceUpdate
  };
  synchronization.users(syncOptions, function () {
    async.parallel({
      group: function (callback) {
        if (reqParams.group) {
          Group.findOne({id: reqParams.group}).exec(callback);
        } else {
          callback(null);
        }
      },
      source: function (callback) {
        if (reqParams.sourcename) {
          Source.findOne({name: reqParams.sourcename}).exec(callback);
        } else {
          callback(null);
        }
      },
    }, function (err, result) {
      if (err) {
        res.status(500);
        return res.send(err);
      }
      var users;
      if (reqParams.group && !result.group) {
        // 不明なグループはユーザなし
        users = [];
      } else if (reqParams.sourcename && !result.source) {
        // 不明なソースはユーザなし
        users = [];
      } else {
        users = result.group ? result.group.users : null;
      }
      responseUsers(users, result.source);
    });
  });
};
