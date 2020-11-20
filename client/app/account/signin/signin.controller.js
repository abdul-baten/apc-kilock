'use strict';

angular.module('serverAttendApiApp')
  .controller('SigninCtrl', function ($scope, $window, $http, $location, $interval) {
    $scope.signins = {
      googlePlus: false,
      google: false,
      twitter: false,
      facebook: false,
      github: false,
      cas: false,
    };
    $scope.signin = false;
    $scope.agreeTerm = false;
    $scope.retrySigninButton = false;
    $scope.retrySigninDone = false;
    $scope.isError = function (name) {
      return { 'has-error': $scope.error && $scope.errorParams.indexOf(name) !== -1 };
    };
    // Google Sign-In
    $scope.googleSigninSetup = function (clientId) {
      if (!clientId) {
        return;
      }
      var po = document.createElement('script');
      po.type = 'text/javascript';
      po.async = true;
      po.src = 'https://plus.google.com/js/client:plusone.js?onload=googleSignStart';
      var s = document.getElementsByTagName('script')[0];
      s.parentNode.insertBefore(po, s);
      $scope.googlePlusClientId = clientId;
    };
    $window.googleSignStart = function () {
      $scope.signins.googlePlus = true;
      $scope.$apply();
    };
    $window.googleSignInCallback = function (authResult) {
      // cross-origin問題回避のため直接emitしない
      $scope.authResult = authResult;
    };
    $scope.retrySignin = function () {
      $scope.retrySigninDone = true;
      $scope.$emit('googleSignInCallback', $scope.authResult);
    };
    var checkAuth = $interval(function () {
      if ($scope.authResult) {
        $interval.cancel(checkAuth);
        $scope.$emit('googleSignInCallback', $scope.authResult);
      }
    }, 500);
    $scope.$on('googleSignInCallback', function (event, authResult) {
      if (!authResult || !authResult.access_token) {
        return;
      }
      $scope.signin = true;
      $http({
        method: 'POST',
        url: '/auth/googleplus/callback.json',
        data: authResult,
      })
      .success(function (data, status) {
        console.log({data: data, status: status});
        if (!data) {
          return;
        }
        if (data.redirect) {
          $location.path(data.redirect);
        }
      })
      .error(function (data, status) {
        if (data && data.redirect) {
          $window.location.href = data.redirect;
        } else if (status) {
          console.error({data: data, status: status});
          $window.location.href = '/auth/signin';
        } else {
          console.log({data: data, status: status});
          $scope.retrySigninButton = true;
          $scope.retrySigninDone = false;
        }
      });
    });
    // authentication list
    $http.get('/auth/auth.json')
    .success(function (data, status) {
      console.log({data: data, status: status});
      if (data.redirectPath) {
        $location.path(data.redirectPath);
        return;
      }
      if (data.googleplus) {
        $scope.googleSigninSetup(data.googleplus.clientId);
      }
      $scope.signins.google = !!data.google;
      $scope.signins.twitter = !!data.twitter;
      $scope.signins.facebook = !!data.facebook;
      $scope.signins.github = !!data.github;
      $scope.signins.cas = !!data.cas;
      $scope.signins.local = !!data.local;
      var signinCount = _($scope.signins).countBy(function (value) {
        return !!value;
      }).value()[true];
      if (signinCount === 1 && $scope.signins.cas) {
        $window.location.href = '/auth/cas';
      }
    })
    .error(function (data, status) {
      console.error({data: data, status: status});
    });
  });
