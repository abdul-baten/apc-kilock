'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var template = 'app/mail-template-editor/mail-template-editor.html';
    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      template = 'app/mail-template-editor/mail-template-editor.html';
    }

    $routeProvider
      .when('/mail-template-editor', {
        templateUrl: template,
        controller: 'MailTemplateEditorCtrl'
      });
  });
