'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    //    var userAgent = window.navigator.userAgent.toLowerCase();
    var template = 'app/attendance-difference-log/attendance-difference-log.html';
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if ($(window).width() < 768) {
      template = 'app/attendance-difference-log/attendance-difference-log.html';
    }
    $routeProvider
      .when('/attendance-difference-log', {
        templateUrl: template,
        controller: 'AttendanceDifferenceLogCtrl'
      });
  });
