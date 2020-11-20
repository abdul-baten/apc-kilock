'use strict';

angular.module('serverAttendApiApp')
  .controller('DoorListCtrl', ['$scope', '$http', '$translate', function ($scope, $http, $translate) {
    $scope.users = [];
    $scope.isShowNewRegister = false;
    $http.get('/viewapi/doors.json')
    .success(function (data, status) {
      console.log({status:status, data: data});
      $scope.doors = data.doors;
      $scope.isShowNewRegister = data.showNewRegister;
    })
    .error(function (data, status) {
      console.log({status:status, data: data});
    });
    $scope.showNewRegister = function () {
      return $scope.isShowNewRegister;
    };
    $scope.showEdit = function (door) {
      return door.showEdit;
    };
  }]);
