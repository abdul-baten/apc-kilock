'use strict';

var config = require('../../config/environment'),
  mongoose = require('mongoose'),
  async = require('async'),
  MonthEndClose = mongoose.model('MonthEndClose'),
  User = mongoose.model('User'),
  datetimeutil = require('../../utils/datetimeutil'),
  ObjectId = require('mongoose').Types.ObjectId,
  logger = log4js.getLogger();

/**
 * 月締めがすでに行われているかを判定する
 * @param monthEndClose
 * @returns {boolean}
 */
var isMonthEndClosed = function (monthEndClose) {
  // monthEndCloseのレコードが存在しない場合は、月締めされていないと判定する
  if (!monthEndClose) return false;
  if (monthEndClose.closeStatus !== 'closed') return false;

  return true;
};

/**
 * 月締めが可能な年月であるかを判定する
 * @param reqParams
 * @returns {boolean}
 */
var isMonthEndCloseable = function (reqParams, workdate) {
  if (reqParams.year < workdate.year) return true;
  if ((reqParams.year <= workdate.year) && (reqParams.month < workdate.month)) return true;

  return false;
};

/**
 * 現在ログインしているユーザが、リクエストパラメータ―として受け取った
 * ログインIDの月締め権限を持っているか確認する。
 *
 * @param loginuser セッションから取り出してたログインユーザの情報
 * @param reqParams リクエストパラメータ
 * @returns {boolean} 月締め権限を持っている場合はtrue,それ以外はfalse
 */
var isCloseableUser = function (loginuser, reqParams) {
  if (loginuser.admin) return true;
  if (loginuser.id === reqParams.userId) return true;

  return false;
};

/**
 * バリデーション実施
 * @param req リクエスト
 * @returns {*} エラーがあるときのみオブジェクトを返す。
 */
var validation = function (req) {
  var validator = require('../../utils/validator');
  validator(req).checkQuery('userId').nullable().isInt();
  validator(req).checkQuery('year').nullable().isInt();
  validator(req).checkQuery('month').nullable().isInt();

  return req.validationErrors();
};

/**
 * リクエストとして受け取ったパラメータを変数に格納する。
 * 対応する値が存在しない場合は、それぞれ値を取得し、設定する。
 * @param req リクエスト
 * @param loginuser セッションより取得したログインユーザ情報
 * @param workdate 現在時刻を示すオブジェクト
 * @returns {{userId: Number, year: Number, month: Number}}
 */
var createRequestParams = function (req, loginuser, workdate) {
  return {
    userId: req.query.userId ? parseInt(req.query.userId) : loginuser.id,
    year: req.query.year ? parseInt(req.query.year) : workdate.year,
    month: req.query.month ? parseInt(req.query.month) : workdate.month
  };
};

var responseError = function (res, err) {
  logger.error(err);
  res.status(500);
  res.send(err);
};

/**
 * 月締め対象の月であるか、月締め処理が行われているかの確認を行う。
 *
 * @param req リクエスト
 * @param res レスポンス
 * @returns {*}
 */
exports.get = function (req, res) {
  var validateErrors = validation(req);
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  var workdate = datetimeutil.workdate();
  var loginuser = req.user;

  var reqParams = createRequestParams(req, loginuser, workdate);

  // 管理者か自分のみ閲覧可
  if (!isCloseableUser(loginuser, reqParams)) {
    // 権限エラー
    res.status(403);
    return res.json(validateErrors);
  }

  async.waterfall(
    [
      function (callback) {
        User.findOne({id: reqParams.userId}).exec(callback);
      },
      function (user, callback) {
        if (user) {
          MonthEndClose.findOne({year: reqParams.year, month: reqParams.month, user: user})
            .exec(function (err, monthEndClose) {
              callback(null, user, monthEndClose);
            });
        } else {
          callback('user not found.', user, null);
        }
      }
    ],
    function (err, user, monthEndClose) {
      if (err) return responseError(res, err);

      res.json({
        closed: isMonthEndClosed(monthEndClose),
        canClose: isMonthEndCloseable(reqParams, workdate)
      });
    }
  );
};

exports.post = function (req, res) {
  var validateErrors = validation(req);
  if (validateErrors) {
    // バリデートエラー
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  var workdate = datetimeutil.workdate();
  var loginuser = req.user;

  var reqParams = createRequestParams(req, loginuser, workdate);

  // 管理者か自分のみ閲覧可
  if (!isCloseableUser(loginuser, reqParams)) {
    // 権限エラー
    res.status(403);
    return res.json(validateErrors);
  }

  var insertMonthEndClose = function (res, reqParams, user) {
    // 挿入処理
    var insertMonthEndClose = new MonthEndClose({
      year: reqParams.year,
      month: reqParams.month,
      user: user,
      closeStatus: 'closed',
      updated: datetimeutil.now()
    });
    insertMonthEndClose.save(function (err, doc) {
      if (err) return responseError(res, err);

      if (doc.closeStatus === 'closed') {
        return res.json({ result: true});
      } else {
        return responseError(res, 'insert error');
      }
    });
  };

  var updateMonthEndClose = function (res, reqParams, monthEndClose) {
    MonthEndClose.update(
      {_id: new ObjectId(monthEndClose._id) },
      { $set: { closeStatus: 'closed' } },
      function (err, numberAffected) {
        if (err)  return responseError(res, err);

        if (numberAffected === 1) {
          return res.json({ result: true });
        } else {
          return responseError(res, 'update error');
        }
      }
    );
  };

  async.waterfall(
    [
      function (callback) {
        User.findOne({id: reqParams.userId}).exec(callback);
      },
      function (user, callback) {
        if (user) {
          MonthEndClose.findOne({year: reqParams.year, month: reqParams.month, user: user})
            .exec(function (err, monthEndClose) {
              callback(null, user, monthEndClose);
            });
        } else {
          callback('user not found.', user, null);
        }
      }
    ],
    function (err, user, monthEndClose) {
      if (err) return responseError(res, err);

      if (monthEndClose) {
        updateMonthEndClose(res, reqParams, monthEndClose);
      } else {
        insertMonthEndClose(res, reqParams, user);
      }
    }
  );
};

