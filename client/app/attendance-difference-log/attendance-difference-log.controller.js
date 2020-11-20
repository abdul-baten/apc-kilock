"use strict";

angular.module("serverAttendApiApp").controller("AttendanceDifferenceLogCtrl", [
  "$scope",
  "$http",
  function (
    $scope,
    $http
  ) {

    $http({
        method: "GET",
        url: "/viewapi/timecardmismatch.json",
      })
      .success(function (data, status) {
        console.log({
          data: data,
          status: status
        });
        $scope.attendanceDifferenceLogs = data.timecardlog;
      })
      .error(function (data, status) {
        console.log({
          status: status,
          data: data
        });
      });

  }
]);
