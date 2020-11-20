'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var template = 'app/resttime/resttime.html';
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      template = 'app/resttime/resttime_sp.html';
    }

    $routeProvider
      .when('/resttime', {
        templateUrl: template,
        controller: 'ResttimeCtrl'
      })
      .when('/resttime/:userId', {
        templateUrl: template,
        controller: 'ResttimeCtrl'
      });
  });
