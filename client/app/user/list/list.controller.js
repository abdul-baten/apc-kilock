'use strict';

angular.module('serverAttendApiApp')
  .controller('UserListCtrl', ['$scope', '$http', '$location', '$translate', function ($scope, $http, $location, $translate) {

    $scope.nowPageNum = 0;
    $scope.maxPageNum = 0;
    var allGroupId = 'all';
    if ($location.search().groupId === allGroupId) {
      $scope.groupId = allGroupId;
    } else if ($location.search().groupId) {
      $scope.groupId = parseInt($location.search().groupId);
    } else {
      $scope.groupId = null;
    }
    $scope.userEnabled = $location.search().enabled || 'enabled';
    $scope.searchText = $location.search().searchText;
    if ($location.search().sort) {
      $scope.sort = JSON.parse($location.search().sort);
    } else {
      $scope.sort = {};
    }
    $scope.isShowNewRegister = false;

    var pageLimit = 20;       // １ページに表示する行数
    var pagingItemCount = 5;  // ページ遷移用のボタンの数

    $scope.$watch(function() {
      return $location.search();
    }, function () {
      if ($location.search().groupId === allGroupId) {
        $scope.groupId = allGroupId;
      } else if ($location.search().groupId) {
        $scope.groupId = parseInt($location.search().groupId);
      } else if ($scope.groups && $scope.groups.length > 0) {
        $scope.groupId = $scope.groups[0].id;
      }
      $scope.userEnabled = $location.search().enabled || 'enabled';
      $scope.searchText = $location.search().searchText;
      $scope.getPage($location.search().page || 1);
    });

    var lastRequestPageTime
    $scope.getPage = function(pageNum){
      var searchText = $scope.searchText;
      $scope.users = [];
      if (!$scope.groupId) {
        return;
      }
      lastRequestPageTime = (new Date()).getTime()
      var param = {
        params: {
          limit: pageLimit,
          offset: (pageNum-1)*pageLimit,
          searchText: searchText || '',
          userEnabled: $scope.userEnabled,
          groupId : $scope.groupId !== allGroupId ? $scope.groupId : null,
          requestTime: lastRequestPageTime,
          sort: $scope.sort,
        }
      };
      $http.get('/viewapi/users.json', param)
        .success(function (data) {
          if (data.requestTime == lastRequestPageTime) {
            setPagination(pageNum, data.totalCount);
            $scope.users = data.users;
            $scope.isShowNewRegister = data.showNewRegister;
          }
        })
        .error(function (data, status) {
          console.log({status:status, data: data});
          $scope.users = [];
          $scope.isShowNewRegister = false;
        })
      ;
    };
    $scope.getGroup = function(callback) {
      var param = {
        params: {
          nameWithCount: true,
        }
      };
      $http.get('/viewapi/groups.json', param)
        .success(function (data) {
          $scope.groups = data.groups;
          if (data.allowall) {
            var name = $translate.instant('(すべて)');
            $scope.groups.unshift({ id: allGroupId, name: name });
          }
          if ($location.search().groupId === allGroupId) {
            $scope.groupId = allGroupId;
          } else if ($location.search().groupId) {
            $scope.groupId = parseInt($location.search().groupId);
          } else if (!$scope.groupId && $scope.groups.length > 0) {
            $scope.groupId = $scope.groups[0].id;
          }
          callback();
        })
        .error(function (data, status) {
          console.log({status:status, data: data});
          callback();
        })
      ;
    };

    // 初回表示実行
    $scope.getGroup(function () {
      $scope.getPage($location.search().page || 1);
    });

    $scope.searchTextPlaceholder = $translate.instant('LoginId, Name で検索');

    $scope.toggleSort = function(key) {
      if ($scope.sort[key] == null) {
        $scope.sort[key] = 1;
      } else {
        $scope.sort[key] = $scope.sort[key] * -1;
      }
      $scope.search();
    };

    $scope.isAsc = function(key) {
      return $scope.sort[key] != null && $scope.sort[key] == 1
    };

    $scope.isDesc = function(key) {
      return $scope.sort[key] != null && $scope.sort[key] == -1
    };

    $scope.search = function(page){
      $location.search({
        page: page || 1,
        searchText: $scope.searchText,
        groupId : $scope.groupId,
        enabled : $scope.userEnabled,
        sort: $scope.sort ? JSON.stringify($scope.sort) : {},
      }).replace();
    };

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

    $scope.iconEnabled = function (user) {
      return {
        'octicon-person': user.enabled,
        'octicon-circle-slash': !user.enabled,
      };
    };
    $scope.iconCheckNfc = function (user) {
      return {
        'octicon-check': user.hasNfc
      };
    };
    $scope.iconCheckDevice = function (user) {
      return {
        'octicon-check': user.hasDevice
      };
    };
    $scope.showNewRegister = function () {
      return $scope.isShowNewRegister;
    };
    $scope.showEdit = function (user) {
      return user.showEdit;
    };
    $scope.showPassHistories = function (user) {
      return user.showPassHistories;
    };
    $scope.showAttendance = function (user) {
      return user.showAttendance;
    };
  }]);
