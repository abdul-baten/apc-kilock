'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var passhistories = 'app/passhistories/passhistories.html';
    
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      passhistories = 'app/passhistories/passhistories_sp.html';
    }

    $routeProvider
      .when('/user/:userId/passhistories', {
        templateUrl: passhistories,
        controller: 'PassHistoriesCtrl'
      })
      .when('/passhistories/all', {
        templateUrl: passhistories,
        controller: 'PassHistoriesAllCtrl'
      });
  });
