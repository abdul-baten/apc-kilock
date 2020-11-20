"use strict";

var config = require("../../config/environment"),
  validator = require("../../utils/validator"),
  mongoose = require("mongoose"),
  TimeCardLog = mongoose.model("TimeCardLog"),
  logger = log4js.getLogger();

// タイムカードの一覧を返す (GET /viewapi/TimeCardLog.json)
exports.get = function (req, res) {
  // TimeCardLog
  TimeCardLog.find({}, null, {
      sort: {
        errorHappened: -1
      }
    },
    function (err, timecardlog) {
      if (err) {
        logger.error(err);
        res.status(500);
        res.send(err);
        return;
      }
      return res.json({
        timecardlog: timecardlog
      });
    });
};

// 分割勤務表申請 (POST /viewapi/TimeCardLog.json)
exports.post = function (req, res) {
  validator(req)
    .checkBody("userId")
    .notEmpty()
    .isInt();
  validator(req)
    .checkBody("loginUser")
    .notEmpty();
  validator(req)
    .checkBody("year")
    .notEmpty()
    .isInt();
  validator(req)
    .checkBody("month")
    .notEmpty()
    .isInt();
  validator(req)
    .checkBody("day")
    .notEmpty()
    .isInt();

  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info({
      validateErrors: validateErrors
    });
    res.status(400);
    return res.json(validateErrors);
  }

  var timeCardErrorLog = new TimeCardLog({
    userId: req.body.userId,
    loginUser: mongoose.Types.ObjectId(req.body.loginUser),
    year: req.body.year,
    month: req.body.month,
    day: req.body.day,
    attendanceTime: req.body.attendanceTime,
    timecardTime: req.body.timecardTime
  });
  timeCardErrorLog.save(function (err) {
    if (err)
      console.log(err);
  });

  // レスポンス
  res.status(200);
  return res.json(req.body);
};
