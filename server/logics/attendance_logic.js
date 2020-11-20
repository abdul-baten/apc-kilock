'use strict';

var _ = require('lodash');
var config = require('../config/environment');
var logger = log4js.getLogger();
var datetimeutil = require('../utils/datetimeutil');
var Koyomi = require('koyomi');
var moment = require('moment');
var async = require('async');
var postbox = null;
if (config.mailer) {
  postbox = require('../utils/postbox');
}

var workReport = require('../utils/workReport');
var mongoose = require('mongoose');
var User = mongoose.model('User');
var Personnel = mongoose.model('Personnel');
var Project = mongoose.model('Project');
var Group = mongoose.model('Group');
var AttendanceStatus = mongoose.model('AttendanceStatus');
var AttendanceStatusLog = mongoose.model('AttendanceStatusLog');
var AttendanceType = mongoose.model('AttendanceType');
var AttendanceInCut = mongoose.model('AttendanceInCut');
var AttendancePermission = mongoose.model('AttendancePermission');
var AttendanceLog = mongoose.model('AttendanceLog');
var AttendanceLogEditing = mongoose.model('AttendanceLogEditing');
var Timecard = mongoose.model('Timecard');
var TimecardEditing = mongoose.model('TimecardEditing');
var TravelCost = mongoose.model('TravelCost');
var RestTime = mongoose.model('RestTime');
var RestTimeTemplate = mongoose.model('RestTimeTemplate');

/**
 * 勤務表サマリ情報(共通)の情報返却
 *
 * @param user ユーザオブジェクト
 * @param year
 * @param month
 * @param convA 日数系の変換係数
 * @param confB 時間系の変換係数
 * @returns {*}
 */
var getCommonSummary = function (user, year, month, convA, convB, callback) {
  var summary = {
    employeeCode: user.employeeCode,
    userName: user.name,
    workDays: 0,
    holidayWorkDays: 0,
    specialHolidayDays: 0,
    paidHolidayDays: 0,
    absenceDays: 0,
    remnantPaidHolidayDays: '',
    workHours: 0,
    excludeHours: 0,
    overtimeHours: 0,
    holidayWorkHours: 0,
    nightWorkHours: 0,
    excludeCounts: 0,
    nightWorkCounts: 0,
    travelCost: 0,
    commuteCost: 0,
    over60Hours: 0,
  };

  var conditions = {
    userId: user.id,
    year: year,
    month: month,
  };

  // 出勤
  var workDayTargetTypes = ['出勤', '遅刻', '早退', '休出（振）', '法定休出（振）'];
  // 休出
  var holidayWorkDayTargetTypes = ['休出', '法定休出'];
  // 特別休
  var specialHolidayDayTargetTypes = ['特別休'];
  // 有給
  var paidHolidayTargetTypes = ['有休'];
  // 欠勤
  var absenceDayTargetTypes = ['欠勤'];
  // 遅早回数
  var excludeTargetTypes = ['遅刻', '早退', '夜勤遅刻', '夜勤早退'];
  // 夜勤
  var nightWorkTargetTypes = ['夜勤', '夜勤遅刻', '夜勤早退'];
  // ソート条件
  var options = {
    sort: {
      day: 'asc'
    }
  };

  // ログの取得
  async.parallel({
    attendanceInCut: function (callback) {
      AttendanceInCut.findOne({
        user: user._id,
        year: year,
        month: month,
      }, callback);
    },
    attendanceLogs: function (callback) {
      AttendanceLog.find(conditions, null, options)
        .populate('attendanceType')
        .exec(callback);
    },
    timecards: function (callback) {
      Timecard.find(conditions, null, options)
        .exec(callback);
    },
    attendanceLogsNextAndLastMonth: function (callback) {
      if (conditions.year && conditions.month) {
        var koyomi = new Koyomi();
        var nextMonthDate = koyomi.add(new Date(conditions.year, conditions.month - 1, 1), '1month');
        var lastMonthDate = koyomi.add(new Date(conditions.year, conditions.month - 1, 1), '-1month');

        var nextlastConditions = {
          userId: conditions.userId,
          year: {
            $in: [
              lastMonthDate.getFullYear(),
              nextMonthDate.getFullYear(),
            ]
          },
          month: {
            $in: [
              lastMonthDate.getMonth() + 1,
              nextMonthDate.getMonth() + 1,
            ]
          }
        }
        AttendanceLog.find(nextlastConditions, null, options)
          .populate('attendanceType')
          .exec(callback);
      } else {
        callback();
      }
    },
    travelCostTotals: function (callback) {
      getTravelCostTotals(user._id, conditions.year, conditions.month, callback);
    },
  }, function (err, logresults) {

    var attendanceLogs = logresults.attendanceLogs;
    var allTimecards = logresults.timecards;
    var attendanceLogsNextAndLastMonth = logresults.attendanceLogsNextAndLastMonth;
    var attendanceInCut = logresults.attendanceInCut;
    summary.travelCost = logresults.travelCostTotals.travelTotal;
    summary.commuteCost = logresults.travelCostTotals.commuteTotal;
    var tmpOver60Hours = 0;

    async.each(attendanceLogs, function (logresult, callback) {
      var timecards = allTimecards.filter(function (timecard) {
        if (timecard.day == logresult.day) {
          return true;
        }
      });

      // 勤怠区分が設定されていない場合は集計対象外とします。
      if (!logresult.attendanceType) {
        callback();
        return;
      }

      // 出勤
      if (workDayTargetTypes.indexOf(logresult.attendanceType.name) >= 0) {
        summary.workDays += (1 * convA);
      }
      // 出勤 ※夜勤は倍
      if (nightWorkTargetTypes.indexOf(logresult.attendanceType.name) >= 0) {
        summary.workDays += (2 * convA);
      }

      // 休出
      if (holidayWorkDayTargetTypes.indexOf(logresult.attendanceType.name) >= 0) {
        summary.holidayWorkDays += (1 * convA);
      }

      // 特別休
      if (specialHolidayDayTargetTypes.indexOf(logresult.attendanceType.name) >= 0) {
        summary.specialHolidayDays += (1 * convA);
      }

      // 有給
      if (paidHolidayTargetTypes.indexOf(logresult.attendanceType.name) >= 0) {
        summary.paidHolidayDays += (1 * convA);
      }

      // 欠勤
      if (absenceDayTargetTypes.indexOf(logresult.attendanceType.name) >= 0) {
        summary.absenceDays += (1 * convA);
      }

      // 遅早回数
      if (excludeTargetTypes.indexOf(logresult.attendanceType.name) >= 0) {
        summary.excludeCounts += (1 * convA);
      }

      // 夜勤
      if (nightWorkTargetTypes.indexOf(logresult.attendanceType.name) >= 0) {
        summary.nightWorkCounts += (1 * convA);
      }

      logresult.getWorkMinutesInDay(attendanceInCut, timecards, false, function (err, totalWorkMinutes) {
        // タイムーカードによる集計
        async.each(timecards, function (timecard, callback) {

          // 紐づくattendanceLog, attendanceType を設定
          timecard.attendanceLog = logresult;
          timecard.attendanceType = logresult.attendanceType;
          if (attendanceInCut != null && attendanceInCut.matterId != null) {
            timecard.setIsMainTimecard(timecards, attendanceInCut.matterId);
          } else {
            timecard.setIsMainTimecard(timecards, null);
          }

          // 勤務時間
          summary.workHours += Number((timecard.getWorkMinutes(attendanceInCut) / 60).toFixed(2)) * convB;
          // 遅刻早退時間
          summary.excludeHours += Number((timecard.getExcludeMinutes(totalWorkMinutes) / 60).toFixed(2)) * convB;

          // 休出
          var holidayWorkMinutes = timecard.getHolidayWorkMinutes(attendanceLogs, attendanceLogsNextAndLastMonth, totalWorkMinutes);
          var legalHolidayWorkMinutes = timecard.getLegalHolidayWorkMinutes(attendanceLogs, attendanceLogsNextAndLastMonth, totalWorkMinutes);
          summary.holidayWorkHours += Number(((holidayWorkMinutes + legalHolidayWorkMinutes) / 60).toFixed(2)) * convB;

          // 深夜
          summary.nightWorkHours += Number((timecard.getMidnightOvertimeMinutes() / 60).toFixed(2)) * convB;

          timecard.getOvertimeMinutes(attendanceLogs, attendanceLogsNextAndLastMonth, timecards, function (overtimeMinutes) {
            // 時間外時間
            summary.overtimeHours += Number((overtimeMinutes / 60).toFixed(2)) * convB;
            // 60超
            tmpOver60Hours += (overtimeMinutes + holidayWorkMinutes) / 60;

            callback();
          });
        }, function (err) {
          // 60超
          if (tmpOver60Hours > 60) {
            summary.over60Hours = Number((tmpOver60Hours - 60).toFixed(2)) * convB;
          }
          callback(err);
        });
      });

    }, function (err) {
      callback(err, summary);
    });
  });
};

/**
 * 交通費の合計金額を返却
 * 区分が「通勤」のもの、「通勤」以外のものをそれぞれ返却
 *
 * @param userObjId 対象ユーザObjectId
 * @param year      対象年
 * @param month     対象月
 * @returns {*}
 */
var getTravelCostTotals = function (userObjId, year, month, callback) {
  TravelCost.find({
    user: userObjId,
    year: year,
    month: month,
  }, function (err, travelCosts) {
    var travelTotal = 0; // 区分が「通勤」以外の合計金額
    var commuteTotal = 0; // 区分が「通勤」の合計金額
    travelCosts.forEach(function (travelCost) {
      travelCost.items.forEach(function (item) {
        if (item.purpose == config.travelCostPurposes['通勤']) {
          commuteTotal += item.amount;
        } else {
          travelTotal += item.amount;
        }
      });
    });
    callback(err, {
      travelTotal: travelTotal,
      commuteTotal: commuteTotal,
    });
  });
};


/**
 * 勤務表サマリ情報（管理使用欄）の情報返却
 *
 * @param user ユーザオブジェクト
 * @param year
 * @param month
 * @returns {*}
 */
var getSummary = function (user, year, month, callback) {
  getCommonSummary(user, year, month, 1, 1, function (err, summary) {
    callback(err, summary);
  });
};

/**
 * 勤務表サマリ情報（管理使用欄）の情報返却
 *
 * @param user ユーザオブジェクト
 * @param year
 * @param month
 * @returns {*}
 */
var getSummaryCsv = function (user, year, month, callback) {
  var summaries = [];
  User.find({
    enabled: true,
  }, function (err, users) {
    async.each(users, function (user, callback) {
      getCommonSummary(user, year, month, 10, 100, function (err, summary) {
        summaries.push(summary);
        callback(err);
      });
    }, function (err) {
      callback(err, summaries);
    });
  });
};


/**
 * ユーザの各年月毎の勤務表状態リストを返却
 *
 * @param loginUser          ログインユーザObject
 * @param userName           ユーザ名
 * @param project            プロジェクト(project._id)
 * @param attendanceStatuses 勤務表状態種別リスト
 * @param startYear          開始年
 * @param startMonth         開始月
 * @param endYear            終了年
 * @param endMonth           終了月
 * @param offset             取得データ開始位置
 * @param limit              取得データ件数
 * @param allUserPermissions ログインユーザが保有するユーザ毎の権限
 * @param callback(err, attendanceStatuses)
 */
var getUserAttendanceStatuses = function (
  loginUser,
  userName,
  project,
  attendanceStatuses,
  startYear,
  startMonth,
  endYear,
  endMonth,
  offset,
  limit,
  allUserPermissions,
  callback) {

  // 絞り込み対象UserのObjectIdリスト取得
  async.parallel({
    userObjIdsForName: function (callback) {
      var conditions = {
        enabled: true,
      };
      if (userName != null) {
        conditions['name'] = {
          $regex: '.*' + userName + '.*'
        };
      }
      User.find(conditions, function (err, users) {
        callback(err, users.map(function (user) {
          return user._id;
        }));
      });
    },
    userObjIdsForProject: function (callback) {
      var conditions = {
        valid: true,
      };
      if (project != null && project != 'all') {
        conditions['project'] = project;
      }
      Personnel.find(conditions, function (err, personnels) {
        if (err) {
          callback(err);
          return;
        }
        if (personnels.length > 0) {
          callback(err, personnels.map(function (personnel) {
            return personnel.user;
          }));
        } else {
          callback(err, []);
        }
      });
    },
  }, function (err, data) {
    if (err) {
      logger.error(err);
      callback(err);
      return;
    }

    var conditions = {
      $and: []
    };

    var permitUserObjIds = allUserPermissions.map(function (permission) {
      return permission.userObjId;
    });
    permitUserObjIds.push(loginUser._id);

    // ユーザ名、所属プロジェクト絞込み条件
    var userCondition = {
      $or: [{
        $and: [{
          user: {
            $in: data.userObjIdsForName
          }
        }, ]
      }, ]
    };
    if (project != null) {
      userCondition.$or[0].$and.push({
        user: {
          $in: data.userObjIdsForProject
        }
      });
    }
    if (!loginUser.admin && !loginUser.top) {
      userCondition.$or[0].$and.push({
        user: {
          $in: permitUserObjIds
        }
      });
    }
    conditions.$and.push(userCondition);

    // 承認状態
    var statusCondition;
    if (attendanceStatuses == null) {
      statusCondition = {
        status: {
          $in: []
        }
      };
    } else {
      if (Array.isArray(attendanceStatuses)) {
        statusCondition = {
          status: {
            $in: attendanceStatuses
          }
        };
      } else {
        statusCondition = {
          status: attendanceStatuses
        };
      }
    }
    conditions.$and.push(statusCondition);

    // 年月 開始
    var startCondition = {};
    if (startYear == null) {
      if (startMonth != null) {
        startCondition['month'] = {
          $gte: startMonth
        };
      }
    } else {
      if (startMonth == null) {
        startCondition['year'] = {
          $gte: startYear
        };
      } else {
        startCondition['$or'] = [{
            $and: [{
              year: {
                $gt: startYear
              }
            }, ]
          },
          {
            $and: [{
                year: startYear
              },
              {
                month: {
                  $gte: startMonth
                }
              },
            ]
          },
        ];
      }
    }
    if (!_.isEmpty(startCondition)) {
      conditions.$and.push(startCondition);
    }

    // 年月 終了
    var endCondition = {};
    if (endYear == null) {
      if (endMonth != null) {
        endCondition['month'] = {
          $lte: endMonth
        };
      }
    } else {
      if (endMonth == null) {
        endCondition['year'] = {
          $lte: endYear
        };
      } else {
        endCondition['$or'] = [{
            $and: [{
              year: {
                $lt: endYear
              }
            }, ]
          },
          {
            $and: [{
                year: endYear
              },
              {
                month: {
                  $lte: endMonth
                }
              },
            ]
          },
        ];
      }
    }
    if (!_.isEmpty(endCondition)) {
      conditions.$and.push(endCondition);
    }

    var options = {
      sort: {
        year: -1,
        month: -1,
      },
    };
    if (offset != null) {
      options['skip'] = offset;
    }
    if (limit != null) {
      options['limit'] = limit;
    }

    async.parallel({
      list: function (callback) {
        AttendanceStatus.find(conditions, {}, options)
          .populate('user')
          .exec(callback);
      },
      totalCount: function (callback) {
        AttendanceStatus.count(conditions).exec(callback);
      },
    }, function (err, results) {
      callback(err, {
        list: results.list,
        totalCount: results.totalCount,
      });
    });
  });
};

/**
 * 打刻可能かどうかをコールバック
 *
 * 既に勤務表が申請以降の状態に進んでいる場合は打刻不可
 *
 * @param userObjectId  ユーザObjectId
 * @param year          開始年
 * @param month         開始月
 * @param callback(err, attendanceStatuses)
 */
var stampable = function (userObjectId, year, month, callback) {
  var conditions = {
    user: userObjectId,
    year: year,
    month: month
  };
  AttendanceStatus.findOne(conditions, function (err, attendanceStatus) {
    if (attendanceStatus == null) {
      callback(err, true);
    } else {
      callback(err, attendanceStatus.status == config.attendanceStatuses['no_application']);
    }
  });
};


/**
 * 登録されている勤務表状態の年リストを返却
 *
 */
var getUserAttendanceStatusYears = function (callback) {
  AttendanceStatus.find({}, function (err, statuses) {
    var years = _.uniq(statuses.map(function (status) {
      return status.year;
    }));
    callback(err, years);
  });
};

/**
 * 勤務表状態更新ログを返却
 *
 * @param loginUser               ログインユーザObject
 * @param targetUserName          対象ユーザ名
 * @param targetUserProjectObjId  対象ユーザプロジェクトObjectId
 * @param updateUserName          更新ユーザ名
 * @param updateUserProjectObjId  更新ユーザプロジェクトObjectId
 * @param startDate               絞込み開始更新日付
 * @param startEnd                絞込み終了更新日付
 * @param offset                  取得データ開始位置
 * @param limit                   取得データ件数
 * @param allUserPermissions      ログインユーザが保有するユーザ毎の権限
 * @param callback(err, attendanceStatusLogs)
 */
var getAttendanceStatusLogs = function (
  loginUser,
  targetUserName,
  targetProjectObjId,
  updateUserName,
  updateProjectObjId,
  startDate,
  endDate,
  offset,
  limit,
  allUserPermissions,
  callback) {

  // 絞り込み対象UserのObjectIdリスト取得
  async.parallel({
    attendanceStatusObjIds: function (callback) {
      getUserObjIds(targetUserName, targetProjectObjId, function (err, userObjIds) {
        var permitUserObjIds = allUserPermissions.map(function (permission) {
          return permission.userObjId;
        });
        permitUserObjIds.push(loginUser._id);
        var conditions = {
          $or: [{
            $and: [{
              user: {
                $in: userObjIds
              }
            }, ]
          }, ]
        };
        if (!loginUser.admin && !loginUser.top) {
          conditions.$or[0].$and.push({
            user: {
              $in: permitUserObjIds
            }
          });
        }
        AttendanceStatus.find(conditions, function (err, attendanceStatuses) {
          callback(err, attendanceStatuses.map(function (attendanceStatus) {
            return attendanceStatus._id;
          }));
        });
      });
    },
    updateUserObjIds: function (callback) {
      getUserObjIds(updateUserName, updateProjectObjId, callback);
    },
  }, function (err, data) {
    var conditions = {
      attendanceStatus: {
        $in: data.attendanceStatusObjIds
      },
      updateUser: {
        $in: data.updateUserObjIds
      },
    };

    var updatedConditions = {};
    if (startDate != null) {
      updatedConditions.$gte = new Date(startDate);
    }
    if (endDate != null) {
      var date = new Date(endDate);
      updatedConditions.$lt = new Date(date.getTime() + 86400000);
    }
    if (Object.keys(updatedConditions).length > 0) {
      conditions['updated'] = updatedConditions;
    }

    var options = {
      sort: {
        updated: -1,
      },
    };
    if (offset != null) {
      options['skip'] = offset;
    }
    if (limit != null) {
      options['limit'] = limit;
    }

    async.parallel({
      list: function (callback) {
        AttendanceStatusLog.find(conditions, {}, options)
          .populate('attendanceStatus')
          .populate('updateUser')
          .exec(function (err, attendanceStatusLogs) {
            AttendanceStatusLog.populate(attendanceStatusLogs, {
              path: 'attendanceStatus.user',
              model: User,
            }, callback)
          });
      },
      totalCount: function (callback) {
        AttendanceStatusLog.count(conditions).exec(callback);
      },
    }, function (err, results) {
      callback(err, {
        list: results.list,
        totalCount: results.totalCount,
      });
    });
  });
};

/**
 * 絞込み条件に応じたUserObjectIdリストを返却
 *
 * @param userName      対象ユーザ名
 * @param projectObjId  対象ユーザプロジェクトObjectId
 * @param callback(err, userObjIds)
 */
var getUserObjIds = function (userName, projectObjId, callback) {
  async.waterfall([
    function (callback) {
      var conditions = {
        enabled: true,
      };
      if (userName != null) {
        conditions['name'] = {
          $regex: '.*' + userName + '.*'
        };
      }
      User.find(conditions, function (err, users) {
        callback(err, users.map(function (user) {
          return user._id;
        }));
      });
    },
    function (userObjIds, callback) {
      if (projectObjId == null || projectObjId == 'all') {
        callback(null, userObjIds);
        return;
      }

      var conditions = {
        valid: true,
        user: {
          $in: userObjIds
        },
        project: projectObjId,
      };
      Personnel.find(conditions, function (err, personnels) {
        callback(err, personnels.map(function (personnel) {
          return personnel.user;
        }));
      });
    },
  ], callback);
};

/**
 * 勤務表状態更新
 *
 * @param user             対象ユーザ(user._id)
 * @param year             対象年
 * @param month            対象月
 * @param attendanceAction 勤務表更新アクション
 * @param updateUser       更新実行ユーザ(user._id)
 * @param comment          コメント
 * @param callback(err, updatedStatus)
 * @returns {*}
 */
var updateStatus = function (user, year, month, attendanceAction, updateUser, comment, callback) {
  async.parallel({
    attendanceStatus: function (callback) {
      var conditions = {
        user: user,
        year: year,
        month: month,
      };
      AttendanceStatus.findOne(conditions, callback);
    },
    permissionUsers: function (callback) {
      Personnel.findOne({
        user: user,
        valid: true,
      }, function (err, personnel) {
        var project = null;
        if (personnel != null) {
          project = personnel.project;
        }
        getPermissionUsers(project, callback);
      });
    },
  }, function (err, results) {
    if (err) {
      callback(err);
      return;
    }

    var attendanceStatus = results.attendanceStatus;

    // AttendanceStatusがない場合は新規作成
    if (attendanceStatus == null) {
      attendanceStatus = new AttendanceStatus;
      attendanceStatus.user = user;
      attendanceStatus.year = year;
      attendanceStatus.month = month;
      attendanceStatus.updateUser = updateUser;
      attendanceStatus.status = config.attendanceStatuses['no_application'];
    }

    // 更新ステータス決定
    var beforeStatus = attendanceStatus.status;

    async.waterfall([
      function (callback) {
        switch (attendanceAction) {
          case config.attendanceActions['applicate']:
            if (attendanceStatus.status == config.attendanceStatuses['no_application'] ||
              attendanceStatus.status == config.attendanceStatuses['denegated']) {
              attendanceStatus.status = config.attendanceStatuses['applicating'];
            }
            if (user == updateUser) {
              sendApplicateMail(user, updateUser, results.permissionUsers, year, month, callback);
            } else {
              sendApplicateMailFromPermitUser(user, updateUser, results.permissionUsers, year, month, callback);
            }
            break;
          case config.attendanceActions['accept_middle']:
            attendanceStatus.status = config.attendanceStatuses['accepted_middle'];
            attendanceStatus.middleUpdatedUser = updateUser;
            callback();
            break;
          case config.attendanceActions['denegate_middle']:
            attendanceStatus.status = config.attendanceStatuses['denegated'];
            attendanceStatus.middleUpdatedUser = updateUser;
            callback();
            break;
          case config.attendanceActions['accept_better']:
            attendanceStatus.status = config.attendanceStatuses['accepted_better'];
            attendanceStatus.betterUpdatedUser = updateUser;
            callback();
            break;
          case config.attendanceActions['denegate_better']:
            attendanceStatus.status = config.attendanceStatuses['denegated'];
            attendanceStatus.betterUpdatedUser = updateUser;
            callback();
            break;
          case config.attendanceActions['accept_top']:
            attendanceStatus.status = config.attendanceStatuses['accepted_top'];
            attendanceStatus.topUpdatedUser = updateUser;
            callback();
            break;
          case config.attendanceActions['denegate_top']:
            attendanceStatus.status = config.attendanceStatuses['applicating'];
            attendanceStatus.topUpdatedUser = updateUser;
            callback();
            break;
          case config.attendanceActions['revert_top']:
            attendanceStatus.status = config.attendanceStatuses['accepted_better'];
            attendanceStatus.topUpdatedUser = updateUser;
            callback();
            break;
        }
      },
    ], function (err) {
      // ステータス更新なし
      if (beforeStatus == attendanceStatus.status) {
        callback(null, attendanceStatus.status);
        return;
      }

      // AttendanceStatus更新
      attendanceStatus.save(function (err, attendanceStatus) {
        if (err) {
          callback(err);
          return;
        }
        // AttendacneStatusLog作成
        var attendanceStatusLog = new AttendanceStatusLog;
        attendanceStatusLog.attendanceStatus = attendanceStatus._id;
        attendanceStatusLog.action = attendanceAction;
        attendanceStatusLog.updateUser = updateUser;
        attendanceStatusLog.updated = Date.now();
        attendanceStatusLog.save(function (err, attendanceStatusLog) {
          if (err) {
            callback(err);
            return;
          }

          // 承認時、ユーザへメール通知
          sendNotificationMail(user, updateUser, year, month, attendanceAction, attendanceStatus, results.permissionUsers, comment, function (err) {
            callback(err, attendanceStatus.status);
          });
        });
      });
    });
  });
};

/**
 * プロジェクトに対する各権限を持つユーザーObjectIdリスト返却
 *
 * @param projectObjId プロジェクトObjectId
 * @param callback(err, {
 *   middle: 中間承認権限を持つユーザーObjectIdリスト
 *   better: 上長承認権限を持つユーザーObjectIdリスト
 *   top:    総務承認権限を持つユーザーObjectIdリスト
 *   admin:  管理権限持つユーザーObjectIdリスト
 * })
 */
var getPermissionUsers = function (projectObjId, callback) {
  async.parallel({
    group: function (callback) {
      Project.findOne({
        _id: projectObjId
      }, function (err, project) {
        if (project == null) {
          callback(err);
          return;
        }
        Group.findOne({
          _id: project.group
        }, function (err, group) {
          callback(err, group);
        });
      });
    },
  }, function (err, results) {
    async.parallel({
      middle: function (callback) {
        AttendancePermission.find({
          project: projectObjId,
          permission: config.attendancePermissions.middle,
        }, function (err, attendancePermissions) {
          callback(err, attendancePermissions.map(function (attendancePermission) {
            return attendancePermission.user;
          }));
        });
      },
      better: function (callback) {
        AttendancePermission.find({
          project: projectObjId,
          permission: config.attendancePermissions.better,
        }, function (err, attendancePermissions) {
          callback(err, attendancePermissions.map(function (attendancePermission) {
            return attendancePermission.user;
          }));
        });
      },
      top: function (callback) {
        User.find({
          enabled: true
        }, function (err, users) {
          callback(err, users.map(function (user) {
            if (user.top) {
              return user._id;
            }
          }));
        });
      },
      admin: function (callback) {
        if (results.group == null) {
          callback(err, []);
          return;
        }
        User.find({
          manageGroups: results.group.id,
        }, function (err, users) {
          callback(err, users.map(function (user) {
            return user._id;
          }));
        });
      },
    }, function (err, results) {
      callback(err, {
        middle: results.middle,
        better: results.better,
        top: results.top,
        admin: results.admin,
      });
    });
  });
};


/**
 * 各勤務表状態のプロジェクトObjectIdリストを返却
 *
 * @param userObjId ユーザObjectId
 * @param callback(err, {
 *   middle: 中間承認権限を持つプロジェクトObjectIdリスト
 *   better: 上長承認権限を持つプロジェクトObjectIdリスト
 *   admin:  管理権限持つプロジェクトObjectIdリスト
 * })
 */
var getPermissionProjects = function (userObjId, callback) {
  async.parallel({
    manageGroups: function (callback) {
      User.findOne({
        _id: userObjId
      }, function (err, user) {
        if (user == null || user.manageGroups == null || user.manageGroups.length <= 0) {
          callback(err, []);
        } else {
          Group.find({
            id: {
              $in: user.manageGroups
            }
          }, callback);
        }
      });
    },
  }, function (err, results) {
    async.parallel({
      middle: function (callback) {
        AttendancePermission.find({
          user: userObjId,
          permission: config.attendancePermissions.middle,
        }, function (err, attendancePermissions) {
          callback(err, attendancePermissions.map(function (attendancePermission) {
            return attendancePermission.project;
          }));
        });
      },
      better: function (callback) {
        AttendancePermission.find({
          user: userObjId,
          permission: config.attendancePermissions.better,
        }, function (err, attendancePermissions) {
          callback(err, attendancePermissions.map(function (attendancePermission) {
            return attendancePermission.project;
          }));
        });
      },
      admin: function (callback) {
        var groupObjIds = results.manageGroups.map(function (group) {
          return group._id;
        });
        Project.find({
          group: {
            $in: groupObjIds
          }
        }, function (err, projects) {
          callback(err, projects.map(function (project) {
            return project._id;
          }));
        });
      },
    }, function (err, results) {
      callback(err, {
        middle: results.middle,
        better: results.better,
        admin: results.admin,
      });
    });
  });
};

/**
 * 各勤務表状態のグループObjectIdリストを返却
 *
 * @param userObjId ユーザObjectId
 * @param callback(err, {
 *   middle: 中間承認権限を持つグループObjectIdリスト
 *   better: 上長承認権限を持つグループObjectIdリスト
 *   admin:  管理権限持つグループbjectIdリスト
 * })
 */
var getPermissionGroups = function (userObjId, callback) {
  var getGroupIdsFromProject = function (projectObjIds, callback) {
    Project.find({
        _id: {
          $in: projectObjIds
        }
      })
      .populate('group')
      .exec(function (err, projects) {
        if (projects.length > 0) {
          var groupIds = projects.map(function (project) {
            if (project.group && project.group.id) {
              return project.group.id;
            }
          });
          groupIds = groupIds.filter(function (id) {
            return id != null;
          });
          callback(err, groupIds);
        } else {
          callback(err, []);
        }
      });
  };

  this.getPermissionProjects(userObjId, function (err, perms) {
    if (err) {
      callback(err);
      return;
    }
    async.parallel({
      middle: function (callback) {
        getGroupIdsFromProject(perms.middle, callback);
      },
      better: function (callback) {
        getGroupIdsFromProject(perms.better, callback);
      },
    }, callback);
  });
};

/**
 * ユーザーが対象ユーザーに対して持つ勤務表承認権限を返却
 *
 * @param userObjId       ユーザObjectId
 * @param targetUserObjId 対象ユーザObjectId
 * @param callback(err, {
 *   middle: 中間承認権限(true/false),
 *   better: 上長承認権限(true/false),
 *   top:    総務確定権限(true/false),
 *   admin:  管理権限(true/false),
 * })
 */
var getUserPermissions = function (userObjId, targetUserObjId, callback) {
  var permissions = {
    middle: false,
    better: false,
    top: false,
    admin: false,
  };

  Personnel.findOne({
    user: targetUserObjId,
    valid: true,
  }).populate('project').exec(function (err, personnel) {
    if (personnel == null || personnel.project == null || personnel.project.valid == false) {
      callback(null, permissions);
      return;
    }
    getProjectPermissions(userObjId, personnel.project._id, callback);
  });
};

/**
 * ユーザーが対象ユーザーに対して持つ勤務表承認権限を返却
 *
 * @param user            ユーザObject
 * @param callback(err, [{
 * {
 *   userObjId: ユーザObjectId,
 *   permissions: [保有承認権限],
 *   isPjAdmin: PJ管理権限
 * },...])
 */
var getAllUserPermissions = function (user, callback) {

  async.parallel({
    attendancePermissions: function (callback) {
      AttendancePermission.find({
          user: user._id,
        }).populate('project')
        .exec(function (err, permissions) {
          if (err) {
            callback(err);
            return;
          }
          if (permissions.length <= 0) {
            callback(err, []);
            return;
          }
          Project.populate(permissions, {
            path: 'project.group',
            model: Group,
          }, callback);
        });
    },
    manageUsers: function (callback) {
      if (!user.manageGroups || user.manageGroups.length <= 0) {
        callback(null, []);
        return;
      }
      Group.find({
        id: {
          $in: user.manageGroups
        },
      }).exec(function (err, groups) {
        var userObjIds = [];
        groups.forEach(function (group) {
          userObjIds = userObjIds.concat(group.users);
        })
        callback(err, userObjIds);
      });
    },
  }, function (err, data) {
    if (err) {
      logger.error(err);
      callback(err);
      return;
    }

    var userPermissions = [];
    data.attendancePermissions.forEach(function (permission) {
      if (!permission.project ||
        !permission.project.group ||
        permission.project.group.users.length <= 0) {
        return;
      }
      permission.project.group.users.forEach(function (userObjId) {
        var userPermission = _.find(userPermissions, {
          'userObjId': userObjId
        });
        if (userPermission) {
          userPermission.permissions.push(permission.permission);
        } else {
          userPermissions.push({
            userObjId: userObjId,
            permissions: [permission.permission],
          });
        }
      });
    });

    data.manageUsers.forEach(function (userObjId) {
      var userPermission = _.find(userPermissions, {
        'userObjId': userObjId
      });
      if (userPermission) {
        userPermission.isPjManager = true;
      } else {
        userPermissions.push({
          userObjId: userObjId,
          permissions: [],
          isPjManager: true,
        });
      }
    });

    callback(null, userPermissions);
  });
};

/**
 * ユーザーが対象プロジェクトに対して持つ勤務表承認権限を返却
 *
 * @param userObjId    ユーザObjectId
 * @param projectObjId 対象プロジェクトObjectId
 * @param callback(err, {
 *   middle: 中間承認権限(true/false),
 *   better: 上長承認権限(true/false),
 *   top:    総務確定権限(true/false),
 *   admin:  管理権限(true/false),
 * })
 */
var getProjectPermissions = function (userObjId, projectObjId, callback) {
  var permissions = {
    middle: false,
    better: false,
    top: false,
    admin: false,
  };

  async.parallel({
    user: function (callback) {
      User.findOne({
        _id: userObjId
      }, function (err, user) {
        if (user == null) {
          callback('user not found. _id: ' + userObjId);
        } else {
          callback(err, user);
        }
      });
    },
    group: function (callback) {
      Project.findOne({
        _id: projectObjId
      }, function (err, project) {
        if (project == null) {
          callback('project not found. _id: ' + projectObjId);
        }
        Group.findOne({
          _id: project.group
        }, function (err, group) {
          if (group == null) {
            callback('group not found. _id: ' + project.group);
          } else {
            callback(err, group);
          }
        });
      });
    },
    attendancePermissions: function (callback) {
      AttendancePermission.find({
        user: userObjId,
        project: projectObjId,
      }, callback);
    },
  }, function (err, results) {
    if (err) {
      callback(err);
      return;
    }

    // プロジェクト管理権限を取得
    if (results.user.manageGroups != null && results.user.manageGroups.length > 0) {
      results.user.manageGroups.forEach(function (groupId) {
        if (groupId == results.group.id) {
          permissions.admin = true;
        }
      });
    }

    // 勤務表承認権限を取得
    if (results.attendancePermissions.length <= 0) {
      callback(null, permissions);
    } else {
      async.each(results.attendancePermissions, function (item, callback) {
        if (item.permission == config.attendancePermissions.middle) {
          permissions.middle = true;
        }
        if (item.permission == config.attendancePermissions.better) {
          permissions.better = true;
        }
        permissions.top = results.user.top;

        callback();
      }, function (err, results) {
        callback(err, permissions);
      });
    }
  });
};

/**
 * 勤務表状態更新権限更新処理
 *
 * @param user           ユーザ(user._id)
 * @param middleProjects 中間承認プロジェクト(project._id リスト)
 * @param betterProjects 上長承認プロジェクト(project._id リスト)
 * @param callback(err)
 */
var updatePermissions = function (user, middleProjects, betterProjects, callback) {
  AttendancePermission.remove({
    user: user,
  }, function (err) {
    async.waterfall([
      function (callback) {
        async.each(middleProjects, function (project, callback) {
          var permission = new AttendancePermission;
          permission.user = user;
          permission.project = project;
          permission.permission = config.attendancePermissions.middle;
          permission.save(callback);
        }, callback);
      },
      function (callback) {
        async.each(betterProjects, function (project, callback) {
          var permission = new AttendancePermission;
          permission.user = user;
          permission.project = project;
          permission.permission = config.attendancePermissions.better;
          permission.save(callback);
        }, callback);
      },
    ], function (err, results) {
      callback();
    });
  });
};

/**
 * 以下のUser情報を返却する
 *  ・自身の所属PJ
 *  ・中間承認、上長承認、PJ管理のいずれかの権限を持つPJの所属User
 *  ・システム管理、総務確定のいずかの権限を持つ場合は全PJ所属Userを返却
 *
 * @param User loginUser ログインユーザObject
 * @param integer projectId プロジェクトID
 * @param boolean all 全ユーザ返却フラグ
 * @param function callback
 */
var getApprovalUsers = function (loginUser, projectId, all, callback) {
  getApprovalProjects(loginUser, all, function (err, projects) {
    if (err) {
      logger.error(err);
      callback(err);
      return;
    }
    var projectObjIds = projects.map(function (project) {
      return project._id;
    });
    Personnel.find({
      project: {
        $in: projectObjIds
      },
      valid: true,
    }, function (err, personnels) {
      if (err) {
        logger.error(err);
        callback(err);
        return;
      }
      var userObjIds = personnels.map(function (personnel) {
        return personnel.user;
      });
      User.find({
        _id: {
          $in: userObjIds
        },
        enabled: true,
      }).sort({
        displayOrder: 1
      }).exec(callback);
    });
  });
};

/**
 * 以下のPJ情報を返却する
 *  ・自身の所属PJ
 *  ・中間承認、上長承認、PJ管理のいずれかの権限を持つPJ
 *  ・システム管理、総務確定のいずかの権限を持つ場合は全PJを返却
 *
 * @param User loginUser ログインユーザObject
 * @param boolean all 全PJ返却フラグ
 * @param function callback
 */
var getApprovalProjects = function (loginUser, all, callback) {
  async.waterfall([
    // 対象Group取得(一般ユーザの場合、所属groupのみ)
    function (callback) {
      var conditions = {
        enabled: true,
      };
      if (!all && !loginUser.admin && !loginUser.top) {
        conditions.$or = [{
          users: loginUser._id
        }, ];
      }
      Group.find(conditions, function (err, groups) {
        if (err) {
          logger.error(err);
          callback(err);
          return;
        }
        var groupObjIds = groups.map(function (group) {
          return group._id;
        });
        callback(err, groupObjIds);
      });
    },
    // 対象Project取得
    // 自身の所属Projectと承認/管理権限をもつProject
    function (targetGroupObjIds, callback) {
      getPermissionProjects(loginUser._id, function (err, permissions) {
        if (err) {
          logger.error(err);
          callback(err);
          return;
        }
        Project.find({
            $or: [{
                _id: {
                  $in: permissions.middle
                }
              },
              {
                _id: {
                  $in: permissions.better
                }
              },
              {
                _id: {
                  $in: permissions.admin
                }
              },
              {
                group: {
                  $in: targetGroupObjIds
                }
              },
            ],
            valid: true,
          }).populate('group')
          .sort({
            displayOrder: 1,
            name: 1
          })
          .exec(callback);
      });
    },
  ], callback);
}

/**
 * 以下のUser情報を返却する
 *  ・自身の所属PJに対して中間承認、上長承認、PJ管理のいずれかの権限を持つUser
 *  ・システム管理、総務確定のいずかの権限を持つUser
 *
 * @param User loginUser ログインユーザObject
 * @param mongoId projectObjId プロジェクトObjectID
 * @param function callback
 */
var getApprovalToSelfUsers = function (loginUser, projectObjId, callback) {
  async.parallel({
    approveUserObjIds: function (callback) {
      async.waterfall([
        // 所属PJを取得
        function (callback) {
          Personnel.findOne({
              user: loginUser._id,
              valid: true,
            })
            .populate('project')
            .exec(function (err, personnel) {
              if (err) {
                callback(err);
                return;
              }
              if (personnel == null) {
                callback('personnel not found. _id: ' + loginUser._id);
                return;
              }
              if (personnel.project == null) {
                callback('personnel.project is null. _id: ' + loginUser._id);
                return;
              }
              callback(err, personnel.project);
            });
        },
        // 所属PJに対して権限を持つUserを取得
        function (project, callback) {
          AttendancePermission.find({
            project: project._id,
          }, function (err, attendancePermissions) {
            if (err) {
              logger.error(err);
              callback(err);
              return;
            }
            var approveUserObjIds = attendancePermissions.map(function (item) {
              return item.user;
            });
            callback(err, approveUserObjIds);
          });
        },
      ], callback);
    },
    selectProjectUserObjIds: function (callback) {
      if (projectObjId == null) {
        callback();
        return;
      }

      Project.findOne({
        _id: projectObjId,
        valid: true,
      }, function (err, project) {
        if (err) {
          logger.error(err);
          callback(err);
          return;
        }
        if (project == null) {
          callback();
          return;
        }
        Personnel.find({
          project: project._id,
          valid: true,
        }, function (err, personnels) {
          if (err) {
            logger.error(err);
            callback(err);
            return;
          }
          var selectProjectUserObjIds = personnels.map(function (personnel) {
            return personnel.user;
          });
          callback(err, selectProjectUserObjIds);
        });
      });
    },
  }, function (err, data) {
    if (err) {
      logger.error(err);
      callback(err);
      return;
    }
    var conditions = {
      enabled: true,
      $or: [{
          top: true
        },
        {
          _id: {
            $in: data.approveUserObjIds
          }
        },
      ],
    };
    if (data.selectProjectUserObjIds) {
      _.assign(conditions, {
        _id: {
          $in: data.selectProjectUserObjIds
        },
      });
    }
    User.find(conditions).populate('personnel').exec(callback);
  });
};

/**
 * 以下のPJ情報を返却する
 *  ・自身の所属PJに対して中間承認、上長承認、PJ管理のいずれかの権限を持つUserの所属PJ
 *  ・システム管理、総務確定のいずかの権限を持つUserの所属PJ
 *
 * @param User loginUser ログインユーザObject
 * @param function callback
 */
var getApprovalToSelfProjects = function (loginUser, callback) {
  getApprovalToSelfUsers(loginUser, null, function (err, users) {
    if (err) {
      logger.error(err);
      callback(err);
      return;
    }
    var userObjIds = users.map(function (user) {
      return user._id;
    });
    Personnel.find({
      user: {
        $in: userObjIds
      },
      valid: true,
    }, function (err, personnels) {
      if (err) {
        logger.error(err);
        callback(err);
        return;
      }
      var projectObjIds = personnels.map(function (personnel) {
        if (personnel.project) {
          return personnel.project;
        }
      });
      Project.find({
        _id: {
          $in: projectObjIds
        }
      }).populate('group').exec(callback);
    });
  });
};

/**
 * 承認・否認時のメール送信
 *
 * @param targetUser 勤務表ユーザ(user._id)
 * @param updateUser 操作ユーザ(user._id)
 * @param year       対象年
 * @param month      対象月
 * @param attendanceActionn 勤務表更新アクション種別
 * @param attendanceStatus 勤務表ステータスオブジェクト
 * @param permissionUsers 勤務表ユーザに対して権限をもつユーザリスト
 * @param comment    コメント
 * @param callback(err)
 */
var sendNotificationMail = function (targetUser, updateUser, year, month, attendanceAction, attendanceStatus, permissionUsers, comment, callback) {

  // 自分自身の場合は通知しない
  if (targetUser == updateUser) {
    callback();
    return;
  }

  async.parallel({
    targetUser: function (callback) {
      User.findOne({
        _id: targetUser
      }, callback);
    },
    updateUser: function (callback) {
      User.findOne({
        _id: updateUser
      }, callback);
    },
    latestAcceptedLog: function (callback) {
      AttendanceStatusLog.find({
        attendanceStatus: attendanceStatus._id,
        action: {
          $in: [
            config.attendanceActions['accept_middle'],
            config.attendanceActions['accept_better'],
          ]
        }
      }).sort({
        updated: -1
      }).limit(1).exec(function (err, logs) {
        if (logs != null && logs.length > 0) {
          callback(err, logs[0]);
        } else {
          callback(err, null)
        }
      });
    },
  }, function (err, results) {

    var userObjIds = [];

    var denegateSubject = '[KiLock] 勤務表否認通知';
    var denegateBody = results.targetUser.name + 'さんの' + year + '年' + month + '月 の勤務表が' + results.updateUser.name + 'さんによって否認されました。\n';
    denegateBody += 'ご確認・修正をお願いします。\n';
    denegateBody += comment

    if (attendanceAction == config.attendanceActions['accept_middle']) {
      var subject = '[KiLock] 勤務表中間承認通知';
      var body = results.targetUser.name + 'さんの' + year + '年' + month + '月 の勤務表が中間承認されました。\n';

      // 上長権限ユーザにメール送信
      if (permissionUsers.better.length > 0) {
        permissionUsers.better.forEach(function (userObjId) {
          userObjIds.push(userObjId);
        });
      }

    } else if (attendanceAction == config.attendanceActions['accept_better']) {
      // 上長承認時はメール送信しない
      logger.info('no send mail accept_better');
      callback();
      return;

    } else if (attendanceAction == config.attendanceActions['accept_top']) {
      // 総務確定時はメール送信しない
      logger.info('no send mail accept_top');
      callback();
      return;

    } else if (attendanceAction == config.attendanceActions['denegate_middle']) {
      var subject = denegateSubject;
      var body = denegateBody;
      userObjIds.push(results.targetUser._id);

    } else if (attendanceAction == config.attendanceActions['denegate_better']) {
      var subject = denegateSubject;
      var body = denegateBody;
      if (!results.latestAcceptedLog || results.latestAcceptedLog.action == config.attendanceActions['accept_better']) {
        // 中間承認権限ユーザが不在なので勤務表ユーザ宛にメール

        // 「上長承認済」より後の状態から「総務否認」された後で「上長否認」された場合は、
        // ステータスは一度「申請中」に戻っているため、
        // 既に行われた中間承認および上長承認もリセット扱いとなり、本ルートを通り勤務表ユーザへのメール送信となる。
        userObjIds.push(results.targetUser._id);

      } else if (results.latestAcceptedLog.action == config.attendanceActions['accept_middle']) {
        // 中間承認実施ユーザ宛にメール
        userObjIds.push(results.latestAcceptedLog.updateUser);
      }

    } else if (attendanceAction == config.attendanceActions['denegate_top']) {
      var subject = denegateSubject;
      var body = denegateBody;

      // 上長承認実施ユーザ宛にメール
      userObjIds.push(results.latestAcceptedLog.updateUser);

    } else {
      callback(err);
      return;
    }

    // メール送信
    if (userObjIds.length <= 0) {
      callback();
      return;
    }

    User.find({
      _id: {
        $in: userObjIds
      }
    }, function (err, users) {
      if (users == null) {
        callback();
        return;
      }

      // メール送信用Redisに登録
      async.eachSeries(users, function (user, callback) {
        var mail = user.mail;
        postbox.postMailGeneral(mail, subject, body, '', [], callback);
      }, callback);
    });

  });
};

/**
 * ユーザ自身による入力・修正完了時のメール送信
 *
 * @param targetUser       勤務表ユーザ(user._id)
 * @param updateUser       操作ユーザ(user._id)
 * @param permissionUsers  勤務表承認ユーザリスト
 * @param year             対象年
 * @param month            対象月
 * @param callback(err)
 */
var sendApplicateMail = function (targetUser, updateUser, permissionUsers, year, month, callback) {

  async.parallel({
    targetUser: function (callback) {
      User.findOne({
        _id: targetUser
      }, function (err, user) {
        if (user == null) {
          callback('targetUser is not found. user._id: ' + user);
        } else {
          callback(err, user);
        }
      });
    },
    updateUser: function (callback) {
      User.findOne({
        _id: updateUser
      }, function (err, user) {
        if (user == null) {
          callback('updateUser is not found. user._id: ' + user);
        } else {
          callback(err, user);
        }
      });
    },
  }, function (err, results) {
    if (err) {
      callback(err);
      return;
    }

    // 送信先ユーザーリスト作成(自分自身には通知しない)
    // 勤務表ユーザの次の承認者（いれば中間承認者、いなければ上長）
    // Redmine#114441 
    var userObjIds = [];
    if (permissionUsers.middle.length > 0) {
      permissionUsers.middle.forEach(function (userObjId) {
        if (userObjId != updateUser) {
          userObjIds.push(userObjId);
        }
      });
    } else if (permissionUsers.top.length > 0) {
      permissionUsers.better.forEach(function (userObjId) {
        if (userObjId != updateUser) {
          userObjIds.push(userObjId);
        }
      });
    }

    User.find({
      _id: {
        $in: userObjIds
      }
    }, function (err, users) {
      // メール送信用Redisに登録
      async.eachSeries(users, function (user, callback) {
        var mail = user.mail;
        var subject = '[KiLock] 勤務表申請';
        var body = results.targetUser.name + 'さんの' + year + '年' + month + '月 の勤務表が提出されました。\r\n';
        postbox.postMailGeneral(mail, subject, body, '', [], callback);
      }, callback);
    });
  });
};


/**
 * 権限保持ユーザによる入力・修正完了時のメール送信
 *
 * @param targetUser       勤務表ユーザ(user._id)
 * @param updateUser       操作ユーザ(user._id)
 * @param permissionUsers  勤務表承認ユーザリスト
 * @param year             対象年
 * @param month            対象月
 * @param callback(err)
 */
var sendApplicateMailFromPermitUser = function (targetUser, updateUser, permissionUsers, year, month, callback) {

  async.parallel({
    targetUser: function (callback) {
      User.findOne({
        _id: targetUser
      }, function (err, user) {
        if (user == null) {
          callback('targetUser is not found. user._id: ' + user);
        } else {
          callback(err, user);
        }
      });
    },
    updateUser: function (callback) {
      User.findOne({
        _id: updateUser
      }, function (err, user) {
        if (user == null) {
          callback('updateUser is not found. user._id: ' + user);
        } else {
          callback(err, user);
        }
      });
    },
    attendanceLogEditings: function (callback) {
      AttendanceLogEditing.find({
          user: targetUser,
          updateUser: updateUser,
          year: year,
          month: month
        }).populate('beforeAttendanceType')
        .populate('afterAttendanceType')
        .exec(callback);
    },
    timecardEditings: function (callback) {
      TimecardEditing.find({
          user: targetUser,
          updateUser: updateUser,
          year: year,
          month: month
        }).populate('beforeMatter')
        .populate('afterMatter')
        .exec(callback);
    },
  }, function (err, results) {
    if (err) {
      callback(err);
      return;
    }

    var changes = [];
    async.waterfall([
      // AttendanceLog の更新メッセージ生成
      function (callback) {
        if (results.attendanceLogEditings.length <= 0) {
          callback();

        } else {
          async.each(results.attendanceLogEditings, function (log, callback) {
            var messages = [];

            pushDiffMessages(messages, '備考', log.beforeReasonOfEditing, log.afterReasonOfEditing, 'string');
            var beforeTypeName = '';
            if (log.beforeAttendanceType != null) {
              beforeTypeName = log.beforeAttendanceType.name;
            }
            var afterTypeName = '';
            if (log.afterAttendanceType != null) {
              afterTypeName = log.afterAttendanceType.name;
            }
            pushDiffMessages(messages, '勤怠区分', beforeTypeName, afterTypeName, 'string');

            if (messages.length > 0) {
              changes.push({
                day: log.day,
                logs: messages,
                timecards: [],
              });
            }
            callback();
          }, callback);
        }
      },
      // Timecard の更新メッセージ生成
      function (callback) {
        if (results.timecardEditings.length <= 0) {
          callback();

        } else {
          async.each(results.timecardEditings, function (t, callback) {
            var messages = [];

            var beforeMatterName = '';
            if (t.beforeMatter != null) {
              beforeMatterName = t.beforeMatter.matterName;
            }
            var afterMatterName = '';
            if (t.afterMatter != null) {
              afterMatterName = t.afterMatter.matterName;
            }
            pushDiffMessages(messages, '案件', beforeMatterName, afterMatterName, 'string');
            pushDiffMessages(messages, '始業', t.beforeInTimestamp, t.afterInTimestamp, 'date');
            pushDiffMessages(messages, '終業', t.beforeOutTimestamp, t.afterOutTimestamp, 'date');
            pushDiffMessages(messages, '休憩時間', t.beforeRestHours, t.afterRestHours, 'restHours');

            if (messages.length > 0) {
              var change;
              changes.forEach(function (c, index) {
                if (t.day == c.day) {
                  change = c;
                }
              });
              if (change == null) {
                changes.push({
                  day: t.day,
                  logs: [],
                  timecards: [messages],
                });
              } else {
                change.timecards.push(messages);
              }
            }
            callback();
          }, callback);
        }
      },
    ], function (err) {

      // 通知メッセージ表示順ソート
      changes.sort(function (a, b) {
        if (a.day > b.day) {
          return 1;
        } else if (a.day < b.day) {
          return -1;
        } else {
          return 0;
        }
      });

      // 通知メッセージ作成
      var mailMessage = '';
      changes.forEach(function (change) {
        if (change.logs.length > 0 || change.timecards.length > 0) {
          mailMessage += '[' + month + '月' + change.day + '日]\r\n';
          change.logs.forEach(function (message) {
            mailMessage += message + '\r\n';
          });
          change.timecards.forEach(function (messages, index) {
            mailMessage += '=== 分割勤務表 ' + (index + 1) + ' ===\r\n';
            messages.forEach(function (message) {
              mailMessage += '  ' + message + '\r\n';
            });
          });
          mailMessage += '\r\n';
        }
      });

      if (mailMessage) {

        // 送信先ユーザーリスト作成(自分自身には通知しない)
        var userObjIds = [];
        Object.keys(permissionUsers).forEach(function (key) {
          permissionUsers[key].forEach(function (userObjId) {
            if (userObjId != updateUser) {
              userObjIds.push(userObjId);
            }
          });
        });
        if (targetUser != updateUser) {
          userObjIds.push(targetUser);
        }

        User.find({
          _id: {
            $in: userObjIds
          }
        }, function (err, users) {
          // メール送信用Redisに登録
          async.eachSeries(users, function (user, callback) {
            var mail = 'dummy';
            //var mail    = user.mail;
            var subject = '[KiLock] 勤務表変更通知';
            var body = year + '年' + month + '月 の勤務表が' + results.updateUser.name + 'さんに変更されました。\r\n';
            body += mailMessage;
            logger.debug(mailMessage);
            postbox.postMailGeneral(mail, subject, body, '', [], callback);

          }, function (err) {
            async.parallel({
              logs: function (callback) {
                if (results.attendanceLogEditings.length > 0) {
                  async.each(results.attendanceLogEditings, function (log, callback) {
                    log.remove(callback);
                  }, callback);
                } else {
                  callback();
                }
              },
              timecards: function (callback) {
                if (results.timecardEditings.length > 0) {
                  async.each(results.timecardEditings, function (t, callback) {
                    t.remove(callback);
                  }, callback);
                } else {
                  callback();
                }
              },
            }, callback);
          });
        });

      } else {
        callback();
      }
    });
  });
};

var pushDiffMessages = function (messages, subject, before, after, type) {
  switch (type) {
    case 'string':
      if (before == after) {
        break;
      }

      beforeStr = before || '―';
      afterStr = after || '―';
      messages.push(subject + ': ' + beforeStr + ' ---> ' + afterStr);
      break;

    case 'date':
      if (before == after) {
        break;
      }

      var mBefore = null;
      var beforeStr = '―';
      if (before != null) {
        mBefore = moment(before);
        beforeStr = mBefore.format('YYYY年MM月DD日 HH:mm:ss');
      }

      var mAfter = null;
      var afterStr = '―';
      if (after != null) {
        mAfter = moment(after);
        afterStr = mAfter.format('YYYY年MM月DD日 HH:mm:ss');
      }

      if (before == null || after == null) {
        messages.push(subject + ': ' + beforeStr + ' ---> ' + afterStr);

      } else {
        // 丸め時間超過時のみ変更として通知
        var diffUnix = Math.abs(mBefore.unix() - mAfter.unix());
        if (diffUnix >= (config.roundMinutes * 60)) {
          messages.push(subject + ': ' + beforeStr + ' ---> ' + afterStr);
        }
      }
      break;

    case 'restHours':
      if (before == after) {
        break;
      }

      var beforeStr = '―';
      if (before != null) {
        beforeStr = before.toFixed(2) + ' 時間';
      }

      var afterStr = '―';
      if (after != null) {
        afterStr = after.toFixed(2) + ' 時間';
      }

      messages.push(subject + ': ' + beforeStr + ' ---> ' + afterStr);
      break;
  }
};

/**
 * Timecard更新
 *
 * @param targetUser      勤務表ユーザ
 * @param updateUserObjId 更新ユーザObjectID
 * @param timecardObjId   タイムカードObjectID
 * @param updateFields    Timecard更新フィールドリスト
 * @param callback(err)
 */
var updateTimecard = function (targetUser, updateUserObjId, timecardObjId, updateFields, callback) {

  Timecard.findOne({
    _id: timecardObjId
  }, function (err, timecard) {
    console.log('Update Timestamp: ', updateFields.editedRestTimestamp);

    // var editedRestTimestamp = new Date(updateFields.editedRestTimestamp);
    // var roundedEditedRestTimestamp = datetimeutil.roundDown(editedRestTimestamp);

    // var utcTimeStamp = new Date(Date.UTC(roundedEditedRestTimestamp.getUTCFullYear(), roundedEditedRestTimestamp.getUTCMonth(), roundedEditedRestTimestamp.getHours(), roundedEditedRestTimestamp.getUTCMinutes(), roundedEditedRestTimestamp.getUTCSeconds()));

    // var toUTCDate = function (date) {
    //   var _utc = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getHours(), date.getUTCMinutes(), date.getUTCSeconds());
    //   return _utc;
    // };

    // var millisToUTCDate = function (millis) {
    //   return toUTCDate(new Date(millis));
    // };

    // var restTimestamp = millisToUTCDate(utcTimeStamp);

    // // var r = millisToUTCDate(restTimestamp);

    // var restHours = (restTimestamp.getUTCHours() + restTimestamp.getMinutes() / 60).toString();

    var restTimestamp = datetimeutil.roundDown(new Date(updateFields.editedRestTimestamp));
    var restHours = restTimestamp.getHours() + restTimestamp.getMinutes() / 60;

    console.log(restHours);

    var beforeMatter = null;
    var beforeEditedRestHours = null;
    var beforeEditedInTimestamp = null;
    var beforeEditedOutTimestamp = null;

    async.waterfall([
      // Timecard更新
      function (callback) {
        if (timecard == null) {
          timecard = new Timecard({
            user: targetUser._id,
            userId: targetUser.id,
            matterId: updateFields.matterId,
            matter: updateFields.matter,
            year: updateFields.year,
            month: updateFields.month,
            day: updateFields.day,
            actualInTimestamp: updateFields.editedInTimestamp,
            editedInTimestamp: updateFields.editedInTimestamp,
            actualOutTimestamp: updateFields.editedOutTimestamp,
            editedOutTimestamp: updateFields.editedOutTimestamp,
            actualRestHours: restHours,
            editedRestHours: restHours,
            isManualAdded: true,
          });

        } else {
          // 更新前の値を退避
          beforeMatter = timecard.matter;
          beforeEditedRestHours = timecard.editedRestHours;
          beforeEditedInTimestamp = timecard.editedInTimestamp;
          beforeEditedOutTimestamp = timecard.editedOutTimestamp;

          timecard.matter = updateFields.matter;
          timecard.matterId = updateFields.matterId;
          timecard.editedRestHours = restHours;
          timecard.editedInTimestamp = updateFields.editedInTimestamp;
          // まだ退勤打刻が無い場合、WEB画面からのクリア時には、退勤打刻をnullに戻す
          if (timecard.actualOutTimestamp == null &&
            timecard.actualInTimestamp.getTime() == (new Date(updateFields.editedOutTimestamp)).getTime()) {
            timecard.editedOutTimestamp = null;
          } else {
            timecard.editedOutTimestamp = updateFields.editedOutTimestamp;
          }
        }

        timecard.save(function (err, timecard) {
          callback(err, timecard);
        });
      },
      // TimecardEditing(ユーザー通知用のデータ)作成・更新
      function (timecard, callback) {
        if (targetUser._id != updateUserObjId) {
          TimecardEditing.findOne({
            timecard: timecard._id,
            updateUser: updateUserObjId,
          }, function (err, timecardEditing) {

            if (timecardEditing == null) {
              timecardEditing = new TimecardEditing({
                timecard: timecard._id,
                user: timecard.user,
                matter: timecard.matter,
                year: timecard.year,
                month: timecard.month,
                day: timecard.day,
                beforeMatter: beforeMatter,
                beforeRestHours: beforeEditedRestHours,
                beforeInTimestamp: beforeEditedInTimestamp,
                beforeOutTimestamp: beforeEditedOutTimestamp,
                afterMatter: timecard.matter,
                afterRestHours: timecard.editedRestHours,
                afterInTimestamp: timecard.editedInTimestamp,
                afterOutTimestamp: timecard.editedOutTimestamp,
                updateUser: updateUserObjId,
              });
            } else {
              timecardEditing.afterMatter = timecard.matter;
              timecardEditing.afterRestHours = timecard.editedRestHours;
              timecardEditing.afterInTimestamp = timecard.editedInTimestamp;
              timecardEditing.afterOutTimestamp = timecard.editedOutTimestamp;
            }
            timecardEditing.save(function (err, timecardEditing) {
              callback(err, timecard);
            });
          });
        } else {
          callback(err, timecard);
        }
      },
    ], callback);
  });
};

/**
 * Timecard削除・リセット
 *
 * @param targetUser      勤務表ユーザ
 * @param updateUserObjId 更新ユーザObjectID
 * @param timecardObjId   タイムカードObjectID
 * @param callback(err)
 */
var clearTimecard = function (targetUser, updateUserObjId, timecardObjId, callback) {
  Timecard.findOne({
    _id: timecardObjId
  }, function (err, timecard) {
    if (timecard == null) {
      callback(err, timecard);
      return;
    }

    var beforeMatter = null;
    var beforeEditedRestHours = null;
    var beforeEditedInTimestamp = null;
    var beforeEditedOutTimestamp = null;
    var afterMmatter = null;
    var afterEditedRestHours = null;
    var afterEditedInTimestamp = null;
    var afterEditedOutTimestamp = null;

    async.waterfall([
      // Timecard削除
      function (callback) {
        // 更新前の値を退避
        beforeMatter = timecard.matter;
        beforeEditedRestHours = timecard.editedRestHours;
        beforeEditedInTimestamp = timecard.editedInTimestamp;
        beforeEditedOutTimestamp = timecard.editedOutTimestamp;

        if (timecard.isManualAdded) {
          // Timecard削除
          var removedTimecard = new Timecard(timecard);
          timecard.remove(function (err) {
            callback(err, removedTimecard);
          });

        } else {
          // Timecardリセット
          timecard.matter = timecard.actualMatter;
          timecard.matterId = timecard.actualMatterId;
          timecard.editedInTimestamp = timecard.actualInTimestamp;
          timecard.editedOutTimestamp = timecard.actualOutTimestamp;
          timecard.editedRestHours = timecard.actualRestHours;
          timecard.save(function (err, timecard) {
            // 更新後の値を退避
            afterMmatter = timecard.matter;
            afterEditedRestHours = timecard.editedRestHours;
            afterEditedInTimestamp = timecard.editedInTimestamp;
            afterEditedOutTimestamp = timecard.editedOutTimestamp;
            callback(err, timecard);
          });
        }
      },
      // TimecardEditing(ユーザー通知用のデータ)作成・更新
      function (timecard, callback) {
        if (targetUser._id != updateUserObjId) {
          TimecardEditing.findOne({
            timecard: timecard._id,
            updateUser: updateUserObjId,
          }, function (err, timecardEditing) {

            if (timecardEditing == null) {
              timecardEditing = new TimecardEditing({
                timecard: null,
                user: timecard.user,
                matter: timecard.matter,
                year: timecard.year,
                month: timecard.month,
                day: timecard.day,
                beforeMatter: beforeMatter,
                beforeRestHours: beforeEditedRestHours,
                beforeInTimestamp: beforeEditedInTimestamp,
                beforeOutTimestamp: beforeEditedOutTimestamp,
                afterMatter: afterMmatter,
                afterRestHours: afterEditedRestHours,
                afterInTimestamp: afterEditedInTimestamp,
                afterOutTimestamp: afterEditedOutTimestamp,
                updateUser: updateUserObjId,
              });
            } else {
              timecardEditing.afterMatter = afterMmatter;
              timecardEditing.afterRestHours = afterEditedRestHours;
              timecardEditing.afterInTimestamp = afterEditedInTimestamp;
              timecardEditing.afterOutTimestamp = afterEditedOutTimestamp;
            }
            timecardEditing.save(function (err, timecardEditing) {
              callback(err, timecard);
            });
          });
        } else {
          callback(err, timecard);
        }
      },
    ], callback);
  });
};

/**
 * AttendanceLog更新
 *
 * @param targetUser      勤務表ユーザ
 * @param updateUserObjId 更新ユーザObjectID
 * @param updateFields    AttendanceLog更新フィールドリスト
 * @param callback(err)
 */
var updateAttendanceLog = function (targetUser, updateUserObjId, updateFields, callback) {

  async.parallel({
    // 勤怠区分取得（未指定時は「出勤」となる）
    attendanceType: function (callback) {
      var attendanceTypeConditions = {};
      if (updateFields.attendanceType) {
        attendanceTypeConditions = {
          _id: updateFields.attendanceType
        };
      } else {
        attendanceTypeConditions = {
          name: '出勤'
        };
      }
      AttendanceType.findOne(attendanceTypeConditions, callback);
    },

  }, function (err, results) {
    var attendanceType = results.attendanceType;

    var conditions = {
      user: targetUser._id,
      year: updateFields.year,
      month: updateFields.month,
      day: updateFields.day,
    };

    Timecard.find(conditions, function (err, timecards) {
      async.waterfall([
        function (callback) {
          var inEarliest = null;
          var outLatest = null;
          var zero = new Date(conditions.year, conditions.month - 1, conditions.day);
          if (timecards.length > 0) {
            async.eachSeries(timecards, function (t, callback) {
              // 始業時間00:00 終業時間00:00 の場合は一括勤務表に反映しない
              if (t.editedOutTimestamp == null ||
                (t.editedInTimestamp.getDate() != t.editedOutTimestamp.getDate()) ||
                t.editedInTimestamp.getHours() != 0 || t.editedInTimestamp.getMinutes() != 0 ||
                t.editedOutTimestamp.getHours() != 0 || t.editedOutTimestamp.getMinutes() != 0) {

                // attendanceLog の最早出勤打刻と最遅退勤打刻を保持
                if (t.editedInTimestamp != null &&
                  (inEarliest == null || (t.editedInTimestamp.getTime() < inEarliest.getTime()))) {
                  inEarliest = t.editedInTimestamp;
                }
                if (t.editedOutTimestamp != null) {
                  if (outLatest == null || (t.editedOutTimestamp.getTime() > outLatest.getTime())) {
                    outLatest = t.editedOutTimestamp;
                  }
                } else if (t.editedInTimestamp != null) {
                  if (outLatest == null || (t.editedInTimestamp.getTime() > outLatest.getTime())) {
                    outLatest = t.editedInTimestamp;
                  }
                }
              }
              callback();

            }, function (err) {
              inEarliest = inEarliest || new Date(zero);
              outLatest = outLatest || new Date(zero);
              callback(err, inEarliest, outLatest);
            });
          } else {
            callback(err, new Date(zero), new Date(zero));
          }
        },
        function (inEarliest, outLatest, callback) {
          var beforeReasonOfEditing = null;
          var beforeAttendanceType = null;
          var afterReasonOfEditing = null;
          var afterAttendanceType = null;
          AttendanceLog.findOne(conditions, function (err, attendanceLog) {
            async.waterfall([
              // AttendanceLog更新
              function (callback) {
                if (attendanceLog == null) {
                  attendanceLog = new AttendanceLog({
                    userId: targetUser.id,
                    user: targetUser._id,
                    year: updateFields.year,
                    month: updateFields.month,
                    day: updateFields.day,
                    attendanceType: attendanceType._id,
                    inTimestamp: datetimeutil.roundUp(inEarliest, config.roundMinutes),
                    outTimestamp: datetimeutil.roundDown(outLatest, config.roundMinutes),
                    reasonOfEditing: updateFields.reasonOfEditing,
                  });
                } else {
                  // 更新前の値を退避
                  beforeReasonOfEditing = attendanceLog.reasonOfEditing;
                  beforeAttendanceType = attendanceLog.attendanceType;

                  attendanceLog.attendanceType = attendanceType._id;
                  attendanceLog.reasonOfEditing = updateFields.reasonOfEditing;
                  attendanceLog.inTimestamp = datetimeutil.roundUp(inEarliest, config.roundMinutes);
                  attendanceLog.outTimestamp = datetimeutil.roundDown(outLatest, config.roundMinutes);
                }

                attendanceLog.save(function (err, attendanceLog) {
                  // 更新後の値を退避
                  afterReasonOfEditing = attendanceLog.reasonOfEditing;
                  afterAttendanceType = attendanceLog.attendanceType;
                  AttendanceLog.findOne(conditions)
                    .populate('attendanceType')
                    .exec(callback);
                });
              },
              // AttendanceLogEditing(ユーザー通知用のデータ)作成・更新
              function (attendanceLog, callback) {
                if (targetUser._id != updateUserObjId) {
                  AttendanceLogEditing.findOne({
                    attendanceLog: attendanceLog._id,
                    updateUser: updateUserObjId,
                  }, function (err, attendanceLogEditing) {

                    if (attendanceLogEditing == null) {
                      attendanceLogEditing = new AttendanceLogEditing({
                        attendanceLog: attendanceLog._id,
                        user: attendanceLog.user,
                        year: attendanceLog.year,
                        month: attendanceLog.month,
                        day: attendanceLog.day,
                        beforeReasonOfEditing: beforeReasonOfEditing,
                        beforeAttendanceType: beforeAttendanceType,
                        afterReasonOfEditing: afterReasonOfEditing,
                        afterAttendanceType: afterAttendanceType,
                        updateUser: updateUserObjId,
                      });
                    } else {
                      attendanceLogEditing.afterReasonOfEditing = afterReasonOfEditing;
                      attendanceLogEditing.afterAttendanceType = afterAttendanceType;
                    }
                    attendanceLogEditing.save(function (err, attendanceLogEditing) {
                      callback(err, attendanceLog);
                    });
                  });
                } else {
                  callback(err, attendanceLog);
                }
              },
            ], callback);
          });
        },
      ], callback);
    });
  });
};

/**
 * TravelCost更新
 *
 * @param targetUserObjId 対象ユーザObjectID
 * @param updateUserObjId 更新ユーザObjectID
 * @param year            対象年
 * @param month           対象月
 * @param day             対象日
 * @param updateFields    TravelCost更新フィールド
 * @param callback(err)
 */
var updateTravelCost = function (targetUserObjId, updateUserObjId, year, month, day, updateFields, callback) {
  async.parallel({
    travelCost: function (callback) {
      TravelCost.findOne({
        user: targetUserObjId,
        year: year,
        month: month,
        day: day,
      }, callback);
    },
    attendanceLog: function (callback) {
      AttendanceLog.findOne({
        user: targetUserObjId,
        year: year,
        month: month,
        day: day,
      }, function (err, attendanceLog) {
        if (attendanceLog == null) {
          callback('attendanceLog is not exist.');
        } else {
          callback(err, attendanceLog);
        }
      });
    },
  }, function (err, data) {
    var travelCost = data.travelCost;
    var attendanceLog = data.attendanceLog;

    // TravelCost新規作成
    if (travelCost == null) {
      travelCost = new TravelCost({
        travelCostItems: [],
        user: targetUserObjId,
        year: year,
        month: month,
        day: day,
        attendanceLog: data.attendanceLog._id,
      });
    }
    travelCost.bizAmount = updateFields.bizAmount || 0;
    travelCost.note = updateFields.note;
    travelCost.items = [];
    updateFields.items.forEach(function (updateItem) {
      var routes = [];
      updateItem.routes.forEach(function (updateRoute) {
        if (updateRoute != "") {
          routes.push(updateRoute);
        }
      });
      travelCost.items.push({
        type: updateItem.type,
        purpose: updateItem.purpose,
        amount: updateItem.amount,
        routes: routes,
      });
    });

    travelCost.save(function (err, travelCost) {
      if (travelCost != null) {
        // AttendanceLogとのリレーション更新
        attendanceLog.travelCost = travelCost._id;
        attendanceLog.save(callback);
      } else {
        callback();
      }
    });
  });
};

/**
 * RestTimeTemplates更新
 *
 * @param targetUserObjId 対象ユーザObjectID
 * @param updateUserObjId 更新ユーザObjectID
 * @param updateList      更新RestTimeTemplateリスト
 * @param deleteList      削除RestTimeTemplateリスト
 * @param callback(err)
 */
var updateRestTimeTemplates = function (targetUserObjId, updateUserObjId, updateList, deleteList, callback) {
  async.waterfall([
    // 登録更新処理
    function (callback) {
      async.each(updateList, function (template, callback) {
        RestTimeTemplate.findOne({
          id: template.id
        }, function (err, restTimeTemplate) {
          if (restTimeTemplate == null) {
            restTimeTemplate = new RestTimeTemplate({});
          }
          restTimeTemplate.name = template.name;
          restTimeTemplate.times = template.times;
          restTimeTemplate.save(callback);
        });
      }, callback);
    },
    // 削除処理
    function (callback) {
      async.each(deleteList, function (template, callback) {
        RestTimeTemplate.findOne({
          id: template.id
        }, function (err, restTimeTemplate) {
          if (restTimeTemplate != null) {
            restTimeTemplate.remove(callback);
          } else {
            callback();
          }
        });
      }, callback);
    },
  ], callback);
};

/**
 * RestTimes更新
 *
 * @param targetUserObjId 対象ユーザObjectID
 * @param updateUserObjId 更新ユーザObjectID
 * @param updateList      更新RestTimeリスト
 * @param deleteList      削除RestTimeリスト
 * @param callback(err)
 */
var updateRestTimes = function (targetUserObjId, updateUserObjId, updateList, deleteList, callback) {
  async.waterfall([
    // RestTime更新と紐づくTimecardの休憩時間を再計算
    function (callback) {
      async.each(updateList, function (updateFields, callback) {
        async.waterfall([
          // 更新前RestTime 取得
          function (callback) {
            RestTime.findOne({
              _id: updateFields._id
            }, callback);
          },
          // RestTime 更新
          function (beforeRestTime, callback) {
            updateRestTime(targetUserObjId, updateFields._id, updateFields, function (err, updatedRestTime) {
              callback(err, beforeRestTime, updatedRestTime)
            });
          },
          // RestTimeに紐づくTimecardの休憩時間を再計算
          function (beforeRestTime, updatedRestTime, callback) {
            updateTimecardRestHours(targetUserObjId, beforeRestTime, updatedRestTime, callback);
          },
        ], callback);
      }, callback);
    },
    // RestTime 削除
    function (callback) {
      async.each(deleteList, function (deleteFields, callback) {
        async.waterfall([
          // 削除前RestTimeに紐づくTimecardの休憩時間を再計算
          function (callback) {
            RestTime.findOne({
              _id: deleteFields._id
            }, function (err, beforeRestTime) {
              updateTimecardRestHours(targetUserObjId, beforeRestTime, null, callback);
            });
          },
          // RestTime 削除
          function (callback) {
            deleteRestTime(deleteFields._id, callback);
          },
        ], callback);
      }, callback);
    },
  ], callback);
};

/**
 * RestTimes更新
 *
 * @param targetUserObjId 対象ユーザObjectID
 * @param restTimeObjId   対象RestTimeObjectID
 * @param updateFields    更新RestTimeフィールド
 * @param callback(err)
 */
var updateRestTime = function (targetUserObjId, restTimeObjId, updateFields, callback) {
  RestTime.findOne({
    _id: restTimeObjId,
  }, function (err, restTime) {
    if (err) {
      callback(err, restTime);
      return;
    }

    if (restTime == null) {
      restTime = new RestTime({
        user: targetUserObjId,
      });
    }
    restTime.period.start = new Date(Date.parse(updateFields.period.start));
    restTime.period.end = updateFields.period.end ? new Date(Date.parse(updateFields.period.end)) : null;
    restTime.times = updateFields.times;
    restTime.save(function (err, restTime) {
      callback(err, restTime);
    });
  });
};

/**
 * 設定されたRestTimeに基づきTimecardのRestHoursを更新
 *
 * @param targetUserObjId 対象ユーザObjectID
 * @param beforeRestTime  更新前RestTimeオブジェクト
 * @param updatedRestTime 更新後RestTimeオブジェクト
 * @param callback(err)
 */
var updateTimecardRestHours = function (targetUserObjId, beforeRestTime, updatedRestTime, callback) {
  async.parallel({
    reportType: function (callback) {
      User.findOne({
        _id: targetUserObjId
      }, function (err, user) {
        workReport.getReportType(user, callback);
      });
    },
    beforeAttendanceLogs: function (callback) {
      if (beforeRestTime != null) {
        var beforeConditions = _getAttendanceLogConditionForRestTime(targetUserObjId, beforeRestTime);
        if (updatedRestTime != null) {
          var updateConditions = _getAttendanceLogConditionForRestTime(targetUserObjId, updatedRestTime);
          beforeConditions = _.assign(beforeConditions, {
            $nor: [{
              $and: [updateConditions]
            }]
          });
        }
        AttendanceLog.find(beforeConditions, callback);
      } else {
        callback();
      }
    },
    updateAttendanceLogs: function (callback) {
      if (updatedRestTime != null) {
        var updateConditions = _getAttendanceLogConditionForRestTime(targetUserObjId, updatedRestTime);
        AttendanceLog.find(updateConditions, callback);
      } else {
        callback();
      }
    },
  }, function (err, results) {
    var reportType = results.reportType;
    var beforeAttendanceLogs = results.beforeAttendanceLogs;
    var updateAttendanceLogs = results.updateAttendanceLogs;

    async.series([
      function (callback) {
        _updateTimecardRestHours(targetUserObjId, beforeAttendanceLogs, reportType, updatedRestTime, callback);
      },
      function (callback) {
        _updateTimecardRestHours(targetUserObjId, updateAttendanceLogs, reportType, updatedRestTime, callback);
      },
    ], function (err) {
      callback(err)
    });
  });
};

function _getAttendanceLogConditionForRestTime(targetUserObjId, restTime) {
  var condition = {
    user: targetUserObjId,
    $and: [{
      inTimestamp: {
        $gte: restTime.period.start
      },
    }]
  }
  if (restTime.period.end != null) {
    var endDate = new Date((new Date(restTime.period.end)).getTime() + 86400000);
    condition.$and.push({
      inTimestamp: {
        $lte: endDate
      },
    });
  }
  return condition;
}

function _updateTimecardRestHours(targetUserObjId, attendanceLogs, reportType, restTime, callback) {
  if (attendanceLogs == null || attendanceLogs.length <= 0) {
    callback();
    return;
  }
  async.each(attendanceLogs, function (attendanceLog, callback) {
    async.parallel({
      attendanceInCut: function (callback) {
        AttendanceInCut.findOne({
          user: targetUserObjId,
          year: attendanceLog.year,
          month: attendanceLog.month,
        }, callback);
      },
      timecards: function (callback) {
        Timecard.find({
          user: targetUserObjId,
          year: attendanceLog.year,
          month: attendanceLog.month,
          day: attendanceLog.day,
        }, callback);
      },
    }, function (err, results) {
      var attendanceInCut = results.attendanceInCut;
      var timecards = results.timecards;
      if (timecards.length <= 0) {
        callback();
        return;
      }
      var mainMatterId;
      if (attendanceInCut && attendanceInCut.matterId) {
        mainMatterId = attendanceInCut.matterId;
      }
      async.each(timecards, function (timecard, callback) {
        timecard.setIsMainTimecard(timecards, mainMatterId);
        timecard.saveRestHours(attendanceLog, restTime, attendanceInCut, reportType, 'leave', callback);
      }, callback);
    });
  }, callback);
}

/**
 * RestTimes更新
 *
 * @param restTimeObjId 対象RestTimeObjectID
 * @param callback(err)
 */
var deleteRestTime = function (restTimeObjId, callback) {
  RestTime.findOne({
    _id: restTimeObjId,
  }, function (err, restTime) {
    if (restTime != null) {
      restTime.remove(callback);
    } else {
      callback();
    }
  });
};


module.exports = {
  // attendance_summary_logic.js へ分割
  getSummary: getSummary,
  getSummaryCsv: getSummaryCsv,

  // attendance_status_logic.js へ分割
  getUserAttendanceStatuses: getUserAttendanceStatuses,
  getUserAttendanceStatusYears: getUserAttendanceStatusYears,
  getAttendanceStatusLogs: getAttendanceStatusLogs,
  updateStatus: updateStatus,
  stampable: stampable,

  // attendance_permission_logic.js へ分割
  getPermissionProjects: getPermissionProjects,
  getPermissionGroups: getPermissionGroups,
  getUserPermissions: getUserPermissions,
  getAllUserPermissions: getAllUserPermissions,
  getProjectPermissions: getProjectPermissions,
  updatePermissions: updatePermissions,

  getApprovalUsers: getApprovalUsers,
  getApprovalToSelfUsers: getApprovalToSelfUsers,
  getApprovalProjects: getApprovalProjects,
  getApprovalToSelfProjects: getApprovalToSelfProjects,

  // timecard_logic.js へ分割
  updateTimecard: updateTimecard,
  clearTimecard: clearTimecard,
  updateAttendanceLog: updateAttendanceLog,

  // travelCost_logic.js へ分割
  updateTravelCost: updateTravelCost,

  updateRestTimes: updateRestTimes,
  updateRestTimeTemplates: updateRestTimeTemplates,
};
