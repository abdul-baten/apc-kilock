'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var statusTemplate = 'app/attendance-status/list/list.html';
    var logTemplate = 'app/attendance-status/log/log.html';

    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      statusTemplate = 'app/attendance-status/list/list_sp.html';
      logTemplate = 'app/attendance-status/log/log_sp.html';
    }

    $routeProvider
      .when('/attendance-status', {
        templateUrl: statusTemplate,
        controller: 'AttendanceStatusListCtrl',
        reloadOnSearch: false,
      })
      .when('/attendance-status-log', {
        templateUrl: logTemplate,
        controller: 'AttendanceStatusLogCtrl',
        reloadOnSearch: false,
      })
  });
