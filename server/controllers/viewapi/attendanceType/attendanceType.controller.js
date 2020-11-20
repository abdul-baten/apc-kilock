'use strict';

/**
 * @fileOverview モデル AttendanceTypeに関するAPI
 * @fileOverview モデル AttendanceTypeに関するAPI
 */

var config = require('../../../config/environment'),
  logger = log4js.getLogger(),
  async = require('async'),
  _ = require('lodash'),
  mongoose = require('mongoose'),
  AttendanceType = mongoose.model('AttendanceType'),
  validator = require('../../../utils/validator');


/**
 * 勤怠区分一覧を取得する
 * @param {Object} req リクエストオブジェクト
 * @param {Object} res レスポンスオブジェクト
 */
exports.getAttendanceTypeList = function (req, res) {
  AttendanceType.find({}, {name: 1}).sort({displayOrder: 1}).exec(function (err, result) {
    if (err) {
      logger.error(err);
      res.status = 500;
      res.json({});
    } else {
      res.status = 200;
      res.json(result);
    }
  });
};

