'use strict';

var url = require('url'),
    mongoose = require('mongoose'),
    logger = log4js.getLogger(),
    _ = require('lodash'),
    async = require('async'),
    redis = require('redis'),
    util = require('util'),
    User = mongoose.model('User'),
    Nfc = mongoose.model('Nfc'),
    Device = mongoose.model('Device'),
    Door = mongoose.model('Door'),
    PassHistory = mongoose.model('PassHistory'),
    AttendanceInCut = mongoose.model('AttendanceInCut'),
    Matter = mongoose.model('Matter'),
    config = require('../../config/environment'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/pass_histories_logic'),
    attendanceLogic = require('../../logics/attendance_logic'),
    datetimeutil = require('../../utils/datetimeutil');

var websockets = require('../../websocket/server').websockets;

var Postbox = (config.mailer) ? require('../../utils/postbox') : null;

var redisUrl = config.redis && config.redis.uri ? url.parse(config.redis.uri) : null;

var createRedisClient = function () {
  if (!redisUrl) {
    return null;
  }
  var client = redis.createClient(
    redisUrl.port || 6379,
    redisUrl.hostname,
    config.redis.options
  );

  var password = redisUrl.auth ? redisUrl.auth.split(':')[1] : null;
  if (password) {
    client.auth(password);
  }
  return client;
};

var Results = {
  Allow: 0,
  Deny: 1,
  Error: 2,
};

var getQuery = function(client) {
  if (!client || !client.req) {
    return {};
  }
  var query = url.parse(client.req.url, true).query || {};
  return query;
};

var openTheDoorByOwnInstance = function (doorKey) {
  var open = false;
  if (!websockets || !websockets.opensesame) {
    return false;
  }
  websockets.opensesame.clients.forEach(function (client, i) {
    if (open) {
      return;
    }
    // 条件に合うclientを探す
    var query = getQuery(client);
    if (query.door_key === doorKey) {
      // 解錠命令
      client.send('open');
      open = true;
    }
  });
  return open;
};

var openTheDoor = function (doorKey, callback) {
  var redisClient = createRedisClient();

  var publishChannel = util.format('opensesame door_key=%s', doorKey);
  var publishMessage = 'open';
  logger.debug('publish channel="%s"', publishChannel);
  // 解錠結果を返す
  var responseOpenResult = function(err, clientCount) {
    if (err) {
      logger.error(err);
    }
    if (redisClient) {
      redisClient.end();
    }
    if (clientCount > 0) {
      logger.debug('openTheDoor success');
      // 成功を返す
      callback(null, true);
    } else {
      // 同一インスタンスに直接解錠命令
      var result = openTheDoorByOwnInstance(doorKey);
      if (result) {
        logger.debug('openTheDoorByOwnInstance success');
        logger.warn('opensesame success by own instance.');
      }
      callback(null, result);
    }
  };
  if (redisClient) {
    // redis経由で解錠命令
    redisClient.publish(publishChannel, publishMessage, responseOpenResult);
  } else {
    responseOpenResult(null, 0);
  }
};

exports.post = function (req, res) {
  validator(req).checkBody('pass_type').nullable().isIn(logic.passTypeValidValue);
  validator(req).checkBody('device_token').notEmpty();
  validator(req).checkBody('door_key').notEmpty();
  validator(req).checkBody('timestamp').nullable().isInt();
  validator(req).checkBody('lat').nullable().isFloat();
  validator(req).checkBody('lng').nullable().isFloat();
  var validateErrors = req.validationErrors();

  logger.info({api: 'door_open' , process: 'recieve request' , parameters:req.body});
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
    doorKey : req.body.door_key,
    nfc : req.body.nfc,
    timestamp : req.body.timestamp,
    location: location,
    matter_id: req.body.matter_id,
  };

  var response = function (err, status, json) {
    if (err) {
      logger.error(err);
      status = 500;
      json = {
        result: Results.Error,
        door_key: '',
        message: err.toString(),
      };
    }
    res.status(status);
    return res.json(json);
  };

  async.parallel({
    door: function (callback) {
      Door.findOne({key: reqParams.doorKey})
        .exec(callback);
    },
    device: function (callback) {
      Device.findOne({ token:reqParams.deviceToken })
        .populate('user')
        .exec(callback);
    },
  }, function (err, data) {
    var door = data.door;
    var device = data.device;
    if (err) {
      return response(err);
    } else if (!door) {
      logger.info('Unknown door_key : %s', reqParams.doorKey);
      return response(null, 200, {
        result: Results.Error,
        door_key: '',
        message: req.__('ドアを取得できませんでした。'),
      });
    } else if (!device) {
      logger.info('Unknown device_token : %s', reqParams.deviceToken);
      return response(null, 200, {
        result: Results.Deny,
        door_key: '',
        message: req.__('許可されていないデバイスです。'),
      });
    }
    async.waterfall([
        // 各データを揃える
        function (callback) {
          if (device.type === 'nfc' && reqParams.nfc) {
            // NFCからユーザを取得
            Nfc.findOne({number: reqParams.nfc})
            .populate('user')
            .exec(function (err, nfc) {
              if (err) {
                return response(err);
              }
              callback(null, {
                user: nfc ? nfc.user : null,
                device: device,
                nfc: nfc,
                type: 'nfc',
              });
            });
          } else if (device.type === 'mobile') {
            // デバイスに紐づくユーザを使用
            callback(null, {
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
        },
        // 解錠関連
        function (data, callback) {
          var user = data.user;
          if (config.doorOpenEnabled && user && user.enabled && user.doorOpen) {
            // 解錠を試みる
            openTheDoor(reqParams.doorKey, function (err, open) {
              callback(err, data, { open: open });
            });
          } else {
            // 解錠は行わない
            callback(null, data, null);
          }
        },
        // レスポンスデータ生成と通過履歴登録
        function (data, doorResult, callback) {
          var user = data.user;
          var device = data.device;
          var nfc = data.nfc;
          var result, passResult, message;

          if (doorResult) {
            var open = doorResult.open;
            if (open) {
              result = Results.Allow;
              passResult = 'allow';
              message = req.__('%sさんにより解錠を行います。', user.name);
            } else if (door.action === 'open') {
              result = Results.Error;
              passResult = 'error';
              message = req.__('開閉ちゃんが動作していない可能性があります。');
            } else {
              result = Results.Allow;
              passResult = 'allow';
              message = req.__('%sさんの通過を確認しました。', user.name);
            }
          } else if (user && !user.doorOpen) {
            result = Results.Deny;
            passResult = 'deny';
            message = req.__('扉を開ける権限がありません。');
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
              type       : logic.convertPassType(reqParams.passType),
              result     : passResult,
              openEvent  : data.type,
              unit       : null,
              deviceToken: reqParams.deviceToken || null,
              device     : device ? device._id : null,
              nfcNumber  : reqParams.nfc || null,
              nfc        : nfc ? nfc._id : null,
              userId     : user ? user.id : null,
              user       : user || null,
              matterId   : matter ? matter.id: null,
              matter     : matter ? matter._id: null,
              doorKey    : reqParams.doorKey || null,
              door       : door ? door._id : null,
              message    : message || null,
              timestamp  : reqParams.timestamp || Date.now(),
              location   : reqParams.location
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
              return callback(null, 200, {
                result: result,
                door_key: reqParams.doorKey,
                message: message
              });
            });
          });
        },
      ], function (err, status, json) {
        if (err) {
          return response(err);
        }
        response(null, 200, json);
      });
  });
};
