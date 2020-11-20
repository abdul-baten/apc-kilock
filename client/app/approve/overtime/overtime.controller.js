'use strict';

angular.module('serverAttendApiApp')
  .controller('OvertimeRequestApproveCtrl', ['$scope', '$http', '$routeParams', '$translate', function ($scope, $http, $routeParams, $translate) {
    $http({
      method: 'GET',
      url: '/viewapi/overtimerequest.json'
    })
      .success(function (data, status) {
        $scope.overtimeRequests = data;
      })
      .error(function (data, status) {
      });

    /**
     * 与えられた数値に対して2桁のゼロパディングを行う
     * @param value ゼロパディングを行う値
     * @returns string
     */
    var zeroPadding = function (value) {
      return ('0' + value).slice(-2);
    };

    /**
     * 残業予定日を表示
     * @param overtimeRequest 残業申請
     * @returns string yyyy/mm/ddフォーマットの日付(ゼロパディング対応)
     */
    $scope.displayOvertimeRequestDate = function (overtimeRequest) {
      if (!overtimeRequest) return '';

      return overtimeRequest.year + '/' + zeroPadding(overtimeRequest.month) + '/' + zeroPadding(overtimeRequest.day);
    };

    /**
     * 残業予定時刻を表示
     * @param overtimeRequest 残業申請
     * @return string hh:mmフォーマットの時刻(ゼロパディング対応)
     */
    $scope.displayOvertimeRequestTime = function (overtimeRequest) {
      if (!overtimeRequest) return '';

      return zeroPadding(overtimeRequest.hour) + ':' + zeroPadding(overtimeRequest.minute);
    };

    /**
     * 残業申請フォームを隠す。
     */
    $scope.hideConfirmDialog = function () {
      delete $scope.editOvertimeRequest;
      delete $scope.editOvertimeRequestIndex;
      angular.element('#overtimeRequestConfirm').modal('hide');
    };

    /**
     * 残業申請の確認フォームを表示する。
     * @param overtimeRequest 残業申請情報
     * @param index 残業申請情報の要素番号
     */
    $scope.displayConfirmDialog = function (overtimeRequest, index) {
      $scope.editOvertimeRequest = overtimeRequest;
      $scope.editOvertimeRequestIndex = index;
      angular.element('#overtimeRequestConfirm').modal('show');
    };

    /**
     * 残業申請を許可する
     */
    $scope.acceptOvertimeRequest = function () {
      kickOvertimeRequestAPI(1);
    };

    /**
     * 残業申請を許可しない
     */
    $scope.refuseOvertimeRequest = function () {
      kickOvertimeRequestAPI(2);
    };

    /**
     * 残業申請を差し戻す
     */
    $scope.remandOvertimeRequest = function () {
      kickOvertimeRequestAPI(3);
    };

    /**
     * 残業申請APIを叩く
     * @param approveStatus 残業申請ステータス
     */
    var kickOvertimeRequestAPI = function (approveStatus) {
      $http({
        method: 'PUT',
        url: '/viewapi/overtimerequest.json',
        params: {
          requestUserId: $scope.editOvertimeRequest.requestUser._id,
          approveStatus: approveStatus,
          remandReason: $scope.remandReasonText,
          year: $scope.editOvertimeRequest.year,
          month: $scope.editOvertimeRequest.month,
          day: $scope.editOvertimeRequest.day
        }
      }).success(function (data, status) {
        // 残業申請の承認・非承認を行った要素を削除する
        $scope.overtimeRequests.splice($scope.editOvertimeRequestIndex, 1);
        $scope.hideConfirmDialog();
      }).error(function (data, status) {
        console.error('overtimeApprove error.');
        $scope.hideConfirmDialog();
      });
    };

  }]);
