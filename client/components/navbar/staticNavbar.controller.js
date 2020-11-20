'use strict';

angular.module('serverAttendApiApp')
  .controller('StaticNavbarCtrl', function ($translate, $rootScope) {

    $rootScope.title = '';
    var updateTitle = function () {
      var title = $translate.instant('APP_NAME') + $translate.instant('VERSION_STRING') + ' - ' + $translate.instant('Attendance Management System');
      $rootScope.title = title;
    };
    updateTitle();
  });
