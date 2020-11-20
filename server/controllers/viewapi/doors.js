'use strict';

var _ = require('lodash'),
    logger = log4js.getLogger(),
    async = require('async'),
    mongoose = require('mongoose'),
    Door = mongoose.model('Door'),
    validator = require('../../utils/validator');

exports.get = function (req, res) {
  var param = req.query;
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
    limit : param.limit,
    offset : param.offset || 0,
  };
  var condition = {};
  async.parallel({
    count: function (callback) {
      Door.count(condition).exec(callback);
    },
    doors: function (callback) {
      var queryDoor = Door.find(condition)
        .skip(reqParams.offset);
      if (reqParams.limit) {
        queryDoor.limit(reqParams.limit);
      }
      queryDoor.exec(callback);
    }
  }, function (err, results) {
    if (!err) {
      var loginuser = req.user;
      return res.json({
        limit: reqParams.limit || 0,
        offset: reqParams.offset,
        total_count: results.count,
        showNewRegister: loginuser.admin,
        doors: _.map(results.doors, function (door) {
          var actionType;
          if (door.action === 'open') {
            actionType = req.__('解錠');
          } else if (door.action === 'passonly') {
            actionType = req.__('通過のみ');
          } else {
            actionType = req.__('不明');
          }
          return {
            key: door.key,
            name: door.name,
            actionType: actionType,
            showEdit: loginuser.admin,
          };
        })
      });
    } else {
      logger.error(err);
      res.status(500);
      res.send(err);
    }
  });
};
