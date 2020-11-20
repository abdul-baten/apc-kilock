'use strict';

var _ = require('lodash'),
    async = require('async'),
    mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    User = mongoose.model('User'),
    Group = mongoose.model('Group'),
    PassHistory = mongoose.model('PassHistory'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic');

exports.get = function (req, res) {
  // TODO 権限制御
  var loginuser = req.user;
  if (!loginuser.admin) {
    // 管理ユーザでない場合はuserId必須
    validator(req).checkQuery('userId').isInt();
  }
  validator(req).checkQuery('limit').nullable().isInt();
  validator(req).checkQuery('offset').nullable().isInt();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  var reqParams = {
    userId: req.query.userId ? parseInt(req.query.userId) : null,
    limit : req.query.limit || 100,
    offset : req.query.offset || 0,
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
        if (user) {
          logic.getUserPermissions(req.user._id, user._id, callback);
        } else {
          callback(err, {});
        }
      },
    }, function (err, data) {
      if (err) {
        logger.error(err);
        res.status(500);
        res.send(err);
        return;
      }

      // 自分の勤務表でなく、かつどの権限も持っていない場合はエラー（閲覧不可）
      if (!req.user.admin &&
          !req.user.top &&
          user != null &&
          !req.user.equals(user) &&
          !data.permission.middle &&
          !data.permission.better &&
          !data.permission.admin) {
        res.status(403);
        return res.json({});
      }

      var condition = {};
      if (reqParams.userId) {
        condition.userId = reqParams.userId;
      }
      PassHistory.find(condition)
        .populate('user')
        .populate('device')
        .populate('door')
        .skip(reqParams.offset)
        .limit(reqParams.limit)
        .sort({timestamp: -1})
        .exec(function (err, passHistories) {
          if (!err) {
            var results = _(passHistories).map(function (passHistory) {
              var user = passHistory.user;
              var device = passHistory.device;
              var door = passHistory.door;
              var typeName;
              if (passHistory.type === 'enter') {
                typeName = req.__('入室');
              } else if (passHistory.type === 'leave') {
                typeName = req.__('退室');
              } else {
                typeName = req.__('不明');
              }
              var openEventName;
              if (passHistory.openEvent === 'nfc') {
                openEventName = req.__('NFC');
              } else if (passHistory.openEvent === 'mobile') {
                openEventName = req.__('モバイル');
              } else {
                openEventName = req.__('不明');
              }
              var resultName;
              if (passHistory.result === 'allow') {
                resultName = req.__('許可');
              } else if (passHistory.result === 'deny') {
                resultName = req.__('拒否');
              } else if (passHistory.result === 'error') {
                resultName = req.__('エラー');
              } else {
                resultName = req.__('不明');
              }
              return {
                userName: user ? user.name : null,
                employeeCode: user ? user.employeeCode : '',
                timestamp: passHistory.timestamp,
                typeName: typeName,
                openEventName: openEventName,
                deviceName: device ? device.name : null,
                doorName: door ? door.name : null,
                resultName: resultName,
                message: passHistory.message,
              };
            }).value();
            return res.json(results);
          } else {
            logger.error(err);
            res.status(500);
            res.send(err);
          }
        });
      });
  });
};
