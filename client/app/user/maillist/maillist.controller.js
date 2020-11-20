'use strict';

angular.module('serverAttendApiApp')
  .controller('UserMailListCtrl', function ($scope, $http, $routeParams, $translate) {
    $http({
      method: 'GET',
      url: '/viewapi/maillist.json',
      params: {
        userId: $routeParams.userId,
      },
    })
    .success(function (data) {
      $scope.user = data;
    })
    .error(function (data, status) {
      console.log({status:status, data: data});
    });
    $scope.cancel = function () {
    };
    $scope.deleteFamilyUser = function (familyUser) {
      var modalAlert = angular.element('#modalAlert');
      $scope.modalAlertTitle = $translate.instant('Delete mail address') + ': ' + familyUser.mail;
      $scope.modalAlertMessage = $translate.instant('Are you sure?');
      $scope.accept = function () {
        modalAlert.modal('hide');
        $http({
          method: 'DELETE',
          url: '/viewapi/maillist.json',
          params: {
            userId: $routeParams.userId,
            mail: familyUser.mail,
          },
        })
        .success(function () {
          var user = $scope.user;
          if (!user) {
            return;
          }
          var idx = _.indexOf(user.family, familyUser);
          if (idx < 0 || user.family.length <= idx) {
            return;
          }
          user.family.splice(idx, 1);
        })
        .error(function (data, status) {
          console.log({status:status, data: data});
        });
      };

      modalAlert.modal('show');
    };
  });
