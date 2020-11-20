'use strict';

var config = require('../../config/environment');
var _ = require('lodash'),
    async = require('async'),
    mongoose = require('mongoose'),
    moment = require('moment'),
    logger = log4js.getLogger(),
    User = mongoose.model('User'),
    Project = mongoose.model('Project'),
    AttendanceStatus = mongoose.model('AttendanceStatus'),
    AttendanceStatusLog = mongoose.model('AttendanceStatusLog'),
    ObjectId = require('mongoose').Types.ObjectId,
    datetimeutil = require('../../utils/datetimeutil'),
    validator = require('../../utils/validator'),
    logic = require('../../logics/attendance_logic'),
    tempLogic = require('../../logics/attendance_temp_logic'),
    helper = require('../../logics/helper');

var getResponse = function(req, list, totalCount, allUserPermissions, callback) {
  async.parallel({
    years: function(callback) {
      logic.getUserAttendanceStatusYears(callback);
    },
  }, function(err, results) {
    callback(err, {
      loginuser:              req.user,
      list:                   list,
      totalCount:             totalCount,
      allUserPermissions:     allUserPermissions,
      attendanceStatuses:     config.attendanceStatuses,
      attendanceActions:      config.attendanceActions,
      attendancePermissions:  config.attendancePermissions,
      years:                  results.years,
      months:                 helper.getSelectMonths(),
    });
  });
};

var updateStatusFunc = function(req, res, results, validateErrors) {
  logger.info('[attendanceStatus.updateStatusFunc] start.');
  if(results['attendanceTypeCount'] > 0 || results['dupplicateCount'] > 0) {
    // バリデートエラー
    logger.info('updateStatus validate errors.');
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  // 勤務表ステータス更新
  logger.info('[attendanceStatus.updateStatusFunc] update start.');
  logger.info('[attendanceStatus.updateStatusFunc] req.body:' + req.body);
  logic.updateStatus(
    req.body.user,
    req.body.year,
    req.body.month,
    req.body.attendanceAction,
    req.body.updateUser,
    req.body.comment,
    function(err, updatedStatus) {
      logger.info('[attendanceStatus.updateStatusFunc] update end.');
      if (err) {
        logger.error(err);
        res.status(500);
        res.send(err);
      } else {
        res.status(200);
        res.json({
          attendanceStatus: updatedStatus,
        });
      }
    }
  );
};

exports.get = function (req, res) {
  // Validation
  validator(req).checkQuery('userName').nullable();
  validator(req).checkQuery('project').nullable();
  validator(req).checkQuery('offset').nullable();
  validator(req).checkQuery('limit').nullable();
//  validator(req).checkQuery('attendanceStatuses').nullable().isIn(helper.getAttendanceStatusValues());
  var validateErrors = req.validationErrors();
  if (validateErrors) {
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }

  async.waterfall([
    function(callback) {
      logic.getAllUserPermissions(req.user, callback);
    },
    function(allUserPermissions, callback) {
      logic.getUserAttendanceStatuses(
        req.user,
        req.query.userName,
        req.query.project,
        req.query.attendanceStatuses,
        req.query.startYear,
        req.query.startMonth,
        req.query.endYear,
        req.query.endMonth,
        req.query.offset,
        req.query.limit,
        allUserPermissions,
        function(err, userAttendanceStatuses) {
          callback(err, allUserPermissions, userAttendanceStatuses);
        });
    },
  ], function(err, allUserPermissions, userAttendanceStatuses) {
    if (err) {
      logger.error(err);
      res.status(500);
      res.send(err);

    } else {
      var list = userAttendanceStatuses.list;
      var totalCount = userAttendanceStatuses.totalCount;
      res.status(200);
      getResponse(req, list, totalCount, allUserPermissions, function(err, response) {
        res.json(response); 
      });
    }
  });
};

exports.post = function (req, res) {
  logger.info("[exports.post.attendanceStatus] start");
  validator(req).checkBody('user').isMongoId();
  validator(req).checkBody('year').isInt();
  validator(req).checkBody('month').isInt();
//  validator(req).checkBody('attendanceAction').isIn(helper.getAttendanceActionValues());
  validator(req).checkBody('updateUser').isMongoId();

  var validateErrors = req.validationErrors();
  if (validateErrors) {
    // バリデートエラー
    logger.info('updateStatus validate errors.');
    logger.info({validateErrors: validateErrors});
    res.status(400);
    return res.json(validateErrors);
  }
  
  /*
   * 以下の不具合対応の暫定対応処理呼び出し
   * ※恒久対応完了後、削除予定。
   * ・時間が重複した打刻が登録されてしまう問題
   * ・打刻が空白時に申請ができてしまう問題
  */
  if (req.body.attendanceAction === 0){
    logger.info("[exports.post.attendanceStatus] tempValidator start");
    tempLogic.tempValidator(req.body.attendanceAction, req.body.user, req.body.year, req.body.month, req, res, updateStatusFunc, validateErrors);
    logger.info("[exports.post.attendanceStatus] tempValidator end");
  } else {
    var results = {
      'attendanceTypeCount' : 0,
      'dupplicateCount' : 0
    };
    logger.info("[exports.post.attendanceStatus] updateStatusFunc start");
    updateStatusFunc(req, res, results);
    logger.info("[exports.post.attendanceStatus] updateStatusFunc end");
    logger.info("[exports.post.attendanceStatus] end");
  }
};
