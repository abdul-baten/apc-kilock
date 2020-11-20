'use strict';

var _ = require('lodash'),
  async = require('async'),
  mongoose = require('mongoose'),
  logger = log4js.getLogger(),
  Role = mongoose.model('Role'),
  validator = require('../../utils/validator');


/**
 * roleの一覧を取得する
 * @param req リクエスト
 * @param res レスポンス
 */
exports.get = function (req, res) {
  async.waterfall([
      function (callback) {
        Role.find({}).exec(callback);
      }
    ],
    function (err, result) {
      if (err) {
        logger.error(err);
        res.status(500);
        res.send(err);
        return;
      }
      res.status(200);
      res.json(result);
    }
  );
};
