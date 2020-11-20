"use strict";

angular.module("serverAttendApiApp").controller("AttendanceLogCtrl", [
  "$scope",
  "$http",
  "$window",
  "$routeParams",
  "$location",
  "$timeout",
  "$translate",
  "Upload",
  "$alert",
  "$modal",
  "$cookieStore",
  function (
    $scope,
    $http,
    $window,
    $routeParams,
    $location,
    $timeout,
    $translate,
    Upload,
    $alert,
    $modal,
    $cookieStore
  ) {
    $scope.attendanceUrl = "/";
    $scope.userId = $routeParams.userId;
    $scope.restTimeUrl = "/resttime";
    var query = $location.search();
    var dayMilliSecond = 86400000;
    $scope.timeCardModalOpen = false;
    $scope.timeCardWarningMessage = false;


    // 2重送信防止用
    $scope.requesting = false;

    if (query.year && query.month) {
      $scope.timecardUrl =
        "/timecard?year=" +
        parseInt(query.year, 10) +
        "&month=" +
        parseInt(query.month, 10);
    } else {
      $scope.timecardUrl = "/timecard";
    }

    if ($scope.userId !== undefined && $scope.userId !== null) {
      $scope.restTimeUrl = "/resttime/" + $scope.userId;
    }

    var toUTCDate = function (date) {
      var _utc = new Date(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds()
      );
      return _utc;
    };

    var millisToUTCDate = function (millis) {
      return toUTCDate(new Date(millis));
    };

    /**
     * 土曜日であるか返却
     *
     * @return bool
     */
    var isSaturday = function (year, month, day) {
      var weekday = moment([year, month - 1, day]).day();
      if (weekday == 6) {
        return true;
      } else {
        return false;
      }
    };

    /**
     * 日曜日もしくは祝日であるか返却
     *
     * @return bool
     */
    var isHoliday = function (year, month, day) {
      var weekday = moment([year, month - 1, day]).day();
      var holidayKeys = _.keys(koyomi.getHolidays(year));
      var key = month.toString() + ("0" + day).slice(-2);
      if (weekday == 0 || _.indexOf(holidayKeys, key) >= 0) {
        return true;
      } else {
        return false;
      }
    };

    $http({
        method: "GET",
        url: "/viewapi/attendance.json",
        params: {
          userId: $routeParams.userId,
          year: query.year,
          month: query.month,
          min: query.min
        }
      })
      .success(function (data, status) {
        console.log({
          status: status,
          data: data
        });
        $scope.userId = data.userId;
        if (data.userId !== undefined && data.userId !== null) {
          $scope.attendanceUrl = "/user/" + data.userId + "/attendance";
          if (query.year && query.month) {
            $scope.timecardUrl =
              "/user/" +
              data.userId +
              "/timecard?year=" +
              parseInt(query.year, 10) +
              "&month=" +
              parseInt(query.month, 10);
          } else {
            $scope.timecardUrl = "/user/" + data.userId + "/timecard";
          }
        }

        // 出勤/退勤時刻が日付を跨いでいた場合のプレフィックスを設定
        var attendanceLogs = data.attendanceLogs;
        for (var i in attendanceLogs) {
          var workDate = new Date(
            attendanceLogs[i].year,
            attendanceLogs[i].month - 1,
            attendanceLogs[i].day
          );
          if (attendanceLogs[i].editedInTimestamp) {
            attendanceLogs[i].inTimePrefix = getTimePrefix(
              workDate,
              new Date(attendanceLogs[i].editedInTimestamp)
            );
          }
          if (attendanceLogs[i].outTime) {
            attendanceLogs[i].outTimePrefix = getTimePrefix(
              workDate,
              new Date(attendanceLogs[i].outTime)
            );
          }
          attendanceLogs[i].isSaturday = isSaturday(
            attendanceLogs[i].year,
            attendanceLogs[i].month,
            attendanceLogs[i].day
          );
          attendanceLogs[i].isHoliday = isHoliday(
            attendanceLogs[i].year,
            attendanceLogs[i].month,
            attendanceLogs[i].day
          );

          // MY CHANGE
          if (attendanceLogs[i].editedRestTimestamp) {
            attendanceLogs[i].editedRestTimestamp = millisToUTCDate(
              attendanceLogs[i].editedRestTimestamp
            );
          }
        }

        // 月別タブ生成
        var m = moment();
        m.subtract(3, "months");
        $scope.linkMonths = [];
        for (i = 0; i < 5; i++) {
          $scope.linkMonths.push({
            year: m.year(),
            month: m.month() + 1
          });
          m.add(1, "months");
        }

        var roundedSumWorkHours = Math.round(data.sumWorkHours * 100) / 100;
        $scope.userName = data.userName;
        $scope.user = data.user;
        $scope.employeeCode = data.employeeCode;
        $scope.loginUser = data.loginUser;
        $scope.year = data.year;
        $scope.month = data.month;
        $scope.sumWorkHours = roundedSumWorkHours;
        $scope.attendanceInCut = data.attendanceInCut;
        $scope.attendanceStatus = data.attendanceStatus;
        $scope.attendanceStatuses = data.attendanceStatuses;
        $scope.attendanceActions = data.attendanceActions;
        $scope.attendanceSummary = data.attendanceSummary;
        $scope.isMine = data.isMine;
        $scope.isAdmin = data.isAdmin;
        $scope.isProjectManager = data.isProjectManager;
        $scope.isMiddleManager = data.isMiddleManager;
        $scope.isBetterManager = data.isBetterManager;
        $scope.isTopManager = data.isTopManager;
        $scope.requireLegalHolidays = data.requireLegalHolidays;
        $scope.attendanceLogs = attendanceLogs;
        $scope.firstDayOfNextMonthAttendanceLog =
          data.firstDayOfNextMonthAttendanceLog;

        // プロジェクト取得
        $scope.getProject(function () {
          $scope.getUsers();
        });
      })
      .error(function (data, status) {
        console.log({
          status: status,
          data: data
        });
      });

    $scope.attendanceTypeList = [];
    $http({
        mehotd: "GET",
        url: "/viewapi/attendancetype/list.json"
      })
      .success(function (data) {
        $scope.attendanceTypeList = data;
        $scope.attendanceTypes = [];
        _.forEach(data, function (item) {
          $scope.attendanceTypes[item.name] = item._id;
        });
        $scope.workingAttendanceTypes = [
          $scope.attendanceTypes["出勤"],
          $scope.attendanceTypes["遅刻"],
          $scope.attendanceTypes["早退"],
          $scope.attendanceTypes["夜勤"],
          $scope.attendanceTypes["夜勤遅刻"],
          $scope.attendanceTypes["夜勤早退"],
          $scope.attendanceTypes["休出"],
          $scope.attendanceTypes["休出(振)"],
          $scope.attendanceTypes["法定休出"],
          $scope.attendanceTypes["法定休出(振)"]
        ];
      })
      .error(function (data) {
        console.log(data);
      });

    var allProjectId = "all";
    $scope.getUsers = function () {
      $scope.overTimeRequestApproveUserId = "";

      // usersを初期化
      $scope.users = [];
      var param = {
        params: {
          userEnabled: "enabled",
          projectId: $scope.projectId !== allProjectId ? $scope.projectId : null,
          approvalToSelf: true
        }
      };

      $http
        .get("/viewapi/projectusers.json", param)
        .success(function (data) {
          $scope.users = data.users;
        })
        .error(function (data, status) {
          $scope.users = [];
        });
    };

    // プロジェクト情報を取得
    $scope.getProject = function (callback) {
      $http
        .get("/viewapi/projects.json", {
          params: {
            approvalToSelf: true
          }
        })
        .success(function (data) {
          $scope.projects = data.projects;
          var name = $translate.instant("(すべて)");
          $scope.projects.unshift({
            _id: allProjectId,
            name: name
          });
          callback();
        })
        .error(function (data, status) {
          console.log({
            status: status,
            data: data
          });
          callback();
        });
    };

    /**
     * 勤務表申請のステータス表示名を返却
     * @param attendanceStatus
     * @return string 勤務表申請のステータス
     */
    $scope.displayAttendanceStatus = function (attendanceStatus) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return "";
      }

      switch (attendanceStatus) {
        case $scope.attendanceStatuses["no_application"]:
          return $translate.instant("ATTENDANCE_STATUS_NO_APPLICATION");
        case $scope.attendanceStatuses["denegated"]:
          return $translate.instant("ATTENDANCE_STATUS_DENEGATED");
        case $scope.attendanceStatuses["applicating"]:
          return $translate.instant("ATTENDANCE_STATUS_APPLICATING");
        case $scope.attendanceStatuses["accepted_middle"]:
          return $translate.instant("ATTENDANCE_STATUS_ACCEPTED_MIDDLE");
        case $scope.attendanceStatuses["accepted_better"]:
          return $translate.instant("ATTENDANCE_STATUS_ACCEPTED_BETTER");
        case $scope.attendanceStatuses["accepted_top"]:
          return $translate.instant("ATTENDANCE_STATUS_ACCEPTED_TOP");
        default:
          return "";
      }
    };

    /**
     * 勤務表状態更新の操作名を返却
     * @param attendanceAction
     * @return string 勤務表状態更新の操作名
     */
    $scope.displayAttendanceAction = function (attendanceAction) {
      if (attendanceAction == null || $scope.attendanceActions == null) {
        return "";
      }

      switch (attendanceAction) {
        case $scope.attendanceActions["applicate"]:
          return $translate.instant("ATTENDANCE_ACTION_APPLICATE");
        case $scope.attendanceActions["accept_middle"]:
          return $translate.instant("ATTENDANCE_ACTION_ACCEPT_MIDDLE");
        case $scope.attendanceActions["denegate_middle"]:
          return $translate.instant("ATTENDANCE_ACTION_DENEGATE_MIDDLE");
        case $scope.attendanceActions["accept_better"]:
          return $translate.instant("ATTENDANCE_ACTION_ACCEPT_BETTER");
        case $scope.attendanceActions["denegate_better"]:
          return $translate.instant("ATTENDANCE_ACTION_DENEGATE_BETTER");
        case $scope.attendanceActions["accept_top"]:
          return $translate.instant("ATTENDANCE_ACTION_ACCEPT_TOP");
        case $scope.attendanceActions["denegate_top"]:
          return $translate.instant("ATTENDANCE_ACTION_DENEGATE_TOP");
        case $scope.attendanceActions["revert_top"]:
          return $translate.instant("ATTENDANCE_ACTION_REVERT_TOP");
        default:
          return "";
      }
    };

    /**
     * Help downloadボタン表示可否を返却
     * @return 表示可否
     */
    $scope.showDownloadHelpButton = function () {
      if ($scope.isAdmin) {
        return true;
      } else {
        return false;
      }
    };

    /**
     * 勤務報告書downloadボタン表示可否を返却
     * @return 表示可否
     */
    $scope.showExcelDownloadButton = function () {
      if ($scope.isAdmin) {
        return true;
      } else {
        return false;
      }
    };

    /**
     * 勤務報告書一括downloadボタン表示可否を返却
     * @return 表示可否
     */
    $scope.showExcelAllDownloadButton = function () {
      if ($scope.isAdmin) {
        return true;
      } else {
        return false;
      }
    };

    /**
     * 管理使用欄CSV downloadボタン表示可否を返却
     * @return 表示可否
     */
    $scope.showSummaryCsvDownloadButton = function () {
      if ($scope.isAdmin || $scope.isTopManager) {
        return true;
      } else {
        return false;
      }
    };

    /**
     * 入力・修正完了ボタン表示可否を返却
     * @param attendanceStatus
     * @return 表示可否
     */
    $scope.showAttendApplicationButton = function (attendanceStatus) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [];
      var show = false;

      if ($scope.isAdmin) {
        show = true;
      }
      if ($scope.isProjectManager) {
        targetStatuses = [
          $scope.attendanceStatuses["no_application"],
          $scope.attendanceStatuses["applicating"]
        ];
        if (targetStatuses.indexOf(attendanceStatus) >= 0) {
          show = true;
        }
      }
      if ($scope.isTopManager) {
        targetStatuses = [
          $scope.attendanceStatuses["no_application"],
          $scope.attendanceStatuses["denegated"],
          $scope.attendanceStatuses["applicating"],
          $scope.attendanceStatuses["accepted_middle"],
          $scope.attendanceStatuses["accepted_better"]
        ];
        if (targetStatuses.indexOf(attendanceStatus) >= 0) {
          show = true;
        }
      }
      if ($scope.isBetterManager) {
        targetStatuses = [
          $scope.attendanceStatuses["no_application"],
          $scope.attendanceStatuses["denegated"],
          $scope.attendanceStatuses["applicating"],
          $scope.attendanceStatuses["accepted_middle"]
        ];
        if (targetStatuses.indexOf(attendanceStatus) >= 0) {
          show = true;
        }
      }
      if ($scope.isMiddleManager) {
        targetStatuses = [
          $scope.attendanceStatuses["no_application"],
          $scope.attendanceStatuses["denegated"],
          $scope.attendanceStatuses["applicating"]
        ];
        if (targetStatuses.indexOf(attendanceStatus) >= 0) {
          show = true;
        }
      }
      if ($scope.isMine) {
        targetStatuses = [
          $scope.attendanceStatuses["no_application"],
          $scope.attendanceStatuses["denegated"]
        ];
        if (targetStatuses.indexOf(attendanceStatus) >= 0) {
          show = true;
        }
      }

      return show;
    };

    /**
     * 中間承認・否認ボタン表示可否を返却
     * @param attendanceStatus
     * @return 表示可否
     */
    $scope.showAttendMiddleButton = function (attendanceStatus) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [$scope.attendanceStatuses["applicating"]];
      if ($scope.isAdmin || $scope.isMiddleManager) {
        return targetStatuses.indexOf(attendanceStatus) >= 0 ? true : false;
      }
    };

    /**
     * 上長承認・否認ボタン表示可否を返却
     * @param attendanceStatus
     * @return 表示可否
     */
    $scope.showAttendBetterButton = function (attendanceStatus) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [
        $scope.attendanceStatuses["applicating"],
        $scope.attendanceStatuses["accepted_middle"]
      ];
      if ($scope.isAdmin || $scope.isBetterManager) {
        return targetStatuses.indexOf(attendanceStatus) >= 0 ? true : false;
      }
    };

    /**
     * 総務確定・否認ボタン表示可否を返却
     * @param attendanceStatus
     * @return 表示可否
     */
    $scope.showAttendTopButton = function (attendanceStatus) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [$scope.attendanceStatuses["accepted_better"]];
      if ($scope.isAdmin || $scope.isTopManager) {
        return targetStatuses.indexOf(attendanceStatus) >= 0 ? true : false;
      }
    };

    /**
     * 総務確定差戻しボタン表示可否を返却
     * @param attendanceStatus
     * @return 表示可否
     */
    $scope.showAttendRevertTopButton = function (attendanceStatus) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [$scope.attendanceStatuses["accepted_top"]];
      if ($scope.isAdmin || $scope.isTopManager) {
        return targetStatuses.indexOf(attendanceStatus) >= 0 ? true : false;
      }
    };

    // 勤務表状態更新モーダル表示
    $scope.showUpdateAttendanceStatusModal = function (attendanceAction) {
      $scope.attendanceAction = attendanceAction;
      $scope.updateAttendanceStatusErrors = [];
      $scope.acceptComment = "";

      var legalHolidays = 0;
      $scope.attendanceLogs.forEach(function (attendanceLog) {
        var outDate = new Date(attendanceLog.editedOutTimestamp);

        if (attendanceLog.attendanceType == null) {
          var msg = "勤怠区分が未設定の日があります";
          if ($scope.updateAttendanceStatusErrors.indexOf(msg) < 0) {
            $scope.updateAttendanceStatusErrors.push(msg);
          }
        } else if (
          attendanceLog.attendanceType == $scope.attendanceTypes["法定休日"] ||
          attendanceLog.attendanceType == $scope.attendanceTypes["法定休出"] ||
          attendanceLog.attendanceType ==
          $scope.attendanceTypes["法定休出（振）"]
        ) {
          legalHolidays++;
        }
        // 夜勤もしくは24時越えの翌日の勤怠区分チェック
        else if (
          attendanceLog.attendanceType == $scope.attendanceTypes["夜勤"] ||
          outDate.getDate() != attendanceLog.day
        ) {
          var msg =
            "夜勤もしくは24時越えの翌日の勤怠区分が未設定の日があります";
          var m = moment({
            y: attendanceLog.year,
            M: attendanceLog.month - 1,
            d: attendanceLog.day
          });
          if (attendanceLog.day == m.daysInMonth()) {
            if (
              $scope.firstDayOfNextMonthAttendanceLog == null ||
              $scope.firstDayOfNextMonthAttendanceLog.attendanceType == null
            ) {
              $scope.updateAttendanceStatusErrors.push(msg);
            }
          } else {
            var nextDayAttendanceLog = _.find($scope.attendanceLogs, {
              year: attendanceLog.year,
              month: attendanceLog.month,
              day: attendanceLog.day + 1
            });
            if (
              nextDayAttendanceLog == null ||
              nextDayAttendanceLog.attendanceType == null
            ) {
              $scope.updateAttendanceStatusErrors.push(msg);
            }
          }
        }
        if (
          !$scope.showTime(null, attendanceLog) &&
          $scope.workingAttendanceTypes.indexOf(attendanceLog.attendanceType) >=
          0
        ) {
          var msg = attendanceLog.day + "日の始業/終業が登録されていません。";
          $scope.updateAttendanceStatusErrors.push(msg);
        }
      });
      if (legalHolidays < $scope.requireLegalHolidays) {
        var msg =
          "法定休日は" + $scope.requireLegalHolidays + "日以上必要です。";
        $scope.updateAttendanceStatusErrors.push(msg);
      }
      angular.element("#updateAttendanceModalInput").modal("show");
    };

    // 勤務表状態更新モーダルクローズ
    $scope.closeAttendanceStatusModal = function () {
      angular.element("#updateAttendanceModalInput").modal("hide");
    };

    $scope.showAcceptedComment = function (attendanceAction) {
      if ($scope.attendanceActions == null) {
        return;
      }

      return (
        [
          $scope.attendanceActions["denegate_middle"],
          $scope.attendanceActions["denegate_better"],
          $scope.attendanceActions["denegate_top"]
        ].indexOf(attendanceAction) >= 0
      );
    };

    /**
     * 勤務表ステータス更新ボタン押下時処理
     * @param attendanceAction
     * @return 表示可否
     */
    $scope.execAttendanceAction = function () {
      // 2重送信防止
      if (!$scope.requesting) {
        // リクエスト状態更新
        $scope.requesting = true;

        $http({
            method: "POST",
            url: "/viewapi/attendanceStatus.json",
            data: {
              user: $scope.user,
              year: $scope.year,
              month: $scope.month,
              updateUser: $scope.loginUser,
              comment: $scope.acceptComment,
              attendanceAction: $scope.attendanceAction
            }
          })
          .success(function (data, status) {
            console.log({
              status: status,
              data: data
            });
            $scope.attendanceAction = null;
            $scope.attendanceStatus = data.attendanceStatus;
            angular.element("#updateAttendanceModalInput").modal("hide");
            console.log("execAttendanceAction reload");
            window.location.reload();

            // リクエスト状態更新
            $scope.requesting = false;
          })
          .error(function (data, status) {
            console.log({
              status: status,
              data: data
            });
            $scope.attendanceAction = null;
            angular.element("#updateAttendanceModalInput").modal("hide");
            console.log("execAttendanceAction reload");
            window.location.reload();

            // リクエスト状態更新
            $scope.requesting = false;
          });
      }
    };

    /**
     * 管理使用欄
     */
    $scope.actionGetSummary = function (year, month) {
      $http({
          method: "GET",
          url: "/viewapi/attendanceSummary.json",
          data: "",
          params: {
            userId: $routeParams.userId,
            year: year,
            month: month
          }
        })
        .success(function (data, status) {
          $scope.attendanceSummary = data.attendanceSummary;
        })
        .error(function (data, status) {
          console.log({
            status: status,
            data: data
          });
        });
    };

    /**
     * 管理使用欄CSV download
     */
    $scope.buttonGetSummaryCSVClick = function (year, month) {
      $http({
          method: "GET",
          url: "/viewapi/attendanceSummary.json",
          data: "",
          headers: {
            Accept: "application/csv"
          },
          params: {
            userId: $scope.userId,
            year: year,
            month: month
          }
        })
        .success(function (data, status) {
          var fileName =
            ("000" + year.toString()).substr(-4) +
            "-" +
            ("0" + month.toString()).substr(-2) +
            "_Summary.csv";
          var type = {
            type: "text/plain;charset=utf-8"
          };
          var blob = new Blob([data], type);
          saveAs(blob, fileName);
        })
        .error(function (data, status) {
          console.log({
            status: status,
            data: data
          });
        });
    };

    var getAttendanceInCutTimes = function (attendanceInCut, field) {
      var times = attendanceInCut[field].split(":");
      return {
        hours: parseInt(times[0]),
        minutes: parseInt(times[1])
      };
    };

    // ボタン
    $scope.buttonModifyShow = function (form, attendanceLog) {
      return true;
    };
    $scope.buttonModifyClick = function (form, attendanceLog) {
      $scope.timecard_errors = [];
      $http({
          method: "GET",
          url: "/viewapi/timecard.json",
          params: {
            userId: $routeParams.userId,
            year: attendanceLog.year,
            month: attendanceLog.month,
            day: attendanceLog.day
          }
        })
        .success(function (data, status) {
          $scope.year = attendanceLog.year;
          $scope.month = attendanceLog.month;
          $scope.day = attendanceLog.day;
          $scope.timecards = data.timecards;
          $scope.matters = data.matters;
          $scope.clearTimecardIds = [];
          $scope.timecardsDate = new Date(
            attendanceLog.year,
            attendanceLog.month - 1,
            attendanceLog.day
          );
          $scope._editingAttendanceLog = attendanceLog;
          $scope._editingReasonText = attendanceLog.reasonOfEditing;
          $scope.beforeWorkMinutes = data.sumWorkMinutes;
          if (
            data.attendanceLogSaved &&
            data.attendanceLogSaved.attendanceType
          ) {
            $scope.attendanceTypeSaved =
              data.attendanceLogSaved.attendanceType._id;
          }

          function getHoursAndMinutes(date) {
            const hours = ('0' + date.getHours()).slice(-2);
            const minutes = date.getMinutes();
            const totalHours = `${hours}:${minutes}`;

            return totalHours;
          }

          $scope.timeCardRestDate = millisToUTCDate(data.timecards[0].editedRestTimestamp);
          $scope.attendancelogRestDate = new Date(attendanceLog.editedRestTimestamp);
          $scope.timeCardHours = getHoursAndMinutes($scope.timeCardRestDate);
          $scope.attendanceHours = getHoursAndMinutes($scope.attendancelogRestDate);

          if ($scope.timeCardHours !== $scope.attendanceHours) {
            $http({
                method: "POST",
                url: "/viewapi/timecardmismatch.json",
                data: {
                  userId: $scope.userId,
                  year: $scope.year,
                  month: $scope.month,
                  day: $scope.day,
                  attendanceTime: $scope.timeCardHours,
                  timecardTime: $scope.attendanceHours,
                  loginUser: $scope.loginUser
                }
              })
              .success(function (data, status) {
                console.log({
                  data: data,
                  status: status
                })
              })
              .error(function (data, status) {
                console.log({
                  data: data,
                  status: status
                })
              });
          }


          if (data.timecards.length <= 0 && $scope.attendanceInCut != null) {
            var inTimestamp;
            var outTimestamp;
            var restTimestamp;
            var restMinutes;
            if (
              attendanceLog.attendanceType == $scope.attendanceTypes["出勤"] &&
              $scope.attendanceInCut.inTime &&
              $scope.attendanceInCut.outTime &&
              $scope.attendanceInCut.restHours
            ) {
              var inTimes = getAttendanceInCutTimes(
                $scope.attendanceInCut,
                "inTime"
              );
              var outTimes = getAttendanceInCutTimes(
                $scope.attendanceInCut,
                "outTime"
              );
              inTimestamp = new Date(
                $scope.year,
                $scope.month - 1,
                $scope.day,
                inTimes.hours,
                inTimes.minutes,
                0
              );
              outTimestamp = new Date(
                $scope.year,
                $scope.month - 1,
                $scope.day,
                outTimes.hours,
                outTimes.minutes,
                0
              );
              restMinutes = $scope.attendanceInCut.restHours * 60;
            } else if (
              attendanceLog.attendanceType == $scope.attendanceTypes["夜勤"] &&
              $scope.attendanceInCut.inTime &&
              $scope.attendanceInCut.outTime &&
              $scope.attendanceInCut.restHoursNight
            ) {
              var inTimes = getAttendanceInCutTimes(
                $scope.attendanceInCut,
                "inTimeNight"
              );
              var outTimes = getAttendanceInCutTimes(
                $scope.attendanceInCut,
                "outTimeNight"
              );
              inTimestamp = new Date(
                $scope.year,
                $scope.month - 1,
                $scope.day,
                inTimes.hours,
                inTimes.minutes,
                0
              );
              outTimestamp = new Date(
                $scope.year,
                $scope.month - 1,
                $scope.day + 1,
                outTimes.hours,
                outTimes.minutes,
                0
              );
              restMinutes = $scope.attendanceInCut.restHoursNight * 60;
            }

            if (inTimestamp && outTimestamp && restMinutes) {
              var workMinutes =
                (outTimestamp.getTime() - inTimestamp.getTime()) / 60000 -
                restMinutes;
              var workTimeString =
                Math.floor(workMinutes / 60) +
                ":" +
                ("0" + (workMinutes % 60)).slice(-2);
              var mainMatter = $scope.attendanceInCut.matter;
              $scope.timecards = [{
                year: $scope.year,
                month: $scope.month,
                day: $scope.day,
                attendanceLog: JSON.stringify($scope._editingAttendanceLog),
                matter: mainMatter._id,
                matterId: mainMatter.id,
                actualInTimestamp: inTimestamp,
                editedInTimestamp: inTimestamp,
                actualOutTimestamp: outTimestamp,
                editedOutTimestamp: outTimestamp,
                actualRestTimestamp: new Date(
                  1970,
                  0,
                  1,
                  restMinutes / 60,
                  restMinutes % 60,
                  0
                ),
                editedRestTimestamp: new Date(
                  1970,
                  0,
                  1,
                  restMinutes / 60,
                  restMinutes % 60,
                  0
                ),
                workTimeString: workTimeString,
                modified: true,
                isManualAdded: true
              }];
            }
          } else {
            for (var i in data.timecards) {
              data.timecards[i].actualInTimestamp = new Date(
                data.timecards[i].actualInTimestamp
              );
              data.timecards[i].actualRestTimestamp = new Date(
                data.timecards[i].actualRestTimestamp
              );
              data.timecards[i].editedInTimestamp = new Date(
                data.timecards[i].editedInTimestamp
              );
              // data.timecards[i].editedRestTimestamp = new Date(data.timecards[i].editedRestTimestamp);

              data.timecards[i].editedRestTimestamp = millisToUTCDate(
                data.timecards[i].editedRestTimestamp
              );

              if (data.timecards[i].actualOutTimestamp != null) {
                data.timecards[i].actualOutTimestamp = new Date(
                  data.timecards[i].actualOutTimestamp
                );
              }
              if (data.timecards[i].editedOutTimestamp != null) {
                data.timecards[i].editedOutTimestamp = new Date(
                  data.timecards[i].editedOutTimestamp
                );
              } else {
                data.timecards[i].editedOutTimestamp = new Date(
                  data.timecards[i].editedInTimestamp
                );
              }
              // 出勤/退勤時刻を日付を跨いでいるかを判定するため、現状の入力時刻を保持
              data.timecards[i].editedInTimestampLast = new Date(
                data.timecards[i].editedInTimestamp
              );
              data.timecards[i].editedOutTimestampLast = new Date(
                data.timecards[i].editedOutTimestamp
              );
              // 変更前の時刻を保持
              data.timecards[i].editedInTimestampOrigin = new Date(
                data.timecards[i].editedInTimestamp
              );
              data.timecards[i].editedOutTimestampOrigin = new Date(
                data.timecards[i].editedOutTimestamp
              );
              // 出勤/退勤時刻が日付を跨いでいた場合のプレフィックスを設定
              var workDate = new Date(
                attendanceLog.year,
                attendanceLog.month - 1,
                attendanceLog.day
              );
              data.timecards[i].inTimePrefix = getTimePrefix(
                workDate,
                data.timecards[i].editedInTimestampLast
              );
              data.timecards[i].outTimePrefix = getTimePrefix(
                workDate,
                data.timecards[i].editedOutTimestampLast
              );
            }

          }

          $scope.timeCardModalOpen = true;
          if ($scope.timeCardModalOpen === true) {
            console.log("Timecard modal flag: ", $scope.timeCardModalOpen);
            var input = angular.element("#timecardModalInput");
            input.modal({
              backdrop: "static"
            });
          }
        })
        .error(function (data, status) {
          console.error({
            status: status,
            data: data
          });
        });
    };
    $scope.buttonTimecardAddClick = function () {
      var inTimestamp = new Date(
        $scope.year,
        $scope.month - 1,
        $scope.day,
        0,
        0,
        0
      );
      var outTimestamp = new Date(
        $scope.year,
        $scope.month - 1,
        $scope.day,
        0,
        0,
        0
      );
      var restTimestamp = new Date(1970, 0, 1, 0, 0, 0);
      var mainMatter = $scope.attendanceInCut ?
        $scope.attendanceInCut.matter :
        null;
      var emptyTimecard = {
        year: $scope.year,
        month: $scope.month,
        day: $scope.day,
        attendanceLog: JSON.stringify($scope._editingAttendanceLog),
        matter: mainMatter ? mainMatter._id : null,
        matterId: mainMatter ? mainMatter.id : null,
        actualInTimestamp: new Date(inTimestamp),
        editedInTimestamp: new Date(inTimestamp),
        actualOutTimestamp: new Date(outTimestamp),
        editedOutTimestamp: new Date(outTimestamp),
        actualRestTimestamp: new Date(restTimestamp),
        editedRestTimestamp: new Date(restTimestamp),
        editedInTimestampLast: new Date(inTimestamp),
        editedOutTimestampLast: new Date(outTimestamp),
        workTimeString: "0:00",
        modified: true,
        isManualAdded: true
      };
      $scope.timecards.push(emptyTimecard);
    };
    $scope.buttonResetTimecardShow = function (form, timecard) {
      return timecard.modified;
    };
    $scope.buttonResetTimecardClick = function (form, timecard) {
      var index = $scope.timecards.indexOf(timecard);
      if (timecard.isManualAdded) {
        $scope.timecards.splice(index, 1);
      } else {
        var actualInDateRounded = roundUp(
          new Date(timecard.actualInTimestamp),
          roundMinutes
        );
        var actualOutDateRounded;
        if (timecard.actualOutTimestamp != null) {
          actualOutDateRounded = roundDown(
            new Date(timecard.actualOutTimestamp),
            roundMinutes
          );
        } else {
          actualOutDateRounded = roundUp(
            new Date(timecard.actualInTimestamp),
            roundMinutes
          );
        }

        // タイムカードを打刻時の状態に戻す
        timecard.matter = timecard.actualMatter;
        timecard.matterId = timecard.actualMatterId;
        timecard.editedInTimestamp = actualInDateRounded;
        timecard.editedOutTimestamp = actualOutDateRounded;
        timecard.editedRestTimestamp = new Date(
          timecard.actualRestTimestamp.getTime()
        );

        // 勤務時間を戻す
        timecard.workTimeString =
          Math.floor(timecard.baseWorkMinutes / 60) +
          ":" +
          ("0" + (timecard.baseWorkMinutes % 60)).slice(-2);

        // 出勤/退勤時刻を日付を跨いでいるかを判定するため、現状の入力時刻を保持
        timecard.editedInTimestampLast = new Date(timecard.editedInTimestamp);
        timecard.editedOutTimestampLast = new Date(timecard.editedOutTimestamp);

        // 出勤/退勤時刻が日付を跨いでいた場合のプレフィックスを設定
        var workDate = new Date(
          timecard.year,
          timecard.month - 1,
          timecard.day
        );
        timecard.inTimePrefix = getTimePrefix(
          workDate,
          timecard.editedInTimestamp
        );
        timecard.outTimePrefix = getTimePrefix(
          workDate,
          timecard.editedOutTimestamp
        );
      }

      // リセット対象タイムカードIDリストを更新
      var hasClearTimecardId =
        $scope.clearTimecardIds.indexOf(timecard.id) === -1 ? false : true;
      if (timecard.modified && !hasClearTimecardId) {
        $scope.clearTimecardIds.push(timecard.id);
      }

      // タイムカード変更状態を更新
      timecard.modified = getTimecardModified(timecard);
    };
    var validateUpdateTimecard = function (attendanceLog, timecards) {
      var errors = [];
      var year = attendanceLog.year;
      var month = attendanceLog.month;
      var day = attendanceLog.day;
      var workDate = new Date(year, month - 1, day);

      var hasValidWorktime = false;
      timecards.forEach(function (timecard) {
        var inTime = new Date(timecard.editedInTimestamp);
        var outTime = new Date(timecard.editedOutTimestamp);
        if (
          inTime.getTime() != workDate.getTime() ||
          outTime.getTime() != workDate.getTime()
        ) {
          hasValidWorktime = true;
        }
      });

      var attendanceType = attendanceLog.attendanceType;
      if (
        hasValidWorktime == false &&
        $scope.workingAttendanceTypes.indexOf(attendanceType) >= 0
      ) {
        errors.push("始業/終業を設定してください");
      }
      return errors;
    };

    $scope.buttonSendTimecardClick = function () {
      $scope.timecard_errors = validateUpdateTimecard(
        $scope._editingAttendanceLog,
        $scope.timecards
      );
      if ($scope.timecard_errors.length > 0) {
        return;
      }

      // 2重送信防止
      if (!$scope.requesting) {
        // リクエスト状態更新
        $scope.requesting = true;

        $http({
            method: "POST",
            url: "/viewapi/timecard.json",
            data: {
              userId: $scope.userId,
              year: $scope.year,
              month: $scope.month,
              day: $scope.day,
              timecards: JSON.stringify($scope.timecards),
              clearTimecardIds: $scope.clearTimecardIds,
              reasonOfEditing: $scope._editingReasonText,
              attendanceLog: JSON.stringify($scope._editingAttendanceLog),
              loginUser: $scope.loginUser
            }
          })
          .success(function (data, status) {
            if (data.removeAttendanceLog) {
              $scope._editingAttendanceLog.editedInTimestamp = null;
              $scope._editingAttendanceLog.editedOutTimestamp = null;
              $scope._editingAttendanceLog.workTimeString = null;
              $scope._editingAttendanceLog.editedRestTimestamp = null;
              $scope._editingAttendanceLog.reasonOfEditing = null;
              $scope._editingAttendanceLog.modified = false;
              $scope._editingAttendanceLog.attendanceType = null;
              $scope._editingAttendanceLog.isValidWorkTime = false;
              $scope._editingAttendanceLog.id = null;
            } else if (data.attendanceLog) {
              var attendanceLog = JSON.parse(data.attendanceLog);
              $scope._editingAttendanceLog.editedInTimestamp = attendanceLog.inTimestamp;
              $scope._editingAttendanceLog.editedOutTimestamp = attendanceLog.outTimestamp;

              var workDate = new Date(
                attendanceLog.year,
                attendanceLog.month - 1,
                attendanceLog.day
              );
              if (attendanceLog.inTimestamp) {
                $scope._editingAttendanceLog.inTimePrefix = getTimePrefix(
                  workDate,
                  new Date(attendanceLog.inTimestamp)
                );
              }
              if (attendanceLog.outTimestamp) {
                $scope._editingAttendanceLog.outTimePrefix = getTimePrefix(
                  workDate,
                  new Date(attendanceLog.outTimestamp)
                );
              }

              $scope._editingAttendanceLog.workTimeString = data.workTimeString;
              $scope._editingAttendanceLog.editedRestTimestamp = data.restDate;
              $scope._editingAttendanceLog.reasonOfEditing =
                attendanceLog.reasonOfEditing;
              $scope._editingAttendanceLog.modified = data.modified;
              if (attendanceLog.attendanceType != null) {
                $scope._editingAttendanceLog.attendanceType =
                  attendanceLog.attendanceType._id;
              } else {
                $scope._editingAttendanceLog.attendanceType = null;
              }
              $scope._editingAttendanceLog.isValidWorkTime =
                data.isValidWorkTime;
              $scope._editingAttendanceLog.id = attendanceLog._id;

              var workHoursDiff =
                (data.workMinutes - $scope.beforeWorkMinutes) / 60;
              $scope.sumWorkHours += workHoursDiff;
              $scope.sumWorkHours = Math.round($scope.sumWorkHours * 100) / 100;

              // 残業申請ボタンの有効化
              $scope.attendanceLogs.forEach(function (baseAttendanceLog) {
                if (
                  baseAttendanceLog.year == attendanceLog.year &&
                  baseAttendanceLog.month == attendanceLog.month &&
                  baseAttendanceLog.day == attendanceLog.day
                ) {
                  baseAttendanceLog.inTimeSaved = attendanceLog.inTimestamp;
                  baseAttendanceLog.outTimeSaved = attendanceLog.outTimestamp;
                }
              });
            }

            $scope.actionGetSummary($scope.year, $scope.month);

            $scope.timeCardModalOpen = false;

            var input = angular.element("#timecardModalInput");
            input.modal("hide");

            console.log("Time card flag: ", $scope.timeCardModalOpen);

            $scope.timeCardWarningMessage = !$scope.timeCardWarningMessage;

            delete $scope.timecards;
            delete $scope.clearTimecardIds;
            delete $scope.timecardsDate;
            delete $scope._editingAttendanceLog;
            delete $scope._editingReasonText;
            delete $scope.timecard_errors;

            // リクエスト状態更新
            $scope.requesting = false;

            console.log("success: " + data);
          })
          .error(function (data, status) {
            if (data.errors.length > 0) {
              $scope.timecard_errors = data.errors;
            } else {
              $scope.timeCardModalOpen = false;
              var input = angular.element("#timecardModalInput");
              input.modal("hide");

              console.log("Time card flag: ", $scope.timeCardModalOpen);

              delete $scope.timecards;
              delete $scope.clearTimecardIds;
              delete $scope.timecardsDate;
              delete $scope._editingAttendanceLog;
              delete $scope._editingReasonText;
              delete $scope.timecard_errors;
            }

            // リクエスト状態更新
            $scope.requesting = false;

            console.log("failed:" + data);
          });
      }
    };

    $scope.buttonCancelTimecardClick = function () {
      $scope._editingAttendanceLog.attendanceType = $scope.attendanceTypeSaved;
      delete $scope.attendanceTypeSaved;
      delete $scope.timecards;
      delete $scope.clearTimecardIds;
      delete $scope.timecardsDate;
      delete $scope._editingAttendanceLog;
      delete $scope._editingReasonText;
      delete $scope.timecard_errors;

      $scope.timeCardModalOpen = false;

      var input = angular.element("#timecardModalInput");
      input.modal("hide");

      console.log("Timecard Modal flag: ", $scope.timeCardModalOpen);
    };

    // 表示可否判定
    $scope.showTime = function (form, attendanceLog) {
      if (!attendanceLog.isValidWorkTime) {
        return false;
      }
      var workDate = new Date(
        attendanceLog.year,
        attendanceLog.month - 1,
        attendanceLog.day
      );
      var inTime = new Date(attendanceLog.editedInTimestamp);
      var outTime = new Date(attendanceLog.editedOutTimestamp);
      if (
        inTime.getTime() == workDate.getTime() &&
        outTime.getTime() == workDate.getTime()
      ) {
        return false;
      }
      return attendanceLog.editedInTimestamp || attendanceLog.editedOutTimestamp;
    };
    $scope.showAttendanceType = function (form, attendanceLog) {
      return attendanceLog.editedInTimestamp || attendanceLog.editedOutTimestamp;
    };

    // Timecard タイムピッカー
    $scope.timecardTimePickerShow = function (form, timecard) {
      return (
        timecard.editedInTimestamp ||
        form.editedInTimestamp.$viewValue ||
        timecard.editedOutTimestamp ||
        form.editedOutTimestamp.$viewValue
      );
    };
    $scope.timecardTimePickerError = function (form, timecard) {
      if (form.editedInTimestamp && form.editedOutTimestamp) {
        return (
          (form.editedInTimestamp.$viewValue !== "" &&
            form.editedInTimestamp.$invalid) ||
          (form.editedOutTimestamp.$viewValue !== "" &&
            form.editedOutTimestamp.$invalid) ||
          (!timecard.editedInTimestamp && timecard.editedInTimestamp)
        );
      } else {
        return false;
      }
    };
    $scope.timecardTimePickerErrorClass = function (form, timecard) {
      return {
        "has-error": form.apiError || $scope.timecardTimePickerError(form, timecard)
      };
    };
    $scope.timecardTimePickerClass = function (form, timecard) {
      return {
        borderless:
          !form.apiError &&
          !form.$focus &&
          !$scope.timecardTimePickerError(form, timecard) &&
          !timecard.modified
      };
    };
    $scope.timecardTimePickerInit = function ($event, form) {
      form.$focus = false;
      form.apiError = false;
    };
    $scope.timecardTimePickerFocus = function ($event, form) {
      form.$focus = true;
    };
    $scope.timecardTimePickerBlur = function ($event, form) {
      form.$focus = false;
    };
    $scope.enableSendTimecardButton = function () {
      if ($scope.timecard_errors != null && $scope.timecard_errors.length > 0) {
        return true;
      } else {
        return false;
      }
    };

    $scope.timecardTimePickerChange = function ($event, form, timecard) {
      if (timecard.editedInTimestamp == null) {
        // 直接入力の場合、一時的に始業/終業時刻が不正(Invalid Date)となる
        // 日付跨ぎの判定を無効化するためため前回入力を初期化する
        timecard.editedInTimestampLast = new Date(
          timecard.editedInTimestampOrigin
        );
      } else if (timecard.editedOutTimestamp == null) {
        // 直接入力の場合、一時的に始業/終業時刻が不正(Invalid Date)となる
        // 日付跨ぎの判定を無効化するためため前回入力を初期化する
        timecard.editedOutTimestampLast = new Date(
          timecard.editedOutTimestampOrigin
        );
      } else if (timecard.editedRestTimestamp == null) {
        // no op.
      } else {
        var inDate = new Date(timecard.editedInTimestamp);
        var outDate = new Date(timecard.editedOutTimestamp);
        var inDateLast = new Date(timecard.editedInTimestampLast);
        var outDateLast = new Date(timecard.editedOutTimestampLast);
        var restDate = new Date(timecard.editedRestTimestamp);

        // 前回入力時との日の差分を変更後日付に反映
        timecard.editedInTimestamp = new Date(
          inDate.getTime() + getDiffDayPrev(inDate, inDateLast) * dayMilliSecond
        );
        timecard.editedOutTimestamp = new Date(
          outDate.getTime() +
          getDiffDayPrev(outDate, outDateLast) * dayMilliSecond
        );

        // 出勤/退勤時刻を日付を跨いでいるかを判定するため、現状の入力時刻を保持
        timecard.editedInTimestampLast = new Date(timecard.editedInTimestamp);
        timecard.editedOutTimestampLast = new Date(timecard.editedOutTimestamp);

        // 出勤/退勤時刻が日付を跨いでいた場合のプレフィックスを設定
        var workDate = new Date(
          timecard.year,
          timecard.month - 1,
          timecard.day
        );
        timecard.inTimePrefix = getTimePrefix(
          workDate,
          timecard.editedInTimestamp
        );
        timecard.outTimePrefix = getTimePrefix(
          workDate,
          timecard.editedOutTimestamp
        );

        // 勤務時間を算出
        // まだ退勤打刻されていない場合、勤務時間は主案件情報から算出した時間(view api より渡されている)
        if (
          timecard.actualOutTimestamp == null &&
          timecard.editedOutTimestamp != null &&
          timecard.editedInTimestamp.getTime() ==
          timecard.editedOutTimestamp.getTime()
        ) {
          timecard.workTimeString =
            Math.floor(timecard.baseWorkMinutes / 60) +
            ":" +
            ("0" + (timecard.baseWorkMinutes % 60)).slice(-2);
        }
        // 退勤打刻されている場合は、出勤/退勤/休憩時間より勤務時間を算出
        else {
          timecard.workTimeString = getWorkMinutes(timecard);
        }
        // タイムカード変更状態を設定
        timecard.modified = getTimecardModified(timecard);

        // 削除対象から外す
        var index = $scope.clearTimecardIds.indexOf(timecard.id);
        if (index >= 0) {
          $scope.clearTimecardIds.splice(index, 1);
        }

        // タイムカード整合性チェック
        validateTimecard();
      }
    };
    $scope.timecardChangeInDay = function ($event, form, timecard, direction) {
      if (direction == "up") {
        timecard.editedInTimestamp = new Date(
          timecard.editedInTimestamp.getTime() + dayMilliSecond
        );
      } else {
        timecard.editedInTimestamp = new Date(
          timecard.editedInTimestamp.getTime() - dayMilliSecond
        );
      }

      // 出勤/退勤時刻が日付を跨いでいた場合のプレフィックスを設定
      var workDate = new Date(timecard.year, timecard.month - 1, timecard.day);
      timecard.inTimePrefix = getTimePrefix(
        workDate,
        timecard.editedInTimestamp
      );
      timecard.outTimePrefix = getTimePrefix(
        workDate,
        timecard.editedOutTimestamp
      );

      // 勤務時間を更新
      timecard.workTimeString = getWorkMinutes(timecard);

      // タイムカード変更状態を設定
      timecard.modified = getTimecardModified(timecard);

      // タイムカード整合性チェック
      validateTimecard();
    };
    $scope.timecardChangeOutDay = function ($event, form, timecard, direction) {
      if (direction == "up") {
        timecard.editedOutTimestamp = new Date(
          timecard.editedOutTimestamp.getTime() + dayMilliSecond
        );
      } else {
        timecard.editedOutTimestamp = new Date(
          timecard.editedOutTimestamp.getTime() - dayMilliSecond
        );
      }

      // 出勤/退勤時刻が日付を跨いでいた場合のプレフィックスを設定
      var workDate = new Date(timecard.year, timecard.month - 1, timecard.day);
      timecard.inTimePrefix = getTimePrefix(
        workDate,
        timecard.editedInTimestamp
      );
      timecard.outTimePrefix = getTimePrefix(
        workDate,
        timecard.editedOutTimestamp
      );

      // 勤務時間を更新
      timecard.workTimeString = getWorkMinutes(timecard);

      // タイムカード変更状態を設定
      timecard.modified = getTimecardModified(timecard);

      // タイムカード整合性チェック
      validateTimecard();
    };
    $scope.timecardMatterChange = function ($event, form, timecard) {
      // タイムカード変更状態を設定
      timecard.modified = getTimecardModified(timecard);

      // 案件オブジェクトを更新
      for (var i in $scope.matters) {
        if ($scope.matters[i].id == timecard.matterId) {
          timecard.matter = $scope.matters[i]._id;
        }
      }

      // 削除対象から外す
      var index = $scope.clearTimecardIds.indexOf(timecard.id);
      if (index >= 0) {
        $scope.clearTimecardIds.splice(index, 1);
      }

      // タイムカード整合性チェック
      validateTimecard();
    };

    // タイムカード整合性チェック
    var validateTimecard = function () {
      $scope.timecard_errors = [];
      if ($scope.timecards.length > 0) {
        var errors = [];
        $scope.timecards.forEach(function (timecard) {
          var date = new Date(timecard.year, timecard.month - 1, timecard.day);
          if (
            timecard.editedInTimestamp.getTime() >
            timecard.editedOutTimestamp.getTime()
          ) {
            errors.push("始業/終業時刻が不正です");
          }
          if (timecard.editedInTimestamp.getTime() < date.getTime()) {
            errors.push("始業時刻は当日以降を入力してください");
          }
        });
        errors.forEach(function (error) {
          if ($scope.timecard_errors.indexOf(error) < 0) {
            $scope.timecard_errors.push(error);
          }
        });
      }
    };

    // 勤務時間を算出
    var getWorkMinutes = function (timecard) {
      var restDate = new Date(timecard.editedRestTimestamp);
      var inDateRounded = roundUp(
        new Date(timecard.editedInTimestamp),
        roundMinutes
      );
      var outDateRounded = roundDown(
        new Date(timecard.editedOutTimestamp),
        roundMinutes
      );
      var workTimestamp = outDateRounded.getTime() - inDateRounded.getTime();
      var workMinutes =
        workTimestamp / 60000 -
        (restDate.getHours() * 60 + restDate.getMinutes());
      if (workMinutes < 0) {
        workMinutes = 0;
      }
      return (
        Math.floor(workMinutes / 60) +
        ":" +
        ("0" + (workMinutes % 60)).slice(-2)
      );
    };

    // 前回入力時との日の差分を算出
    var getDiffDayPrev = function (date, dateLast) {
      // 翌日へ日付を跨いだ場合
      if (dateLast.getHours() >= 23 && date.getHours() <= 0) {
        return 1;
      }
      // 前日へ日付を跨いだ場合
      else if (dateLast.getHours() <= 0 && date.getHours() >= 23) {
        return -1;
      } else {
        return 0;
      }
    };

    // 出勤日付と退勤日付の日の差分を算出
    var getTimePrefix = function (workDate, targetDate) {
      var workDay = workDate.getDate();
      var targetDay = targetDate.getDate();
      var prefix = "";
      var diffDay = 0;

      // 翌日へ跨いでいる場合
      if (targetDate.getTime() > workDate.getTime()) {
        if (targetDay < workDay) {
          targetDay += workDay;
        }
        if (
          targetDate.getYear() != workDate.getYear() ||
          targetDate.getMonth() != workDate.getMonth() ||
          targetDate.getDate() != workDate.getDate()
        ) {
          prefix = targetDate.getMonth() + 1 + "/" + targetDate.getDate();
        }
      }
      // 前日へ跨いでいる場合
      else if (targetDate.getTime() < workDate.getTime()) {
        if (targetDay > workDay) {
          targetDay -= workDay;
        }
        if (
          targetDate.getYear() != workDate.getYear() ||
          targetDate.getMonth() != workDate.getMonth() ||
          targetDate.getDate() != workDate.getDate()
        ) {
          prefix = targetDate.getMonth() + 1 + "/" + targetDate.getDate();
        }
      }
      return prefix;
    };

    var getTimecardModified = function (timecard) {
      var t = timecard;

      var roundedActualIn = null;
      if (t.actualInTimestamp != null) {
        roundedActualIn = roundUp(t.actualInTimestamp, roundMinutes);
      }
      var roundedEditedIn = null;
      if (t.editedInTimestamp != null) {
        roundedEditedIn = roundUp(t.editedInTimestamp, roundMinutes);
      }
      var roundedActualOut = null;
      if (t.actualOutTimestamp != null) {
        roundedActualOut = roundDown(t.actualOutTimestamp, roundMinutes);
      }
      var roundedEditedOut = null;
      if (t.editedOutTimestamp != null) {
        roundedEditedOut = roundDown(t.editedOutTimestamp, roundMinutes);
      }

      var isDiff = function (actual, edited) {
        if (actual == null && edited != null) {
          return true;
        } else if (actual != null) {
          if (edited != null) {
            if (
              typeof actual.getTime == "function" &&
              typeof edited.getTime == "function"
            ) {
              return actual.getTime() != edited.getTime();
            } else {
              return actual != edited;
            }
            return true;
          } else {
            return false;
          }
        } else {
          return false;
        }
      };

      var isDiffOutNoStamp = function (timestamp) {
        if (
          timecard.actualOutTimestamp == null &&
          timecard.editedOutTimestamp != null &&
          timecard.editedInTimestamp.getTime() ==
          timecard.editedOutTimestamp.getTime()
        ) {
          return false;
        } else {
          return true;
        }
      };
      if (t.isManualAdded) {
        return true;
      } else if (
        isDiff(roundedActualIn, roundedEditedIn) ||
        (isDiff(roundedActualOut, roundedEditedOut) && isDiffOutNoStamp(t)) ||
        isDiff(t.actualRestTimestamp, t.editedRestTimestamp) ||
        isDiff(t.actualMatterId, t.matterId)
      ) {
        return true;
      } else {
        return false;
      }
    };

    var roundMinutes = 15;
    var roundUp = function (targetDate, minutes) {
      var ms = minutes * 60 * 1000;
      var timestamp = Math.ceil(targetDate.getTime() / ms) * ms;
      return new Date(timestamp);
    };
    var roundDown = function (targetDate, minutes) {
      var ms = minutes * 60 * 1000;
      var timestamp = Math.floor(targetDate.getTime() / ms) * ms;
      return new Date(timestamp);
    };

    // 年月タブ切り替え
    $scope.currentLinkClass = function (year, month) {
      return {
        active: $scope.year === year && $scope.month === month
      };
    };
    $scope.changeYearMonth = function (year, month) {
      $location
        .search({
          year: year,
          month: month
        })
        .replace();
    };

    // CSV export
    var getCSVFileYearMonth = function (year, month) {
      var query = $location.search();
      $http({
          method: "GET",
          url: "/viewapi/attendance.json",
          data: "",
          headers: {
            Accept: "application/csv"
          },
          params: {
            y: $routeParams.userId,
            year: year,
            month: month
          }
        })
        .success(function (data, status) {
          var fileName =
            ("000" + year.toString()).substr(-4) +
            "-" +
            ("0" + month.toString()).substr(-2) +
            ".csv";
          var type = {
            type: "text/plain;charset=utf-8"
          };
          var blob = new Blob([data], type);
          saveAs(blob, fileName);
        })
        .error(function (data, status) {
          console.log({
            status: status,
            data: data
          });
        });
    };
    $scope.buttonGetCSVClick = function (year, month) {
      getCSVFileYearMonth(year, month);
    };
    $scope.buttonGetImageClick = function (year, month) {
      var selectedOptions = $(".attendanceTypeSelect").children(
        "option:selected"
      );
      selectedOptions.each(function (index, option) {
        if ($(option).text() == "" || $(option).text() == " ") {
          $(option).text("-");
        }
      });

      window.html2canvas(document.body, {
        onrendered: function (canvas) {
          //var selectedOptions = $('.attendanceTypeSelect').children('option:selected');
          //selectedOptions.each(function(index, option) {
          //  if ($(option).text() == '-') {
          //    $(option).text(' ')
          //  }
          //});
          var filename =
            ("000" + year.toString()).substr(-4) +
            "-" +
            ("0" + month.toString()).substr(-2) +
            ".pdf";
          var doc = new jsPDF();
          doc.addImage(canvas.toDataURL(), "PNG", 0, 0, 210, 297);
          doc.save(filename);
        }
      });
    };
    $scope.buttonGetExcelClick = function (year, month) {
      $http({
          method: "GET",
          url: "/viewapi/export/excel.json",
          data: "",
          headers: {
            Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          },
          params: {
            userId: $scope.userId,
            year: year,
            month: month
          }
        })
        .success(function (data, status) {
          console.log({
            status: status,
            data: data
          });
          var arrayBuffer = new ArrayBuffer(50000);
          var buffer = new Uint8Array(data.report);
          var type = {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          };
          var blob = new Blob([buffer], type);
          saveAs(blob, data.filename);
        })
        .error(function (data, status) {
          console.log({
            status: status,
            data: data
          });
        });
    };

    $scope.buttonGetExcelAllClick = function (year, month) {
      $http({
          method: "GET",
          url: "/viewapi/export/excelAll.json",
          data: "",
          headers: {
            Accept: "application/octet-stream"
          },
          params: {
            year: year,
            month: month
          },
          responseType: "arraybuffer"
        })
        .success(function (data, status) {
          console.log({
            status: status,
            data: data
          });
          var buffer = new Uint8Array(data);
          var type = {
            type: "application/octet-stream"
          };
          var blob = new Blob([buffer], type);
          var filename = year + ("0" + month).slice(-2) + ".zip";
          saveAs(blob, filename);
        })
        .error(function (data, status) {
          console.log({
            status: status,
            data: data
          });
        });
    };

    $scope.downloadHelp = function () {
      $http({
          method: "GET",
          url: "/data/helpFile.json",
          data: ""
        })
        .success(function (data, status) {
          console.log({
            status: status,
            data: data
          });
          if (data.filename != "" && data.data != null) {
            var buffer = new Uint8Array(data.data.data);
            var type = {
              type: "application/octet-stream"
            };
            var blob = new Blob([buffer], type);
            saveAs(blob, data.filename);
          }
        })
        .error(function (data, status) {
          console.log({
            status: status,
            data: data
          });
        });
    };

    // 残業申請
    $scope.showOvertimeRequestButton = function (attendanceLog) {
      if (
        attendanceLog.editedInTimestamp &&
        attendanceLog.editedOutTimestamp &&
        !attendanceLog.overtimeRequest
      ) {
        return attendanceLog.inTimeSaved && attendanceLog.outTimeSaved;
      }
      return false;
    };
    $scope.showOvertimeRequestModal = function (attendanceLog) {
      $scope.attendanceLogSave = attendanceLog;
      $scope.overtimeRequestYear = attendanceLog.year;
      $scope.overtimeRequestMonth = attendanceLog.month;
      $scope.overtimeRequestDay = attendanceLog.day;
      $scope.overtimeRequestTime = new Date();

      $scope.cancellBtn = true;

      if (
        attendanceLog.overtimeRequest &&
        attendanceLog.overtimeRequest.approveStatus === 0
      ) {
        // 申請中

        // 残業時間
        $scope.overtimeRequestTime.setHours(attendanceLog.overtimeRequest.hour);
        $scope.overtimeRequestTime.setMinutes(
          attendanceLog.overtimeRequest.minute
        );
        // 申請理由
        $scope.overtimeRequestReason = attendanceLog.overtimeRequest.reason;
        // 承認プロジェクト
        $scope.projectId = attendanceLog.overtimeRequest.approveProject ?
          attendanceLog.overtimeRequest.approveProject :
          allProjectId;
        // 承認者
        $scope.overTimeRequestApproveUserId =
          attendanceLog.overtimeRequest.approveUser;
        // 残業申請ID
        $scope.overtimeRequestId = attendanceLog.overtimeRequest._id;
        // 残業申請ステータス
        $scope.approveStatus = attendanceLog.overtimeRequest.approveStatus;

        $scope.remandText = false; // 差戻し理由
        $scope.recallBtn = true; // 取消しボタン
        $scope.reviseBtn = true; // 修正ボタン
        $scope.requestBtn = false; // 申請ボタン
      } else if (
        attendanceLog.overtimeRequest &&
        attendanceLog.overtimeRequest.approveStatus === 3
      ) {
        // 差戻し

        // 残業時間
        $scope.overtimeRequestTime.setHours(attendanceLog.overtimeRequest.hour);
        $scope.overtimeRequestTime.setMinutes(
          attendanceLog.overtimeRequest.minute
        );
        // 申請理由
        $scope.overtimeRequestReason = attendanceLog.overtimeRequest.reason;
        // 承認プロジェクト
        $scope.projectId = attendanceLog.overtimeRequest.approveProject ?
          attendanceLog.overtimeRequest.approveProject :
          allProjectId;
        // 承認者
        $scope.overTimeRequestApproveUserId =
          attendanceLog.overtimeRequest.approveUser;
        // 残業申請ID
        $scope.overtimeRequestId = attendanceLog.overtimeRequest._id;
        // 残業申請ステータス
        $scope.approveStatus = attendanceLog.overtimeRequest.approveStatus;
        // 差戻し理由
        if (attendanceLog.overtimeRequest.remandReason) {
          $scope.remandReasonText = attendanceLog.overtimeRequest.remandReason.replace(
            /\r?\n/g,
            "<br>"
          );
        } else {
          $scope.remandReasonText = attendanceLog.overtimeRequest.remandReason;
        }

        $scope.remandText = true; // 差戻し理由
        $scope.recallBtn = true; // 取消しボタン
        $scope.reviseBtn = false; // 修正ボタン
        $scope.requestBtn = true; // 申請ボタン
      } else {
        // 残業時間
        $scope.overtimeRequestTime.setHours(0);
        $scope.overtimeRequestTime.setMinutes(0);
        // 申請理由
        $scope.overtimeRequestReason = "";
        // 承認プロジェクト
        $scope.projectId = allProjectId;
        // 承認者
        $scope.overTimeRequestApproveUserId = "";

        $scope.remandText = false; // 差戻し理由
        $scope.recallBtn = false; // 取消しボタン
        $scope.reviseBtn = false; // 修正ボタン
        $scope.requestBtn = true; // 申請ボタン
      }

      angular.element("#overtimeModalInput").modal("show");
    };
    $scope.buttonCancelOvertimeRequestClick = function () {
      angular.element("#overtimeModalInput").modal("hide");

      delete $scope.attendanceLogSave;
      delete $scope.overtimeRequestTime;
      delete $scope.overtimeRequestYear;
      delete $scope.overtimeRequestMonth;
      delete $scope.overtimeRequestDay;
      delete $scope.overtimeRequestReason;
    };
    $scope.execOvertimeRequest = function () {
      $http({
          method: "POST",
          url: "/viewapi/overtimerequest.json",
          params: {
            overtimeRequestId: $scope.overtimeRequestId,
            approveProjectId: $scope.projectId,
            approveUserId: $scope.overTimeRequestApproveUserId,
            reason: $scope.overtimeRequestReason,
            year: $scope.overtimeRequestYear,
            month: $scope.overtimeRequestMonth,
            day: $scope.overtimeRequestDay,
            hour: $scope.overtimeRequestTime.getHours(),
            minute: $scope.overtimeRequestTime.getMinutes()
          }
        })
        .success(function (data, status) {
          $scope.attendanceLogSave.overtimeRequest = data;
          console.log("success: " + data);
        })
        .error(function (data, status) {
          console.log("failed:" + data);
        });
    };

    $scope.recallOvertimeRequest = function () {
      $http({
          method: "DELETE",
          url: "/viewapi/overtimerequest.json",
          params: {
            overtimeRequestId: $scope.overtimeRequestId,
            approveStatus: $scope.approveStatus
          }
        })
        .success(function (data, status) {
          $scope.attendanceLogSave.overtimeRequest = null;
          console.log("success: " + data);
        })
        .error(function (data, status) {
          console.log("failed:" + data);
        });
    };

    // 申請中か差戻し時は修正ボタンを表示
    $scope.showOvertimeReviseButton = function (attendanceLog) {
      if (!attendanceLog.overtimeRequest) return false;
      if (
        attendanceLog.overtimeRequest.approveStatus === 0 ||
        attendanceLog.overtimeRequest.approveStatus === 3
      ) {
        return true;
      }
      return false;
    };

    /**
     * 残業申請のステータスを返す。
     * @param attendanceLog
     * @return string 残業申請のステータス
     */
    $scope.displayOvertimeRequestStatus = function (attendanceLog) {
      if (!attendanceLog.overtimeRequest) return "";

      var status = attendanceLog.overtimeRequest.approveStatus;
      if (status === 0) {
        return $translate.instant("REQUEST_STATUS_REQUESTING");
      } else if (status === 1) {
        return $translate.instant("REQUEST_STATUS_APPROVE");
      } else if (status === 2) {
        return $translate.instant("REQUEST_STATUS_UNAPPROVE");
      } else if (status === 3) {
        return $translate.instant("REQUEST_STATUS_REMAND");
      }

      return "";
    };

    // 交通費追加
    $scope.showTravelCostButton = function (attendanceLog) {
      if (attendanceLog.editedInTimestamp && attendanceLog.editedOutTimestamp) {
        return attendanceLog.inTimeSaved && attendanceLog.outTimeSaved;
      }
      return false;
    };
    $scope.showTravelCostAmount = function (attendanceLog) {
      if (
        attendanceLog.travelCostTotal != null &&
        attendanceLog.travelCostTotal > 0
      ) {
        return true;
      } else {
        return false;
      }
    };
    $scope.showBizTravelCostForm = function () {
      return false;
    };
    $scope.showTravelCostModal = function (attendanceLog) {
      $http({
          method: "GET",
          url: "/viewapi/travelCost.json",
          params: {
            userObjId: $scope.user,
            year: attendanceLog.year,
            month: attendanceLog.month,
            day: attendanceLog.day
          }
        })
        .success(function (data, status) {
          console.log({
            status: status,
            data: data
          });
          if (data.travelCost == null) {
            $scope.travelCost = {
              user: $scope.user,
              year: attendanceLog.year,
              month: attendanceLog.month,
              day: attendanceLog.day,
              bizAmount: 0,
              note: "",
              items: []
            };
          } else {
            $scope.travelCost = data.travelCost;
            if ($scope.travelCost.items.length > 0) {
              $scope.travelCost.items.forEach(function (item) {
                item.type = {
                  value: item.type
                };
                item.purpose = {
                  value: item.purpose
                };
              });
            }
          }
          $scope.travelCostAttendanceLog = attendanceLog;
          $scope.travelCostDate = new Date(
            attendanceLog.year,
            attendanceLog.month - 1,
            attendanceLog.day
          );
          $scope.travelCostRoutesLimit = data.travelCostRoutesLimit;
          $scope.travelCostTotal = $scope.getTravelCostTotal();
          $scope.travelCostTypes = data.travelCostTypes;
          $scope.travelCostTypeList = getSelectList(
            data.travelCostTypes,
            "type"
          );
          $scope.travelCostPurposes = data.travelCostPurposes;
          $scope.travelCostPurposeList = getSelectList(
            data.travelCostPurposes,
            "purpose"
          );
          angular.element("#travelCostModalInput").modal("show");

          // ヘルプ表示
          var helpOptions = {
            trigger: "hover",
            container: "#travelCostModalInput",
            html: true
          };
          $("#travelcost-type-help").popover(
            _.assign(helpOptions, {
              content: getComment(data.travelCostTypeCommentList),
              placement: "right"
            })
          );
          $("#travelcost-purpose-help").popover(
            _.assign(helpOptions, {
              content: getComment(data.travelCostPurposeCommentList),
              placement: "right"
            })
          );
          $("#travelcost-route-help").popover(
            _.assign(helpOptions, {
              content: getComment(data.travelCostRouteCommentList),
              placement: "bottom"
            })
          );
          $("#travelcost-amount-help").popover(
            _.assign(helpOptions, {
              content: getComment(data.travelCostAmountCommentList),
              placement: "bottom"
            })
          );
        })
        .error(function (data, status) {
          console.error({
            status: status,
            data: data
          });
        });
    };
    var getSelectList = function (items, sortKey) {
      return _.sortBy(
        _.map(items, function (value, key) {
          return {
            key: key,
            value: value
          };
        }),
        sortKey
      );
    };
    var getComment = function (list) {
      var comment =
        '<table class="table table-condensed travel-comment-table">';
      list.forEach(function (item) {
        comment += "<tr>";
        if (item.name != "") {
          comment += '<td class="travel-comment-name">' + item.name + "</td>";
        }
        comment +=
          '<td class="travel-comment-comment">' + item.comment + "</td></tr>";
      });
      comment += "</table>";
      return comment;
    };
    $scope.closeTravelCostModal = function () {
      delete $scope.travelCost;
      delete $scope.travelCostAttendanceLog;
      delete $scope.travelCostDate;
      delete $scope.travelCostTotal;
      delete $scope.travelCostTypes;
      delete $scope.travelCostPurposes;
      delete $scope.travelCostErrors;
      angular.element("#travelCostModalInput").modal("hide");
    };
    $scope.getTravelCostTotal = function () {
      var total = 0;
      if ($scope.travelCost != null && $scope.travelCost.items.length > 0) {
        $scope.travelCost.items.forEach(function (item) {
          var amount = parseInt(item.amount);
          if (!_.isNaN(amount)) {
            total += amount;
          }
        });
      }
      return total;
    };
    $scope.changeTravelCostAmount = function () {
      $scope.travelCostTotal = $scope.getTravelCostTotal();
    };
    $scope.updateTravelCost = function () {
      if ($scope.travelCost.items.length > 0) {
        $scope.travelCost.items.forEach(function (item) {
          item.type = item.type ? item.type.value : null;
          item.purpose = item.purpose ? item.purpose.value : null;
        });
      }

      // 2重送信防止
      if (!$scope.requesting) {
        // リクエスト状態更新
        $scope.requesting = true;

        $http({
            method: "POST",
            url: "/viewapi/travelCost.json",
            data: {
              userObjId: $scope.user,
              year: $scope.travelCostDate.getFullYear(),
              month: $scope.travelCostDate.getMonth() + 1,
              day: $scope.travelCostDate.getDate(),
              travelCost: $scope.travelCost
            }
          })
          .success(function (data, status) {
            console.log({
              status: status,
              data: data
            });
            $scope.travelCostAttendanceLog.travelCostTotal = $scope.getTravelCostTotal();
            $scope.actionGetSummary($scope.year, $scope.month);
            $scope.closeTravelCostModal();

            // リクエスト状態更新
            $scope.requesting = false;
          })
          .error(function (data, status) {
            console.log({
              status: status,
              data: data
            });
            if (data.errors && data.errors.length > 0) {
              if ($scope.travelCost.items.length > 0) {
                $scope.travelCost.items.forEach(function (item) {
                  item.type = {
                    value: item.type
                  };
                  item.purpose = {
                    value: item.purpose
                  };
                });
              }
              $scope.travelCostErrors = data.errors;
            } else {
              $scope.closeTravelCostModal();
            }

            // リクエスト状態更新
            $scope.requesting = false;
          });
      }
    };
    $scope.addTravelCostItem = function () {
      $scope.travelCost.items.push({
        type: $scope.travelCostTypes["電車"],
        purpose: $scope.travelCostPurposes["客先会議"],
        amount: 0,
        routes: ["", ""]
      });
    };
    $scope.clearTravelCostItem = function (itemIndex) {
      $scope.travelCost.items.splice(itemIndex, 1);
      $scope.travelCostTotal = $scope.getTravelCostTotal();
    };
    $scope.showAddTravelCostRoute = function (itemIndex) {
      if (
        $scope.travelCost.items[itemIndex].routes.length <
        $scope.travelCostRoutesLimit
      ) {
        return true;
      } else {
        return false;
      }
    };
    $scope.addTravelCostRoute = function (itemIndex) {
      $scope.travelCost.items[itemIndex].routes.push("");
    };
    $scope.blurTravelCostRoute = function (itemIndex, routeIndex) {
      var routes = $scope.travelCost.items[itemIndex].routes;
      var clear = true;
      routes.forEach(function (route, index) {
        if (index > routeIndex && route != "") {
          clear = false;
        }
      });
      if (clear && routes[routeIndex] == "") {
        routes.splice(routeIndex, 1);
      }
    };

    $scope.buttonRestTimeClick = function () {
      $location.path($scope.restTimeUrl);
    };

    /**
     * Helpアップロードモーダル表示
     */
    $scope.openUploadHelpModal = function () {
      angular.element("#uploadHelpModal").modal("show");
    };

    /**
     * Helpアップロードモーダル閉じる
     */
    $scope.closeUploadHelpModal = function () {
      angular.element("#uploadHelpModal").modal("hide");
    };

    /**
     * upload on file select or drop
     */
    $scope.uploadHelpFile = function () {
      console.log($scope.helpFile);
      if ($scope.helpFile) {
        Upload.upload({
          url: "/data/helpFile.json",
          arrayKey: "",
          data: {
            file: $scope.helpFile
          }
        }).then(
          function (resp) {
            console.log(
              "Success " +
              resp.config.data.file.name +
              "uploaded. Response: " +
              resp.data
            );
            angular.element("#uploadHelpModal").modal("hide");
          },
          function (resp) {
            console.log("Error status: " + resp.status);
          },
          function (evt) {
            var progressPercentage = parseInt((100.0 * evt.loaded) / evt.total);
            console.log(
              "progress: " +
              progressPercentage +
              "% " +
              evt.config.data.file.name
            );
          }
        );
      }
    };
  }
]);
