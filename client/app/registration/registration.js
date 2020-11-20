'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {
    $routeProvider
      .when('/registration/mail/:userId/:uuid', {
        templateUrl: 'app/registration/mail/input.html',
        controller: 'MailInputCtrl'
      });
  });
