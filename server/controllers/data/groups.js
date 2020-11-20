'use strict';
var _ = require('lodash'),
    async = require('async'),
    config = require('../../config/environment'),
    mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    Group = mongoose.model('Group'),
    CollectionSummary = mongoose.model('CollectionSummary'),
    validator = require('../../utils/validator'),
    synchronization = require('../../utils/synchronization');

var mapGroups = function (reqParams, results) {
  return {
    limit       : reqParams.limit || 0,
    offset      : reqParams.offset,
    total_count : results.count,
    timestamp   : results.timestamp,
    groups      : _.map(results.groups, function (group) {
      return {
        id    : group.id,
        name  : group.name || null
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
    unit         : param.unit,
    limit        : param.limit,
    offset       : param.offset || 0,
    timestamp    : param.timestamp,
    sourcename   : param.sourcename,
    forceUpdate  : param.force_update === 'true' ? true : false,
  };
  var condition = {};
  condition.enabled = true;
  if (reqParams.timestamp) {
    var timestamp = parseInt(reqParams.timestamp);
    var updated = new Date(timestamp);
    condition.updated = { $gt: updated };
  }
  if (reqParams.sourcename) {
    condition.sourcename = reqParams.sourcename;
  }
  var syncOptions = {
    forceUpdate: reqParams.forceUpdate
  };
  synchronization.users(syncOptions, function () {
    async.parallel({
      count: function (callback) {
        Group.count(condition).exec(callback);
      },
      timestamp: function (callback) {
        CollectionSummary.findOne({name:Group.collection.name})
          .exec(function (err, summary) {
            var updated = 0;
            if (summary) {
              updated = summary.updated.getTime();
            }
            callback(err, updated);
          });
      },
      groups: function (callback) {
        var queryGroup = Group.find(condition)
          .skip(reqParams.offset);
        if (reqParams.limit) {
          queryGroup.limit(reqParams.limit);
        }
        queryGroup.exec(callback);
      }
    }, function (err, results) {
      if (!err) {
        var data = mapGroups(reqParams, results);
        return res.json(data);
      } else {
        return res.send(err);
      }
    });
  });
};
