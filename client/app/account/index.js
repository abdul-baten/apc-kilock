'use strict';

angular.module('serverAttendApiApp')
  .config(function ($routeProvider) {
    $routeProvider
      .when('/auth/signin', {
        templateUrl: 'app/account/signin/index.html',
        controller: 'SigninCtrl',
      })
      .when('/auth/signup', {
        templateUrl: 'app/account/signup/index.html',
        controller: 'SignupCtrl',
      })
      .when('/auth/signout', {
        templateUrl: 'app/account/signout/index.html',
        controller: 'SignoutCtrl'
      })
      .when('/auth/:path', {
        templateUrl: 'app/account/signin/index.html',
        controller: function ($window, $routeParams) {
          $window.location.href = '/auth/' + $routeParams.path;
        },
      });
  });
