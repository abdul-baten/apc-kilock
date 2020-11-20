'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    //    var userAgent = window.navigator.userAgent.toLowerCase();
    var template = 'app/attendance/attendance.html';
    var logTemplate = 'app/attendance/logfile.html';
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if ($(window).width() < 768) {
      template = 'app/attendance/attendance_sp.html';
    }
    $routeProvider
      .when('/', {
        templateUrl: template,
        controller: 'AttendanceLogCtrl'
      })
      .when('/user/:userId/attendance', {
        templateUrl: template,
        controller: 'AttendanceLogCtrl'
      })
      .when('/attendance/difference-log/', {
        templateUrl: logTemplate,
        controller: 'AttendanceLogCtrl'
      });
  });
