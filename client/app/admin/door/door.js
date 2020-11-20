'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var template = 'app/admin/door/list/doors.html';
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      template = 'app/admin/door/list/doors_sp.html';
    }

    $routeProvider
      .when('/admin/doors', {
        templateUrl: template,
        controller: 'DoorListCtrl'
      });
  });
