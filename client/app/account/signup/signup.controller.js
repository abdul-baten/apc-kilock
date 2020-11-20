'use strict';

angular.module('serverAttendApiApp')
  .controller('SignupCtrl', function ($scope, $window, $http, $location) {
    $scope.register = { name: null };
    $scope.agreeTerm = false;
    $scope.signupUrl = null;
    $scope.isError = function (name) {
      return { 'has-error': $scope.error && $scope.errorParams.indexOf(name) !== -1 };
    };
    $scope.submit = function () {
      if (!$scope.signupUrl) {
        return;
      }
      $http({
        method: 'POST',
        url: $scope.signupUrl,
        data: {
          name: $scope.register.name,
        },
      })
      .success(function (data, status) {
        console.log({data: data, status: status});
        if (data.redirect) {
          $location.path(data.redirect);
        }
      })
      .error(function (data, status) {
        console.log({data: data, status: status});
      });
    };

    $http.get('/auth/signup.json')
    .success(function (data, status) {
      console.log({data: data, status: status});
      if (!data) {
        return;
      }
      if (data.redirect) {
        $location.path(data.redirect);
      }
      if (data.register) {
        $scope.register = data.register;
        switch ($scope.register.authType) {
          case 'google':
            $scope.signupUrl = '/auth/google/signup.json';
            break;
          case 'twitter':
            $scope.signupUrl = '/auth/twitter/signup.json';
            break;
          case 'facebook':
            $scope.signupUrl = '/auth/facebook/signup.json';
            break;
          case 'github':
            $scope.signupUrl = '/auth/github/signup.json';
            break;
          case 'cas':
            $scope.signupUrl = '/auth/cas/signup.json';
            break;
          case 'local':
            $scope.signupUrl = '/auth/local/signup.json';
            break;
          default:
            $window.location.href = '/auth/signin';
            break;
        }
      } else {
        $window.location.href = '/auth/signin';
      }
    })
    .error(function (data, status) {
      console.error({data: data, status: status});
    });
  });
