'use strict';

angular.module('serverAttendApiApp')
  .controller('PassHistoriesAllCtrl', ['$scope', '$http', '$translate', function ($scope, $http, $translate) {
    $http({
      method: 'GET',
      url: '/viewapi/passhistories.json',
      params: {
        limit: 100,
      },
    })
    .success(function (data, status) {
      console.log({status:status, data: data});
      $scope.passHistories = data;
    })
    .error(function (data, status) {
      console.log({status:status, data: data});
    });
  }])
  .controller('PassHistoriesCtrl', ['$scope', '$http', '$routeParams', '$translate', function ($scope, $http, $routeParams, $translate) {
    $http({
      method: 'GET',
      url: '/viewapi/passhistories.json',
      params: {
        userId: $routeParams.userId,
      },
    })
    .success(function (data, status) {
      console.log({status:status, data: data});
      $scope.passHistories = data;
    })
    .error(function (data, status) {
      console.log({status:status, data: data});
    });
  }])
;
