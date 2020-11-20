'use strict';

var url = require('url'),
  mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  _ = require('lodash'),
  async = require('async'),
  User = mongoose.model('User'),
  Nfc = mongoose.model('Nfc'),
  Device = mongoose.model('Device'),
  Door = mongoose.model('Door'),
  PassHistory = mongoose.model('PassHistory'),
  config = require('../../config/environment'),
  validator = require('../../utils/validator'),
  logic = require('../../logics/pass_histories_logic'),
  attendanceLogic = require('../../logics/attendance_logic'),
  AttendanceInCut = mongoose.model('AttendanceInCut'),
  Matter = mongoose.model('Matter'),
  datetimeutil = require('../../utils/datetimeutil');

var Results = {
  Allow: 0,
  Deny: 1,
  Error: 2
};

var Postbox = null;
if (config.mailer) {
  Postbox = require('../../utils/postbox');
}

exports.post = function (req, res) {
  validator(req).checkBody('pass_type').nullable().isIn(logic.passTypeValidValue);
  validator(req).checkBody('device_token').notEmpty();
  validator(req).checkBody('location_id').nullable();
  validator(req).checkBody('timestamp').nullable().isInt();
  validator(req).checkBody('lat').nullable().isFloat();
  validator(req).checkBody('lng').nullable().isFloat();
  validator(req).checkBody('matter_id').nullable().isInt();
  var validateErrors = req.validationErrors();

  logger.info({api: 'door_post' , process: 'recieve request' , parameters:req.body});
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json({
      result: Results.Error,
      door_key: '',
      message: req.__('バリデートエラー'),
    });
  }

  var location = logic.createLocation(req.body.lat, req.body.lng);

  // 緯度・経度のバリデーション
  if(!logic.validLocation(location)) {
    // バリデートエラー
    res.status(400);
    return res.json({
      result: Results.Error,
      door_key: '',
      message: req.__('バリデートエラー') + req.__('(緯度経度の値が、どちらか片方しか存在していません。)'),
    });
  }

  var reqParams = {
    passType: req.body.pass_type,
    deviceToken: req.body.device_token,
    doorKey: req.body.location_id,
    nfc: req.body.nfc,
    timestamp: req.body.timestamp,
    location: location,
    matter_id: req.body.matter_id,
  };
  logger.info({api: 'door_post' , process: 'parsed parameter' , parameters:reqParams});

  var response = function (err, status, json) {
    if (err) {
      logger.error(err);
      status = 500;
      json = {
        result: Results.Error,
        door_key: '',
        message: err.toString()
      };
    }
    res.status(status);
    return res.json(json);
  };

  async.parallel({
    door: function (callback) {
      if (reqParams.doorKey) {
        Door.findOne({key: reqParams.doorKey})
          .exec(callback);
      } else {
        callback(null, null);
      }
    },
    device: function (callback) {
      Device.findOne({ token: reqParams.deviceToken })
        .populate('user')
        .exec(callback);
    },
  }, function (err, data) {
    var door = data.door;
    var device = data.device;

    if (err) {
      return response(err);
    } else if (!device) {
      return response(null, 200, {
        result: Results.Deny,
        door_key: '',
        message: req.__('許可されていないデバイスです。'),
      });
    } else {
      var responseResult = function (err, data) {
        if (err) {
          return response(err);
        }
        var user = data.user;
        var device = data.device;
        var nfc = data.nfc;
        var result, passResult, message;
        if (user && user.enabled) {
          result = Results.Allow;
          passResult = 'allow';
          message = req.__('%sさんの通過を確認しました。', user.name);
        } else {
          result = Results.Deny;
          passResult = 'deny';
          if (data.type === 'nfc') {
            message = req.__('NFCまたはユーザが登録されていません。');
          } else {
            message = req.__('デバイスまたはユーザが登録されていません。');
          }
        }
        async.parallel({
          matter: function(callback) {
            logic.getMatter(reqParams.matter_id, reqParams.timestamp || Date.now(), user, callback)
          },
          stampable: function(callback) {
            var passDate = new Date(parseInt(reqParams.timestamp || Date.now()) - config.offsetInDayTimestamp);
            var workdate = datetimeutil.workdate(passDate);
            attendanceLogic.stampable(user._id, workdate.year, workdate.month, callback)
          },
        }, function(err, results) {
          if (err) {
            logger.error(err);
            return response(err);
          }
          if (!results.stampable) {
            var msg = "勤務表が既に提出済みです。";
            msg += " user: " + user.id;
            msg += " timestamp: " + reqParams.timestamp || Date.now();
            return response(msg);
          }
          var matter = results.matter;
          PassHistory.findOneAndUpdate({timestamp:reqParams.timestamp}, {$set: {
            type        : logic.convertPassType(reqParams.passType),
            result      : passResult,
            openEvent   : data.type,
            unit        : null,
            deviceToken : reqParams.deviceToken || null,
            device      : device ? device._id : null,
            nfcNumber   : reqParams.nfc || null,
            nfc         : nfc ? nfc._id : null,
            userId      : user ? user.id : null,
            user        : user || null,
            matterId    : matter ? matter.id: null,
            matter      : matter ? matter._id: null,
            doorKey     : reqParams.doorKey || null,
            door        : door || null,
            message     : message || null,
            timestamp   : reqParams.timestamp || Date.now(),
            location    : reqParams.location
          }}, {upsert: true}, function (err, savedPassHistory) {
            if (err) {
              logger.debug('save error');
              return response(err);
            }
            async.series([
              function(callback) {
                savedPassHistory.saveAttendanceLog(savedPassHistory, callback);
              },
              function(callback) {
                savedPassHistory.saveTimecard(savedPassHistory, callback);
              },
            ], function() {
              if (result === Results.Allow && Postbox) {
                var date = reqParams.timestamp ? new Date(reqParams.timestamp) : new Date();
                Postbox.postMail(data.user, reqParams.passType, date, function (err) {
                  if (err) {
                    logger.error(err);
                  }
                });
              }
            });
            return response(null, 200, {
              result: result,
              door_key: reqParams.doorKey,
              message: message
            });
          });
        });
      };

      if (device.type === 'nfc' && reqParams.nfc) {
        // NFCからユーザを取得
        Nfc.findOne({number: reqParams.nfc})
          .populate('user')
          .exec(function (err, nfc) {
            return responseResult(err, {
              user: nfc ? nfc.user : null,
              device: device,
              nfc: nfc,
              type: 'nfc',
            });
          });
      } else if (device.type === 'mobile') {
        // デバイスに紐づくユーザを使用
        return responseResult(null, {
          user: device.user,
          device: device,
          nfc: null,
          type: 'mobile',
        });
      } else {
        return response(null, 200, {
          result: Results.Deny,
          door_key: '',
          message: req.__('許可されていないデバイスです。'),
        });
      }
    }
  });
};
