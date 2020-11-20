'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var template = 'app/mail/send/input/input.html';
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      template = 'app/mail/send/input/input_sp.html';
    }

    $routeProvider
      .when('/mail/send', {
        templateUrl: template,
        controller: 'MailInput',
      });
  });
