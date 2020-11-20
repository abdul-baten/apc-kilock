'use strict';

var logger = log4js.getLogger();
var mongoose = require('mongoose');
var validator = require('../../../utils/validator');
var async = require('async');
var datetimeutil = require('../../../utils/datetimeutil');
var Project = mongoose.model('Project');
var Matter = mongoose.model('Matter');
var User = mongoose.model('User');
var AttendanceInCut = mongoose.model('AttendanceInCut');

/**
 * この案件が指定社員の主案件であるかを返却
 */
var isMainMatter = function (resource) {

  // シフトフラグが空
  if (resource.shiftFlag == null) {
    return false;
  }

  // 夜勤勤務者
  if (resource.shiftFlag) {
    if (resource.planNightShiftStart == null ||
        resource.planNightShiftEnd   == null ||
        resource.planNightShiftRest  == 0) {
      return false;
    }

  // 日勤勤務者
  } else {
    if (resource.planDayShiftStart == null ||
        resource.planDayShiftEnd   == null ||
        resource.planDayShiftRest  == 0) {
      return false;
    }
  }

  return true;
}

exports.post = function (req, res) {
  logger.info('POST data size: ' + JSON.stringify(req.body).length);

  var mainMatters = [];
  async.each(req.body, function(reqMatter, callback) {

    // 案件情報取り込み
    async.waterfall([
      function (callback) {
        Matter.findOne({matterCode:reqMatter.matterCode}, null, {}, function(err, matter) {
          if (matter) {
            callback(err, matter.id);
          } else {
            callback(err, null);
          }
        });
      },
      function (matterId, callback) {
        if (matterId) {
          AttendanceInCut.remove({matterId: matterId}, function(err) {
            callback(err);
          });
        } else {
          callback();
        }
      },
      function (callback) {
        Project.findOne({id: reqMatter.projectCode}, function (err, project) {
          // プロジェクトは存在していない場合も有り得る
          callback(null, project);
        });
      },
    ], function (err, project) {
      if (err) {
        logger.error(err);
        return res.json({
          statusCode : 'ERROR',
          errors: err,
        });
      }

      var year  = parseInt(reqMatter.yearMonth.substr(0, 4));
      var month = parseInt(reqMatter.yearMonth.substr(4, 2));

      var resources = [];
      if (!reqMatter.Resources) {
        reqMatter.Resources = [];
      }

      async.each(reqMatter.Resources, function(resource, callback) {

        async.waterfall([
          function (callback) {
            User.findOne({employeeCode: resource.employeeCode}, function (err, user) {
              if (user == null) {
                logger.info('[案件情報取得] User が存在しない ' + resource.employeeCode);
                callback();
              } else {
                resources.push({
                  user:             user._id,
                  overtimeKPI:      resource.overtimeKPI,
                  contractDivision: resource.contractDivision,
                });
                callback(null, user);
              }
            });
          },
        ], function (err, user) {
          if (err) {
            callback(err);

          } else {
            // 主案件の場合は attendanceInCut を登録
            if (user && isMainMatter(resource)) {
              mainMatters.push({
                user:       user._id,
                matterCode: reqMatter.matterCode,
              });
              // attendanceInCut 保存
              var conditions = {
                user:  user,
                year:  year,
                month: month,
              };
              AttendanceInCut.findOneAndUpdate(conditions, {$set: {
                inTime:         resource.planDayShiftStart ? resource.planDayShiftStart : null,
                outTime:        resource.planDayShiftEnd   ? resource.planDayShiftEnd : null,
                restHours:      resource.planDayShiftRest  ? parseFloat(resource.planDayShiftRest) : null,
                isNightShift:   resource.shiftFlag,
                inTimeNight:    resource.planNightShiftStart ? resource.planNightShiftStart : null,
                outTimeNight:   resource.planNightShiftEnd   ? resource.planNightShiftEnd : null,
                restHoursNight: resource.nightShiftRest  ? parseFloat(resource.nightShiftRest) : null,
              }}, {upsert: true}, function (err, attendanceInCut) {
                if (err) {
                  callback(err);
                } else {
                  callback();
                }
              });

            } else {
              callback();
            }
          }
        });

      }, function (err, results) {
        if (err) {
          logger.error(err);
          return res.json({
            statusCode : 'ERROR',
            errors: err,
          });

        } else {
          // matter 保存
          async.waterfall([
            function (callback) {
              var conditions = {
                matterCode: reqMatter.matterCode,
                year:       year,
                month:      month,
              };
              // 本当は findOneAndUpdate を使いたいが、save で更新しないとモデルの更新時前処理をフック出来ない
              Matter.findOne(conditions, null, function(err, matter) {
                if (matter == null) {
                  matter = new Matter();
                }
                matter.matterGroupCode = reqMatter.matterGroupCode;
                matter.matterCode      = reqMatter.matterCode;
                matter.matterName      = reqMatter.matterName;
                matter.contractStart   = datetimeutil.workstartdate(new Date(reqMatter.contractStart));
                matter.contractEnd     = datetimeutil.workstartdate(new Date(reqMatter.contractEnd));
                matter.year            = year;
                matter.month           = month;
                matter.valid           = reqMatter.valid;
                matter.project         = project ? project._id : null;
                matter.resources       = resources;
                matter.save(function() {
                  callback(err, matter);
                });
              });
            },
            function (matter, callback) {
              // ユーザーに紐づく案件から更新対象の案件を一旦削除
              User.update({matters:{$in:[matter._id]}}, {$pull:{matters: matter._id}}, {}, function(err, users) {
                callback(err, matter);
              });
            },
          ], function (err, matter) {
            if (err) {
              logger.error(err);
              return res.json({
                statusCode : 'ERROR',
                errors: err,
              });
            }

            // user の matter への参照を追加
            // 主案件に登録された attendanceInCut へ matter への参照を追加
            async.each(matter.resources, function(resource, callback) {
              async.parallel([
                function(callback) {
                  if (resource) {
                    if (matter.valid) {
                      User.findOneAndUpdate({_id: resource.user}, {$addToSet: {
                        matters: matter._id,
                      }}, function (err, user) {
                        callback(err, user);
                      });

                    } else {
                       User.findOneAndUpdate({_id: resource.user}, {$pull: {
                        matters: matter._id,
                      }}, function (err, user) {
                        callback(err, user);
                      });
                    }
                  } else {
                    callback();
                  }
                },
                function(callback) {
                  var mainMatter = mainMatters.filter(function(item, index) {
                    if (item.user == resource.user && item.matterCode == matter.matterCode) {
                      return true;
                    }
                  });
                  if (resource && mainMatter.length > 0) {
                    var conditions = {
                      user:  resource.user,
                      year:  year,
                      month: month,
                    };
                    AttendanceInCut.findOneAndUpdate(conditions, {$set: {
                      matterId: matter.id,
                      matter: matter._id,
                    }}, function(err, attendanceInCut) {
                      callback(err, attendanceInCut);
                    });
                  } else {
                    callback();
                  }
                },
              ], function (err, results) {
                callback(err, results);
              });
            }, function (err, results) {
              callback(err, results);
            });
          });
        }
      });
    });
  }, function (err, results) {
    if (err) {
      logger.error(err);
      return res.json({
        statusCode : 'ERROR',
        errors: err,
      });
    }

    return res.json({
      statusCode : 'SUCCESS',
    });
  });
}
