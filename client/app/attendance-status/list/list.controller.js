'use strict';

angular.module('serverAttendApiApp')
  .controller('AttendanceStatusListCtrl', ['$scope', '$http', '$routeParams', '$location', '$timeout', '$translate',
                                    function ($scope, $http, $routeParams, $location, $timeout, $translate) {

    var pageLimit = 20;       // １ページに表示する行数
    var pagingItemCount = 5;  // ページ遷移用のボタンの数

    $scope.nowPageNum = 0;
    $scope.maxPageNum = 0;

    var setPagination = function(nowPageNum, totalCount){
      $scope.nowPageNum = nowPageNum;
      if (totalCount > pageLimit) {
        $scope.maxPageNum = parseInt(totalCount / pageLimit, 10);
      } else {
        $scope.maxPageNum = 0;
      }
      if($scope.maxPageNum !== 0 && totalCount % pageLimit > 0) {
        $scope.maxPageNum += 1;
      }

      $scope.pagingNumList = [];
      var pageItemHalf = Math.floor(pagingItemCount/2);
      var beginPage = 1;
      var endPage = $scope.maxPageNum > pagingItemCount? pagingItemCount: $scope.maxPageNum;

      if($scope.nowPageNum > pageItemHalf && nowPageNum - pageItemHalf > 0 && $scope.maxPageNum - pagingItemCount > 0){
        beginPage = (nowPageNum - pageItemHalf > $scope.maxPageNum - pagingItemCount) ?
          $scope.maxPageNum-pagingItemCount :
          nowPageNum - pageItemHalf;
      }

      if($scope.nowPageNum > pageItemHalf) {
        endPage = (nowPageNum + pageItemHalf > $scope.maxPageNum)? $scope.maxPageNum: nowPageNum + pageItemHalf;
      }

      for (var i = beginPage; i <= endPage; i++) {
        $scope.pagingNumList.push(i);
      }
    };

    $scope.existPrevPage = function(){
      return $scope.nowPageNum > 1;
    };

    $scope.prevPage = function(){
      if( $scope.nowPageNum > 1) {
        $scope.movePage($scope.nowPageNum - 1);
      }
    };

    $scope.existNextPage = function(){
      return $scope.nowPageNum < $scope.maxPageNum;
    };

    $scope.nextPage = function(){
      if( $scope.nowPageNum <= $scope.maxPageNum) {
        $scope.movePage($scope.nowPageNum + 1);
      }
    };

    $scope.movePage = function (page) {
      $scope.search(page);
    };

    //var initialAttendanceStatus = $scope.attendanceStatuses['applicating'];
    // HACK: あらかじめattendanceStatus定数を取得して使用する
    // 2 = 申請中
    var initialAttendanceStatus = 2;
    $scope.getPage = function(pageNum) {
      $http({
        method: 'GET',
        url: '/viewapi/attendanceStatus.json',
        params: {
          userName:           $scope.searchName,
          project:            $scope.searchProject,
          attendanceStatuses: $scope.searchAttendanceStatuses || initialAttendanceStatus,
          startYear:          $scope.searchStartYear,
          startMonth:         $scope.searchStartMonth,
          endYear:            $scope.searchEndYear,
          endMonth:           $scope.searchEndMonth,
          limit:              pageLimit,
          offset:             (pageNum - 1) * pageLimit,
        },
      })
      .success(function (data, status) {
        console.log({status:status, data: data});
        setPagination(pageNum, data.totalCount);

        $scope.loginUser              = data.loginuser;
        $scope.attendanceStatuses     = data.attendanceStatuses;
        $scope.attendanceStatusValues = _.values(data.attendanceStatuses);
        $scope.attendanceActions      = data.attendanceActions;
        $scope.attendancePermissions  = data.attendancePermissions;
        $scope.list                   = data.list;
        $scope.allUserPermissions     = data.allUserPermissions;
        $scope.years                  = data.years;
        $scope.months                 = data.months;

        // 承認状態チェックボックス初期化
        var initialAttendanceStatus = $scope.attendanceStatuses['applicating'];
        $scope.checkAttendanceStatuses = {};
        if ($scope.searchAttendanceStatuses == null) {
          $scope.checkAttendanceStatuses[initialAttendanceStatus] = true;
        } else if (Array.isArray($scope.searchAttendanceStatuses)) {
          $scope.searchAttendanceStatuses.forEach(function(status) {
            $scope.checkAttendanceStatuses[status] = true;
          });
        } else {
          $scope.checkAttendanceStatuses[$scope.searchAttendanceStatuses] = true;
        }
      })
      .error(function (data, status) {
        console.log({status:status, data: data});
      });
    };

    // プロジェクト情報を取得
    var allProjectId = 'all';
    $scope.getProject = function(callback) {
      $http.get('/viewapi/projects.json')
        .success(function (data) {
          if ($scope.projects) {
            callback();
            return;
          }

          $scope.projects = data.projects;
          if ($scope.projects.length > 1) {
            var name = $translate.instant('(すべて)');
            $scope.projects.unshift({ _id: allProjectId, name: name });
            if (!$location.search().searchProject) {
              $scope.searchProject = allProjectId;
            }
          }
          if ($location.search().searchProject === allProjectId) {
            $scope.searchProject = allProjectId;
          } else if ($location.search().searchProject) {
            $scope.searchProject = $location.search().searchProject;
          } else if ($scope.projects.length == 1) {
            $scope.searchProject = $scope.projects[0]._id;
          }
          callback();
        })
        .error(function (data, status) {
          console.log({status:status, data: data});
          callback();
        });
    };

    $scope.$watch(function() {
      return $location.search();
    }, function () {
      $scope.searchName               = $location.search().searchUserName;
      $scope.searchProject            = $location.search().searchProject;
      $scope.searchAttendanceStatuses = $location.search().searchAttendanceStatuses;
      if ($location.search().searchStartYear != null) {
        $scope.searchStartYear = parseInt($location.search().searchStartYear);
      }
      if ($location.search().searchStartMonth != null) {
        $scope.searchStartMonth = parseInt($location.search().searchStartMonth);
      }
      if ($location.search().searchEndYear != null) {
        $scope.searchEndYear = parseInt($location.search().searchEndYear);
      }
      if ($location.search().searchEndMonth != null) {
        $scope.searchEndMonth = parseInt($location.search().searchEndMonth);
      }
      $scope.getProject(function () {
        $scope.getPage($location.search().page || 1);
      });
    });

    $scope.search = function(page){
      $scope.searchAttendanceStatuses = [];
      Object.keys($scope.checkAttendanceStatuses).forEach(function(status) {
        if ($scope.checkAttendanceStatuses[status] == true) {
          $scope.searchAttendanceStatuses.push(status);
        }
      });
      $location.search({
        page:                     page || 1,
        searchUserName:           $scope.searchName,
        searchProject:            $scope.searchProject,
        searchAttendanceStatuses: $scope.searchAttendanceStatuses,
        searchStartYear:          $scope.searchStartYear,
        searchStartMonth:         $scope.searchStartMonth,
        searchEndYear:            $scope.searchEndYear,
        searchEndMonth:           $scope.searchEndMonth,
      }).replace();
    };


    /**
     * 勤務表申請のステータス表示名を返却
     * @param attendanceStatus
     * @return string 勤務表申請のステータス
     */
    $scope.displayAttendanceStatus = function(attendanceStatus) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return '';
      }

      switch (attendanceStatus) {
        case $scope.attendanceStatuses['no_application']:
          return $translate.instant('ATTENDANCE_STATUS_NO_APPLICATION');
        case $scope.attendanceStatuses['denegated']:
          return $translate.instant('ATTENDANCE_STATUS_DENEGATED');
        case $scope.attendanceStatuses['applicating']:
          return $translate.instant('ATTENDANCE_STATUS_APPLICATING');
        case $scope.attendanceStatuses['accepted_middle']:
          return $translate.instant('ATTENDANCE_STATUS_ACCEPTED_MIDDLE');
        case $scope.attendanceStatuses['accepted_better']:
          return $translate.instant('ATTENDANCE_STATUS_ACCEPTED_BETTER');
        case $scope.attendanceStatuses['accepted_top']:
          return $translate.instant('ATTENDANCE_STATUS_ACCEPTED_TOP');
        default:
          return '';
      }
    };

    /**
     * 勤務表状態更新の操作名を返却
     * @param attendanceAction
     * @return string 勤務表状態更新の操作名
     */
    $scope.displayAttendanceAction = function(attendanceAction) {
      if (attendanceAction == null || $scope.attendanceActions == null) {
        return '';
      }

      switch (attendanceAction) {
        case $scope.attendanceActions['applicate']:
          return $translate.instant('ATTENDANCE_ACTION_APPLICATE');
        case $scope.attendanceActions['accept_middle']:
          return $translate.instant('ATTENDANCE_ACTION_ACCEPT_MIDDLE');
        case $scope.attendanceActions['denegate_middle']:
          return $translate.instant('ATTENDANCE_ACTION_DENEGATE_MIDDLE');
        case $scope.attendanceActions['accept_better']:
          return $translate.instant('ATTENDANCE_ACTION_ACCEPT_BETTER');
        case $scope.attendanceActions['denegate_better']:
          return $translate.instant('ATTENDANCE_ACTION_DENEGATE_BETTER');
        case $scope.attendanceActions['accept_top']:
          return $translate.instant('ATTENDANCE_ACTION_ACCEPT_TOP');
        case $scope.attendanceActions['denegate_top']:
          return $translate.instant('ATTENDANCE_ACTION_DENEGATE_TOP');
        case $scope.attendanceActions['revert_top']:
          return $translate.instant('ATTENDANCE_ACTION_REVERT_TOP');
        default:
          return '';
      }
    };

    /**
     * 中間承認・否認ボタン表示可否を返却
     *
     * @param attendanceStatus 勤務表状態
     * @param user 勤務表状態ユーザObject
     * @return 表示可否
     */
    $scope.showAttendMiddleButton = function(attendanceStatus, user) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [
        $scope.attendanceStatuses['applicating'],
      ];
      var targetPermission = $scope.attendancePermissions['middle'];
      var userPermission = _.find($scope.allUserPermissions, { userObjId: user._id });
      var permissions = [];
      if (userPermission) {
        permissions = userPermission.permissions;
      }

      if ($scope.loginUser.admin || permissions.indexOf(targetPermission) >= 0) {
        return (targetStatuses.indexOf(attendanceStatus) >= 0) ? true : false;
      }
    };

    /**
     * 上長承認・否認ボタン表示可否を返却
     *
     * @param attendanceStatus 勤務表状態
     * @param user 勤務表状態ユーザObject
     * @return 表示可否
     */
    $scope.showAttendBetterButton = function(attendanceStatus, user) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [
        $scope.attendanceStatuses['applicating'],
        $scope.attendanceStatuses['accepted_middle'],
      ];
      var targetPermission = $scope.attendancePermissions['better'];
      var userPermission = _.find($scope.allUserPermissions, { userObjId: user._id });
      var permissions = [];
      if (userPermission) {
        permissions = userPermission.permissions;
      }

      if ($scope.loginUser.admin || permissions.indexOf(targetPermission) >= 0) {
        return (targetStatuses.indexOf(attendanceStatus) >= 0) ? true : false;
      }
    };

    /**
     * 総務確定・否認ボタン表示可否を返却
     *
     * @param attendanceStatus 勤務表状態
     * @param user 勤務表状態ユーザObject
     * @return 表示可否
     */
    $scope.showAttendTopButton = function(attendanceStatus, user) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [
        $scope.attendanceStatuses['accepted_better'],
      ];
      if ($scope.loginUser.top || $scope.loginUser.admin) {
        return (targetStatuses.indexOf(attendanceStatus) >= 0) ? true : false;
      }
    };

    /**
     * 総務確定差戻しボタン表示可否を返却
     *
     * @param attendanceStatus 勤務表状態
     * @param user 勤務表状態ユーザObject
     * @return 表示可否
     */
    $scope.showAttendRevertTopButton = function(attendanceStatus, user) {
      if (attendanceStatus == null || $scope.attendanceStatuses == null) {
        return false;
      }

      var targetStatuses = [
        $scope.attendanceStatuses['accepted_top'],
      ];
      if ($scope.loginUser.top || $scope.loginUser.admin) {
        return (targetStatuses.indexOf(attendanceStatus) >= 0) ? true : false;
      }
    };

    // 勤務表状態更新モーダル表示
    $scope.showUpdateAttendanceStatusModal = function (index, user, year, month, attendanceAction){
      $scope.index = index;
      $scope.user = user;
      $scope.year = year;
      $scope.month = month;
      $scope.attendanceAction = attendanceAction;
      angular.element("#updateAttendanceStatusModalLabel").modal('show');
    };

    /**
     * 勤務表ステータス更新ボタン押下時処理
     * @param attendanceAction
     * @return 表示可否
     */
    $scope.execAttendanceAction = function() {
      $http({
        method: 'POST',
        url: '/viewapi/attendanceStatus.json',
        data: {
          user:             $scope.user,
          year:             $scope.year,
          month:            $scope.month,
          updateUser:       $scope.loginUser._id,
          attendanceAction: $scope.attendanceAction,
        },
      }).success(function (data, status) {
        console.log({status:status, data: data});
        $scope.list[$scope.index].status = data.attendanceStatus;
        $scope.index = null;
        $scope.user = null;
        $scope.year = null;
        $scope.month = null;
        $scope.attendanceAction = null;
        angular.element("#updateAttendanceStatusModalLabel").modal('hide');
      }).error(function (data, status) {
        console.log({status:status, data: data});
        $scope.index = null;
        $scope.user = null;
        $scope.year = null;
        $scope.month = null;
        $scope.attendanceAction = null;
        angular.element("#updateAttendanceStatusModalLabel").modal('hide');
      });
    }

}]);
