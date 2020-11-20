'use strict';

angular.module('serverAttendApiApp')
  .controller('MailInputCtrl', ['$scope', '$http', '$routeParams', '$location', '$translate', function ($scope, $http, $routeParams, $location, $translate) {

    /**
     * メールアドレス登録を行う。
     */
    $scope.submit = function () {
      var api = '/viewapi/mailregistration/register/' + $routeParams.userId + '/' + $routeParams.uuid;

      $http.post(api, {mail: $scope.mail}).success(function (data, status) {
        $scope.errorMessage = '';
        $scope.infoMessage = 'メールアドレスの登録が完了いたしました。';
      }).error(function (data, status) {
        $scope.infoMessage = '';
        if (status === 400) {
          $scope.errorMessage = 'メールアドレスの形式を確認してください。';
        }
      });
    };

  }]);
