'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var template = 'app/approve/overtime/overtime.html';
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      template = 'app/approve/overtime/overtime_sp.html';
    }


    $routeProvider
      .when('/approve/overtime', {
        templateUrl: template,
        controller: 'OvertimeRequestApproveCtrl'
      });
  });
