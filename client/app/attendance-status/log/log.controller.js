'use strict';

angular.module('serverAttendApiApp')
  .controller('AttendanceStatusLogCtrl', ['$scope', '$http', '$routeParams', '$location', '$timeout', '$translate',
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

    $scope.getPage = function(pageNum){
      $http({
        method: 'GET',
        url: '/viewapi/attendanceStatusLog.json',
        params: {
          targetUserName:     $scope.searchTargetUserName,
          targetUserProject:  $scope.searchTargetUserProject,
          updateUserName:     $scope.searchUpdateUserName,
          updateUserProject:  $scope.searchUpdateUserProject,
          startDate:          $scope.searchStartDate,
          endDate:            $scope.searchEndDate,
          limit:              pageLimit,
          offset:             (pageNum - 1) * pageLimit,
        },
      })
      .success(function (data, status) {
        console.log({status:status, data: data});
        setPagination(pageNum, data.totalCount);
        $scope.loginUser              = data.loginuser;
        $scope.attendanceActions      = data.attendanceActions;
        $scope.list                   = data.list;
      })
      .error(function (data, status) {
        console.log({status:status, data: data});
      });
    };

    var allProjectId = 'all';

    // プロジェクト情報を取得
    $scope.getTargetUserProject = function(callback) {
      $http.get('/viewapi/projects.json')
        .success(function (data) {
          if ($scope.targetUserProjects) {
            callback();
            return;
          }

          $scope.targetUserProjects = data.projects;
          if ($scope.targetUserProjects.length > 1) {
            var name = $translate.instant('(すべて)');
            $scope.targetUserProjects.unshift({ _id: allProjectId, name: name });
            if (!$location.search().searchTargetUserProject) {
              $scope.searchTargetUserProject = allProjectId;
            }
          }
          if ($location.search().searchTargetUserProject === allProjectId) {
            $scope.searchTargetUserProject = allProjectId;
          } else if ($location.search().searchTargetUserProject) {
            $scope.searchTargetUserProject = $location.search().searchTargetUserProject;
          } else if ($scope.targetUserProjects.length == 1) {
            $scope.searchTargetUserProject = $scope.targetUserProjects[0]._id;
          }
          callback();
        })
        .error(function (data, status) {
          console.log({status:status, data: data});
          callback();
        });
    };

    // プロジェクト情報を取得
    $scope.getUpdateUserProject = function(callback) {
      var param = {
        params: {
          all: true,
        }
      }
      $http.get('/viewapi/projects.json', param)
        .success(function (data) {
          if ($scope.updateUserProjects) {
            callback();
            return;
          }

          $scope.updateUserProjects = data.projects;
          if ($scope.updateUserProjects.length > 1) {
            var name = $translate.instant('(すべて)');
            $scope.updateUserProjects.unshift({ _id: allProjectId, name: name });
            if (!$location.search().searchUpdateUserProject) {
              $scope.searchUpdateUserProject = allProjectId;
            }
          }
          if ($location.search().searchUpdateUserProject === allProjectId) {
            $scope.searchUpdateUserProject = allProjectId;
          } else if ($location.search().searchUpdateUserProject) {
            $scope.searchUpdateUserProject = $location.search().searchUpdateUserProject;
          } else if ($scope.updateUserProjects.length == 1) {
            $scope.searchUpdateUserProject = $scope.updateUserProjects[0]._id;
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
      $scope.searchTargetUserName     = $location.search().searchTargetUserName;
      $scope.searchTargetUserProject  = $location.search().searchTargetUserProject;
      $scope.searchUpdateUserName     = $location.search().searchUpdateUserName;
      $scope.searchUpdateUserProject  = $location.search().searchUpdateUserProject;
      $scope.searchStartDate          = $location.search().searchStartDate;
      $scope.searchEndDate            = $location.search().searchEndDate;
      $scope.getTargetUserProject(function () {
        $scope.getUpdateUserProject(function () {
          $scope.getPage($location.search().page || 1);
        });
      });
    });

    $scope.search = function(page){
      $location.search({
        searchTargetUserName:     $scope.searchTargetUserName,
        searchTargetUserProject:  $scope.searchTargetUserProject,
        searchUpdateUserName:     $scope.searchUpdateUserName,
        searchUpdateUserProject:  $scope.searchUpdateUserProject,
        searchStartDate:          $scope.searchStartDate,
        searchEndDate:            $scope.searchEndDate,
        page:                     page || 1,
      }).replace();
    };

    $scope.buttonClearUpdateDate = function() {
      delete $scope.searchStartDate;
      delete $scope.searchEndDate;
      $scope.search($scope.nowPageNum);
    }

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
}]);
