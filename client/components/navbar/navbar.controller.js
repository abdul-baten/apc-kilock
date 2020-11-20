'use strict';

angular.module('serverAttendApiApp')
  .controller('NavbarCtrl', ['$scope', '$location', '$http', '$translate', '$rootScope', '$window', '$modal', function ($scope, $location, $http, $translate, $rootScope, $window, $modal) {

    // const timeOut = 10 * 60 * 1000;
    // setInterval(() => {
    //   var input = angular.element("#sessionTimeoutWarning");
    //   input.modal({
    //     backdrop: "static"
    //   });
    // }, timeOut)


    $rootScope.title = '';
    var updateTitle = function () {
      var title = $translate.instant('APP_NAME') + $translate.instant('VERSION_STRING') + ' - ' + $translate.instant('Attendance Management System');
      $rootScope.title = title;
    };

    $scope.menu = [{
      'title': $translate.instant('HOME'),
      'link': '/'
    }];
    $scope.loginuser = null;

    $scope.isCollapsed = true;

    $http.get('/viewapi/navbar.json')
      .success(function (data, status) {
        console.log({
          status: status,
          data: data
        });
        _(data).each(function (menu) {
          if (_.startsWith(menu.link, '/user/')) {
            $scope.loginuser = menu;
          } else {
            $scope.menu.push(menu);
          }
        });
        updateTitle();
      })
      .error(function (data, status) {
        console.log({
          status: status,
          data: data
        });
        updateTitle();
      });

    $scope.signout = function () {
      $location.path('/auth/signout');
    };

    $scope.isActive = function (route) {
      return route === $location.path();
    };
  }]);
