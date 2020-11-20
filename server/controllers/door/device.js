'use strict';
var mongoose = require('mongoose'),
    nodeUuid = require('node-uuid'),
    util     = require('util'),
    _ = require('lodash'),
    async = require('async'),
    logger = log4js.getLogger(),
    User = mongoose.model('User'),
    Device = mongoose.model('Device'),
    OneTimeToken = mongoose.model('OneTimeToken'),
    config = require('../../config/environment'),
    validator = require('../../utils/validator');

var Results = {
  SUCCESS: 0,
  INVALID: 1,
  Error: 2,
};

exports.post = function (req, res) {
  validator(req).checkBody('onetime_token').notEmpty();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json({
      result: Results.ERROR,
      token: '',
      message: req.__('バリデートエラー'),
    });
  }
  var reqParams = {
    onetimeToken: req.body.onetime_token,
    uuid: req.body.uuid,
    udid: req.body.udid,
  };
  async.waterfall([
    function (callback) {
      // ワンタイムトークン情報取得
      OneTimeToken.findOne({
          token: reqParams.onetimeToken,
          expiration: { $gt: Date.now() }
        })
        .populate('user')
        .exec(callback);
    },
    function (onetimeToken, response) {
      var responseInvalid = function () {
        response(null, 400,
          {
            result: Results.INVALID,
            token: '',
            message: req.__('無効なコードです。再発行してください。'),
          });
      };
      if (!onetimeToken || !onetimeToken.type ||
        !onetimeToken.user || !onetimeToken.user.enabled) {
        return responseInvalid();
      }
      if (onetimeToken.type === 'DeviceMobile') {
        // ユーザ用デバイス登録処理開始
        async.waterfall([
          function (next) {
            var userId = onetimeToken.user.id;
            User.findOne({ id: userId, enabled: true })
              .populate('devices')
              .exec(next);
          },
          function (user, next) {
            if (!user) {
              responseInvalid();
              return;
            }
            onetimeToken.remove(function (err) {
              if (err) {
                next(err);
                return;
              }

              if (user.devices && user.devices.length >= config.maxNumberOfDevicesPerUser) {
                next(new Error(), 400, {
                  result: Results.Error,
                  token: '',
                  message: req.__('登録数が上限です'),
                });
                return;
              }

              var deviceName = req.__('%sのデバイス', user.name);
              var deviceNameSuffix = '';
              var createDeviceName = function () {
                return deviceName + deviceNameSuffix;
              };

              // インクリメント回数(無限にインクリメントする必要はない)
              var maxRetryCount = 10;
              for (var tryCount = 1; tryCount <= maxRetryCount; tryCount++) {
                if (!_(user.devices).pluck('name').contains(createDeviceName())) {
                  break;
                }
                if (tryCount === maxRetryCount) {
                  deviceNameSuffix = '(*)';
                } else {
                  deviceNameSuffix = util.format('(%d)', tryCount + 1);
                }
              }

              var device = new Device({
                token: nodeUuid.v1(),
                name: createDeviceName(),
                uuid: reqParams.uuid || null,
                udid: reqParams.udid || null,
                type: 'mobile',
                user: user
              });
              device.save(function (err, device) {
                if (err) {
                  next(err);
                } else {
                  next(null, device, user);
                }
              });
            });
          },
          function (device, user, next) {
            if (!user.devices) {
              user.devices = [];
            }

            user.devices.push(device);
            user.save(function (err) {
              if (err) {
                return next(err);
              }
              return next(null, 200, {
                  result: Results.SUCCESS,
                  token: device.token,
                  message: req.__('%s を登録しました', device.name),
                });
            });
          },
        ], response);
      } else if (onetimeToken.type === 'DeviceNfc') {
        onetimeToken.remove(function (err) {
          if (err) {
            response(err);
            return;
          }
          var device = new Device({
            token: nodeUuid.v1(),
            name: req.__('新しいNFC用デバイス'),
            uuid: reqParams.uuid || null,
            udid: reqParams.udid || null,
            type: 'nfc',
          });
          device.save(function (err, device) {
            if (err) {
              return response(err);
            }
            return response(null, 200, {
              result: Results.SUCCESS,
              token: device.token,
              message: req.__('%s を登録しました', device.name),
            });
          });
        });
      } else {
        return responseInvalid();
      }
    },
  ], function (err, status, json) {
    if (!err) {
      res.status(status);
      return res.json(json);
    } else {
      if (status) {
        res.status(status);
        return res.json(json);
      }
      logger.error(err);
      res.status(500);
      return res.json({
        result: Results.Error,
        door_key: reqParams.doorKey,
        message: err.toString(),
      });
    }
  });
};
