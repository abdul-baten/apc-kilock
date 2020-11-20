'use strict';

var config = require('../../config/environment'),
  mongoose = require('mongoose'),
  async = require('async'),
  OvertimeRequest = mongoose.model('OvertimeRequest'),
  User = mongoose.model('User'),
  Project = mongoose.model('Project'),
  ObjectId = require('mongoose').Types.ObjectId,
  logger = log4js.getLogger();

/**
 * バリデーション実施
 * @param req リクエスト
 * @returns {*} エラーがあるときのみオブジェクトを返す。
 */
var validation = function (req) {
  var validator = require('../../utils/validator');
  validator(req).checkQuery('approveUserId').notEmpty().isLength(0, 24);;
  validator(req).checkQuery('year').notEmpty().isInt().len(4, 4);
  validator(req).checkQuery('month').notEmpty().isInt().len(1, 2);
  validator(req).checkQuery('day').notEmpty().isInt().len(1, 2);
  validator(req).checkQuery('reason').notEmpty().len(1, 255);
  validator(req).checkQuery('hour').notEmpty().isInt().len(1, 2);
  validator(req).checkQuery('minute').notEmpty().isInt().len(1, 2);

  return req.validationErrors();
};

/**
 * http methodがputの場合のバリデーション
 * @param req
 * @returns {*}
 */
var validatePutRequest = function (req) {
  var validator = require('../../utils/validator');
  validator(req).checkQuery('requestUserId').notEmpty();
  validator(req).checkQuery('approveStatus').notEmpty().isInt().isIn([1, 2, 3]);

  validator(req).checkQuery('year').notEmpty().isInt().len(4, 4);
  validator(req).checkQuery('month').notEmpty().isInt().len(1, 2);
  validator(req).checkQuery('day').notEmpty().isInt().len(1, 2);

  return req.validationErrors();
};


/**
 * http methodがputの場合のバリデーション
 * @param req
 * @returns {*}
 */
var validateDeleteRequest = function (req) {
  var validator = require('../../utils/validator');
  validator(req).checkQuery('overtimeRequestId').notEmpty();
  validator(req).checkQuery('approveStatus').notEmpty().isInt().isIn([0, 3]);
  return req.validationErrors();
};


/**
 * ログインユーザが確認できる残業申請を取得する。
 * @param req
 * @param res
 */
exports.get = function (req, res) {
  async.waterfall([
      function (callback) {
        User.findOne({id: req.user.id}).exec(callback);
      },
      function (approveUser, callback) {

        if (approveUser) {
          OvertimeRequest.find({approveStatus: 0, approveUser: approveUser}).populate('requestUser').exec(callback);
        } else {
          callback('ユーザが存在しません。', null);
        }
      }
    ],
    function (err, overtimeRequests) {
      if (err) {
        logger.error(err);
        res.status(500);
        return res.json(null);
      }

      if (!overtimeRequests) {
        res.status(200);
        return res.json(null);
      }

      res.status(200);
      return res.json(overtimeRequests);
    });
};

/**
 * 残業申請の情報を作成する
 * @param req
 * @param res
 */
exports.post = function (req, res) {
  var validateErrors = validation(req);

  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  var reqParams = {
    overtimeRequestId: req.query.overtimeRequestId,
    approveProjectId: req.query.approveProjectId,
    approveUserId: req.query.approveUserId,
    year: req.query.year,
    month: req.query.month,
    day: req.query.day,
    hour: req.query.hour,
    minute: req.query.minute,
    reason: req.query.reason
  };

  async.waterfall(
    [
      function (callback) {
        async.parallel({
          requestUser: function (innerCallback) {
            User.findOne({id: req.user.id}).exec(innerCallback);
          },
          approveUser: function (innerCallback) {
            User.findOne({_id: reqParams.approveUserId}).exec(innerCallback);
          }
        }, callback);
      },
      function (results, callback) {

        if (results.requestUser) {
          OvertimeRequest.findOne({
            requestUser: results.requestUser._id,
            year: reqParams.year,
            month: reqParams.month,
            day: reqParams.day
          }).exec(function (err, overtimeRequest) {
            callback(null, results, overtimeRequest);
          });
        } else {
          callback(null, results, null);
        }
      },
      function (results, overtimeRequest, callback) {

        if (reqParams.approveProjectId) {
          Project.findOne({
            _id: reqParams.approveProjectId
          }).exec(function (err, project) {
            callback(null, results, overtimeRequest, project);
          });
        } else {
          callback(null, results, overtimeRequest, null);
        }
      }
    ],
    function (err, results, overtimeRequest, project) {
      if (err) {
        logger.error(err);
        res.status(500);
        return res.json(err);
      }

      if (!results.requestUser) {
        logger.error('申請者となるID ' + req.user.id + 'のユーザが存在しません');
        res.status(500);
        return req.json({});
      }

      if (!results.approveUser) {
        logger.error('承認者となるID ' + reqParams.approveUserId + 'のユーザが存在しません');
        res.status(500);
        return req.json({});
      }

      // 残業申請の重複確認
      if (overtimeRequest && overtimeRequest._id != reqParams.overtimeRequestId) {
        res.status(406);
        return res.json({message: 'すでに同日の残業申請が行われております。'});
      }

      var insertOvertimeRequest;
      if( overtimeRequest ){
        // 再申請時
        insertOvertimeRequest = overtimeRequest;
        insertOvertimeRequest.requestUser = results.requestUser;
        insertOvertimeRequest.approveUser = results.approveUser;
        insertOvertimeRequest.approveProject = project;
        insertOvertimeRequest.approveUserId = reqParams.approveUserId;
        insertOvertimeRequest.hour = reqParams.hour;
        insertOvertimeRequest.minute = reqParams.minute;
        insertOvertimeRequest.reason = reqParams.reason;
        insertOvertimeRequest.approveStatus = 0;
        insertOvertimeRequest.requestTime = Date.now();

      } else {

        insertOvertimeRequest = new OvertimeRequest({
          requestUser: results.requestUser,
          approveUser: results.approveUser,
          approveProject: project,
          year: reqParams.year,
          month: reqParams.month,
          day: reqParams.day,
          hour: reqParams.hour,
          minute: reqParams.minute,
          reason: reqParams.reason,
          remandReason: '',
          approveStatus: 0,
          requestTime: Date.now()
        });
      }

      insertOvertimeRequest.save(function (err, doc) {
        if (err) {
          logger.error(err);
          res.status(500);
          return res.json(err);
        }

        return res.json(doc);
      });

    });
};

/**
 * 残業申請の情報を更新する
 * @param req
 * @param res
 */
exports.put = function (req, res) {

  var validateErrors = validatePutRequest(req);

  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  var reqParams = {
    requestUserId: req.query.requestUserId,
    approveStatus: req.query.approveStatus,
    remandReason: req.query.remandReason,
    year: req.query.year,
    month: req.query.month,
    day: req.query.day
  };

  var setFields = {
    approveStatus: req.query.approveStatus,
  };
  if (req.query.remandReason != null) {
    setFields['remandReason'] = req.query.remandReason;
  }
  OvertimeRequest.update({
    requestUser: new ObjectId(reqParams.requestUserId),
    approveStatus: 0,
    year: reqParams.year,
    month: reqParams.month,
    day: reqParams.day
  }, {
    $set :setFields
  }).exec(function(err, numberAffection){
      if(err) {
        logger.error(err);
        res.status(500);
        return res.json(err);
      }

      if(numberAffection === 1){
        res.status(200);
        return res.json({});
      } else {
        res.status(500);
        return res.json({message: '更新可能なデータが存在しませんでした。'});
      }
    })
};

/**
 * 残業申請の情報を削除する
 * @param req
 * @param res
 */
exports.delete = function (req, res) {

  var validateErrors = validateDeleteRequest(req);

  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  var reqParams = {
    _id: req.query.overtimeRequestId,
    approveStatus: req.query.approveStatus,
  };

  OvertimeRequest.remove( reqParams, function(err, results){
      if(err) {
        logger.error(err);
        res.status(500);
        return res.json(err);
      }
      if(results === 1){
        res.status(200);
        return res.json({});
      } else {
        res.status(500);
        return res.json({message: '更新可能なデータが存在しませんでした。'});
      }
  });
};
