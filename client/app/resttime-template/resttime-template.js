'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var template = 'app/resttime-template/resttime-template.html';
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      template = 'app/resttime-template/resttime-template_sp.html';
    }

    $routeProvider
      .when('/resttime-template', {
        templateUrl: template,
        controller: 'ResttimeTemplateCtrl'
      });
  });
