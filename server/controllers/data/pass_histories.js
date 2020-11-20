'use strict';

var _ = require('lodash'),
  async = require('async'),
  mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  Nfc = mongoose.model('Nfc'),
  PassHistory = mongoose.model('PassHistory'),
  AttendanceInCut = mongoose.model('AttendanceInCut'),
  Matter = mongoose.model('Matter'),
  User = mongoose.model('User'),
  config = require('../../config/environment'),
  validator = require('../../utils/validator'),
  logic = require('../../logics/pass_histories_logic'),
  attendanceLogic = require('../../logics/attendance_logic'),
  datetimeutil = require('../../utils/datetimeutil');

var Results = {
  SUCCESS: 0,
  ERROR: 1,
};

/**
 * pass_typeのバリデーションを行う。
 * @param pass_type
 * @returns {boolean}
 */
var validatePassType = function(pass_type) {
  pass_type = pass_type.toString();

  for (var i in logic.passTypeValidValue) {
    if (logic.passTypeValidValue[i] === parseInt(pass_type))  return true;
  }

  return false;
};

var Postbox = null;
if (config.mailer) {
  Postbox = require('../../utils/postbox');
}

exports.post = function (req, res) {
  validator(req).checkBody('unit').notEmpty();
  // TODO デバイスのパターンも作る
  // validator(req).checkBody('type').notEmpty().isIn(['nfc', 'device']);
  validator(req).checkBody('type').notEmpty().isIn(['nfc']);
  validator(req).checkBody('data').notEmpty();
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.error({validateErrors: validateErrors});
    res.status(400);
    return res.json({
      result: Results.ERROR,
      message: req.__('バリデートエラー'),
    });
  }
  var reqParams = {
    unit: req.body.unit,
    type: req.body.type,
    data: req.body.data,
  };

  var jsonData;
  try {
    if (typeof reqParams.data == 'string') {
      jsonData = JSON.parse(reqParams.data);
    } else {
      jsonData = reqParams.data;
    }
  } catch (err) {
    logger.error({ error: err , data: reqParams.data });
    res.status(400);
    return res.json({
      result: Results.ERROR,
      message: req.__('JSONを解析できません'),
    });
  }

  if (!_(jsonData).isArray()) {
    var msg = req.__('不正な形式のデータです');
    logger.error({ error: msg , data: jsonData });
    res.status(400);
    return res.json({
      result: Results.ERROR,
      message: msg,
    });
  }
  var formatError = false;
  _(jsonData).each(function (data) {
    if (reqParams.type === 'nfc' && !data.nfc) {
      formatError = true;
      logger.info('nfcがない');
    }
    if (!data.timestamp || !_(data.timestamp).isNumber()) {
      formatError = true;
      logger.info('timestampが不正');
    }
    if (data.pass_type && !validatePassType(data.pass_type)) {
      formatError = true;
      logger.info('pass_typeが不正');
    }
    if (data.lat && !_(data.lat).isNumber()) {
      formatError = true;
      logger.info('latが不正');
    }
    if (data.lng && !_(data.lng).isNumber()) {
      formatError = true;
      logger.info('lngが不正');
    }

    var location = logic.createLocation(data.lat, data.lng);

    // 緯度・経度のバリデーション
    if(!logic.validLocation(location)) {
      formatError = true;
      logger.info('lat,lngのどちらかしか存在していない');
    }

    data.location = location;

  });
  if (formatError) {
    logger.error({ error: '不正な形式のデータです', data: reqParams.data });
    res.status(400);
    return res.json({
      result: Results.ERROR,
      message: req.__('不正な形式のデータです'),
    });
  }
  if (jsonData.length === 0) {
    return res.json({
      result: Results.SUCCESS
    });
  }


  var savedPassHistories = [];
  async.eachSeries(jsonData, function (data, callback) {
    Nfc.findOne({number: data.nfc})
      .populate('user')
      .exec(function (err, nfc) {
        if (!err) {
          var user = nfc ? nfc.user : null;
          async.parallel({
            matter: function(callback) {
              logic.getMatter(data.matter_id, data.timestamp, user, callback)
            },
            stampable: function(callback) {
              var passDate = new Date(parseInt(data.timestamp) - config.offsetInDayTimestamp);
              var workdate = datetimeutil.workdate(passDate);
              attendanceLogic.stampable(user._id, workdate.year, workdate.month, callback)
            },
          }, function(err, results) {
            if (err) {
              logger.error(err);
              callback(err);
            }
            if (!results.stampable) {
              var msg = "勤務表が既に提出済みです。";
              msg += " user: " + user.id;
              msg += " timestamp: " + parseInt(data.timestamp);
              callback(msg);
              return;
            }

            // 複数の打刻データをまとめて登録時に、attendanceLogとの同期が取れないため
            // pass_histories での登録時はミドルウェアではなく、
            // 手動でattendanceLog と timecard を登録する
            var matter = results.matter;
            PassHistory.findOneAndUpdate({timestamp:data.timestamp}, {$set: {
              type        : logic.convertPassType(data.pass_type),
              result      : 'allow',
              openEvent   : 'nfc',
              unit        : reqParams.unit,
              deviceToken : null,
              device      : null,
              nfcNumber   : nfc ? nfc.number : data.nfc,
              nfc         : nfc ? nfc._id : null,
              userId      : user ? user.id : null,
              user        : user || null,
              matterId    : matter ? matter.id : null,
              matter      : matter ? matter._id : null,
              message     : null,
              timestamp   : parseInt(data.timestamp),
              location    : data.location
            }}, {upsert: true}, function (err, savedPassHistory) {
              savedPassHistory.pass_type = data.pass_type;
              savedPassHistories.push(savedPassHistory);
              callback(err);
            });
          });
        } else {
          callback(err);
        }
      });
  }, function (err) {
    if (err) {
      logger.error(err);
    }

    async.eachSeries(savedPassHistories, function (savedPassHistory, callback) {

      var postMail = function (err, savedPassHistory, user) {
        if (!Postbox) {
          callback(err, savedPassHistory);
          return;
        }
        if (logic.passTypeValueIsUnknown(savedPassHistory.pass_type)) {
          callback(err, savedPassHistory);
          return;
        }
        if (err) {
          callback(err);
          return;
        }
        if (!user) {
          callback(new Error());
          return;
        }

        var date = savedPassHistory.timestamp ? new Date(savedPassHistory.timestamp) : new Date();
        Postbox.postMail(user, savedPassHistory.pass_type, date, function (err) {
          if (err) {
            logger.error(err);
          }
          //ignore the error
          callback(null, savedPassHistory);
        });
      };

      var ignoreMail = function (savedPassHistory) {
        var maxDelayMinutes = config.maxDelayMinutes4PassHistoryMail;
        if (!maxDelayMinutes) {
          // 除外しない
          return false;
        }
        // 一定同期時間を過ぎているかの判別用日時
        var ignoreLimit = new Date(Date.now() - (maxDelayMinutes * 60 * 1000));
        if (savedPassHistory.timestamp < ignoreLimit) {
          logger.debug('[pass_history]ignore mail');
          // 一定時間経過しているので除外
          return true;
        }
        return false;
      };

      async.series([
        function(callback) {
          savedPassHistory.saveAttendanceLog(savedPassHistory, callback);
        },
        function(callback) {
          savedPassHistory.saveTimecard(savedPassHistory, callback);
        },
      ], function() {
        User.findOne({id: savedPassHistory.userId}, function(err, user) {
          if (user && !ignoreMail(savedPassHistory)) {
            postMail(err, savedPassHistory, user);
          } else {
            callback();
          }
        });
      });
    });

    return res.json({
      result: Results.SUCCESS
    });
  });
};
