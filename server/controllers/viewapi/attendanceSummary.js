'use strict';

var config = require('../../config/environment');
var _ = require('lodash'),
    async = require('async'),
    mongoose = require('mongoose'),
    moment = require('moment'),
    Group = mongoose.model('Group'),
    logger = log4js.getLogger(),
    User = mongoose.model('User'),
    AttendanceStatus = mongoose.model('AttendanceStatus'),
    AttendanceStatusLog = mongoose.model('AttendanceStatusLog'),
    ObjectId = require('mongoose').Types.ObjectId,
    datetimeutil = require('../../utils/datetimeutil'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic'),
    redisutil = require('../../utils/redisutil');

var RoundMinutes = [ 1, 5, 10, 15, 30, 60 ];
var DefaultRoundMinutes = 15;

var responseCsv = function(user, reqParams, res) {
  var redisKey = 'mngcsv' + reqParams.year + reqParams.month;
  var redisClient = redisutil.createRedisClient();
  redisClient.exists(redisKey, function(err, result) {
    if (result == 1) {
      logger.info('manage csv redisKey: ' + redisKey + ' is exsist in redis.');
      redisClient.get(redisKey, function(err, resStr) {
        if (err) {
          logger.error(err)
        }
        res.writeHead(200, {'Content-Type': 'text/csv'});
        res.write(resStr);
        res.end();
        if (redisClient) {
          redisClient.end();
        }
        return;
      });
    } else {
      logger.info('manage csv redisKey: ' + redisKey + ' is not exsist in redis.');
      async.parallel({
        attendanceCsvSummaries: function(callback) {
          logic.getSummaryCsv(user, reqParams.year, reqParams.month, function( err, summaries ){
            callback(err, summaries);
          });
        },
      }, function (err, data) {
        if (!err) {
          var tzOffset = config.timeoffset * 60;
          var resStr = '';
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/csv');

          resStr += '社員番号, 氏名, 出勤, 休出, 特別休, 有給, 欠勤, , 出勤時間, 遅早, 時間外, 休出, 深夜, 遅早回数, 夜勤, 交通費, 通勤費, 60h超\r\n';
          data.attendanceCsvSummaries.forEach(function(summary) {
            resStr += _.map(summary, function(field) {
              if (field === undefined || field === null) {
                return '';
              }
              else if (typeof(field.toISOString) === 'function') {
                return moment(field.toISOString()).zone(-tzOffset).format();
              }
              return field.toString().replace(/\"/g, '""');
            }).toString() + '\r\n';
          });

          redisClient.set(redisKey, resStr);
          redisClient.expire(redisKey, 10 * 60);
          if (redisClient) {
            redisClient.end();
          }

          res.write(resStr);
          res.end();
          return;
        } else {
          logger.error(err);
          res.status(500);
          res.send(err);
        }
      });
    }
  });
};

exports.get = function (req, res) {

  var loginuser = req.user;

  validator(req).checkQuery('userId').nullable().isInt();
  validator(req).checkQuery('year').nullable().isInt();
  validator(req).checkQuery('month').nullable().isInt();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var workdate = datetimeutil.workdate();

  var reqParams = {
    userId: req.query.userId ? parseInt(req.query.userId) : loginuser.id,
    year: req.query.year ? parseInt(req.query.year) : workdate.year,
    month: req.query.month ? parseInt(req.query.month) : workdate.month,
  };

  var user;
  async.waterfall([
    function (callback) {
      User.findOne({id: reqParams.userId}, function(err, findUser) {
        user = findUser;
        callback(err);
      });
    },
  ], function (err) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);
      return;
    }

    async.parallel({
      permission: function(callback) {
        logic.getUserPermissions(req.user._id, user._id, callback);
      },
    }, function (err, data) {
      if (err) {
        logger.error(err);
        res.status(500);
        res.send(err);
        return;
      }

      // 自分の勤務表でなく、かつどの権限も持っていない場合はエラー（閲覧不可）
      if (!req.user.equals(user) &&
          !req.user.admin &&
          !req.user.top &&
          !data.permission.middle &&
          !data.permission.better &&
          !data.permission.admin) {
        res.status(403);
        return res.json({});
      }

      if (req.header('accept') === 'application/csv') {
        responseCsv(user, reqParams, res);

      } else {
        async.parallel({
          attendanceSummary: function(callback) {
            logic.getSummary(user, reqParams.year, reqParams.month, function( err, summary ){
              callback(err, summary);
            });
          },
        }, function (err, data) {
          if (!err) {
            return res.json({
              user:               user ? user._id : null,
              userId:             user ? user.id : null,
              userName:           user ? user.name : '',
              loginUser:          loginuser._id,
              year:               reqParams.year,
              month:              reqParams.month,
              attendanceSummary:  data.attendanceSummary,
              isMine:             user ? user.id == req.user.id : false,
              isMiddleManager:    true,
              isBetterManager:    true,
              isTopManager:       true,
            });
          } else {
            logger.error(err);
            res.status(500);
            res.send(err);
          }
        });
      };
    });
  });
};
