'use strict';

var logger = log4js.getLogger();
var mongoose = require('mongoose');
var validator = require('../../utils/validator');
var async = require('async');
var Matter = mongoose.model('Matter');
var User = mongoose.model('User');
var Device = mongoose.model('Device');
var AttendanceInCut = mongoose.model('AttendanceInCut');
var CollectionSummary = mongoose.model('CollectionSummary');

/**
 * バリデーション
 * @param req
 * @returns {*}
 */
var validateRequest = function (req) {
  validator(req).checkQuery('unit').notEmpty();
  validator(req).checkQuery('limit').nullable().isInt();
  validator(req).checkQuery('offset').nullable().isInt();
  validator(req).checkQuery('timestamp').nullable().isInt();
  validator(req).checkQuery('sourcename').nullable().isIn(['local', 'shirakaba']);
  validator(req).checkQuery('token').nullable();
  return req.validationErrors();
};

exports.get = function (req, res) {
  logger.info(req.query);

  // バリデーション
  var validateErrors = validateRequest(req);
  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json({
      statusCode : 'ERROR',
      errors: validateErrors,
    });
  }

  // 案件情報取り込み
  async.parallel({
    matters: function (callback) {
      async.waterfall([
        function (callback) {
          if (req.query.token) {
            Device.findOne({token:req.query.token}).exec(function(err, device) {
              if (device) {
                callback(null, device.user);
              } else {
                callback(null, null);
              }
            });
          } else {
            callback(null, null);
          }
        },
        function (user, callback) {
          var now = new Date();
          var conditions = {
            "$and": [
              { contractStart: { "$lte": now } },
              { contractEnd: { "$gte": now } },
              { valid: true },
              { updated: {"$gt": new Date(req.query.timestamp * 1000)} },
            ],
          };
          if (req.query.token) {
            conditions['resources'] = {
              $elemMatch: {
                user: user,
              }
            };
          }
          var options = {
            sort:          {contractStart: 'asc'},
            skip:          req.query.offset,
            limit:         req.query.limit,
          };
          Matter.find(conditions, null, options, function (err, matters) {
            callback(err, matters);
          });
        },
      ], function(err, matters) {
        callback(err, matters);
      });
    },
    updated: function (callback) {
      CollectionSummary.findOne({name:Matter.collection.name}, function (err, summary) {
        var updated = 0;
        if (summary) {
          updated = summary.updated.getTime();
        }
        callback(err, updated);
      });
    }
  }, function (err, results) {
    if (err) {
      logger.error(err);
      return res.json({
        statusCode : 'ERROR',
        errors: err,
      });
    }

    // 案件情報(matters)以下の返却データを整形
    var matters = results.matters;
    var resMatters = [];
    async.each(matters, function(matter, callback) {
      var users = [];
      async.each(matter.resources, function(resource, callback) {
        async.parallel({
          attendanceInCut: function (callback) {
            var conditions = {
              user:  resource.user,
              year:  matter.year,
              month: matter.month,
            };
            AttendanceInCut.findOne(conditions, function (err, attendanceInCut) {
              callback(null, attendanceInCut);
            });
          },
          user: function (callback) {
            User.findOne({_id: resource.user}, function (err, user) {
              callback(null, user);
            });
          },
        }, function (err, results) {
          if (results.user) {
            var attendanceInCut = results.attendanceInCut;
            // ユーザー情報を設定
            users.push({
              id:         results.user.id,
              start_date: matter.contractStart.getTime(),
              end_date:   matter.contractEnd.getTime(),
              start_time: attendanceInCut ? attendanceInCut.inTime : null,
              end_time:   attendanceInCut ? attendanceInCut.outTime : null,
              shift_flag: attendanceInCut ? attendanceInCut.isNightShift : false,
            });
          }
          callback();
        });
      }, function (err) {
        // 案件情報を設定
        var mi = matters.indexOf(matter);
        resMatters[mi] = {
          id: matter.id,
          no: matter.matterCode,
          name: matter.matterName,
          order: mi + 1,
          enabled: true,
          users: users,
        };
        callback();
      });
    }, function (err) {
      return res.json({
        result: 0,
        timestamp: results.updated,
        matters: resMatters,
      });
    });
  });
}
