'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {

    var listTemplate = 'app/user/list/list.html';
    var registerTemplate = 'app/user/register/register.html';


    var deviceTemplate = 'app/user/device/device.html';
    var maillistTemplate = 'app/user/maillist/maillist.html';


    // 画面幅が768以下の場合は表示テンプレートを切り替える
    if( $(window).width() < 768 ){
      listTemplate = 'app/user/list/list_sp.html';
      registerTemplate = 'app/user/register/register_sp.html';
      deviceTemplate = 'app/user/device/device_sp.html';
      maillistTemplate = 'app/user/maillist/maillist_sp.html';
    }

    $routeProvider
      .when('/users/', {
        templateUrl: listTemplate,
        controller: 'UserListCtrl',
        reloadOnSearch: false,
      })
      .when('/user/register', {
        templateUrl: registerTemplate,
        controller: 'UserCtrl'
      })
      .when('/user/:userId', {
        templateUrl: registerTemplate,
        controller: 'UserCtrl'
      })
      .when('/user/:userId/device', {
        templateUrl: deviceTemplate,
        controller: 'UserDeviceCtrl'
      })
      .when('/user/:userId/maillist', {
        templateUrl: maillistTemplate,
        controller: 'UserMailListCtrl'
      });
  });
