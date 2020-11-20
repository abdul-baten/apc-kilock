'use strict';

angular.module('serverAttendApiApp')
  .controller('UserDeviceCtrl', ['$scope', '$http', '$routeParams', '$translate', function ($scope, $http, $routeParams, $translate) {
    $scope.onetomecode = null;
    $http({
      method: 'GET',
      url: '/viewapi/device.json',
      params: {
        userId: $routeParams.userId,
      },
    })
    .success(function (data, status) {
      //console.log({status:status, data: data});
      $scope.user = data;
    })
    .error(function (data, status) {
      console.log({status:status, data: data});
    });
    $scope.post = function () {
      $scope.onetimetoken = null;
      $http({
        method: 'POST',
        url: '/viewapi/device.json',
        params: {
          userId: $scope.user.id,
        },
      })
      .success(function (data, status) {
        //console.log({status:status, data: data});
        $scope.user = data;
        $scope.onetimetoken = data.onetimetoken;
      })
      .error(function (data, status) {
        console.log({status:status, data: data});
      });
    };
    $scope.isShowCode = function () {
      return !!$scope.onetimetoken;
    };

    $scope.$watchCollection('user.devices', function() {
      var user = $scope.user;
      if (user == null) {
        $scope.deviceStatusMessage = $translate.instant('デバイス未登録');
        $scope.shouldDisableOnetimeToken = true;
      }
      else {
        if (user.devices == null) {
          user.hasDevice = false;
          $scope.shouldDisableOnetimeToken = false;
        }
        else {
          user.hasDevice = user.devices.length > 0;
          $scope.shouldDisableOnetimeToken = user.devices.length >= user.maxNumOfDevices;
        }
        $scope.deviceStatusMessage = user.hasDevice ? $translate.instant('デバイス登録済み') : $translate.instant('デバイス未登録');
      }
    });

    var deleteToken = function (token, callback) {
      $scope.onetimetoken = null;
      var req = {
        method:'DELETE',
        url: '/viewapi/device.json',
        params: {
          token: token,
        },
      };

      $http(req)
      .success(function (data, status) {
        if (!callback) { return; }
        var err = null;
        if (status != 200) {
          err = new Error();
        }
        callback(err, null);
      })
      .error(function (data, status) {
        console.log({status:status, data: data});
        if (!callback) { return; }
        callback(new Error(), null);
      });
    };

    $scope.buttonCancelAlertClick = function () {
      // reimp me.
    };

    $scope.buttonOtherAlertClick = function () {
      // reimp me.
    };

    $scope.buttonDeleteDeviceClick = function (device) {
      var modalAlert = angular.element("#modalAlert");
      $scope.modalAlertTitle = $translate.instant('Delete device') + ': ' + device.name;
      $scope.modalAlertMessage = $translate.instant('Are you sure?');
      $scope.modalAlertOtherButtonTitle = 'OK';
      $scope.buttonOtherAlertClick = function () {
        deleteToken(device.token, function (err, __unused) {
          modalAlert.modal('hide');
          if (err) {
            return;
          }
          var user = $scope.user;
          if (!user) {
            return;
          }
          var idx = _.indexOf(user.devices, device);
          if (idx < 0 || user.devices.length <= idx) {
            return;
          }
          user.devices.splice(idx, 1);
        });
      };

      modalAlert.modal('show');
    };
  }]);
