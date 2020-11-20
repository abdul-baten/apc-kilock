'use strict';

angular.module('serverAttendApiApp')
  .controller('MailInput', ['$scope', '$http', '$translate', function ($scope, $http, $translate) {
    $scope.mailTemplate = {};
    $scope.groups = {};
    $scope.notificationMessage = '';

    var mailTemplateRequestUrl = '/viewapi/sendmail/template.json';
    var mailSendRequestUrl = '/viewapi/sendmail/group.json';
    var groupRequestUrl = '/viewapi/groupTags/groupTags.json';

    $http.get(mailTemplateRequestUrl).success(function (data) {
      $scope.mailTemplate = data;
    }).error(function (data) {
      console.log(data);
    });

    $http.get(groupRequestUrl).success(function (data) {
      $scope.groups = data;
    }).error(function (data) {
      console.log(data);
    });

    $scope.confirm = function () {
      angular.element('#sendingMailConfirm').modal('show');
    };

    $scope.sendMail = function () {

      /**
       * チェックされたすべてのグループの名前を配列で取得する。
       * @returns {Array} チェックされたグループ名の配列
       */
      var createGroupNameList = function () {
        if (!$scope.groups) {
          return [];
        }

        /**
         * チェックが付けられたグループを抽出する
         * @param {Object} group グループ
         * @returns {boolean} チェックが付けられている場合はtrue,それ以外はfalse
         */
        var groupFilterCallback = function (group) {
          return !!(group.checked);
        };

        // タグつきグループの処理
        var sendTargetGroups = _.map($scope.groups.groupTags, function (groupTag) {
          return _.filter(groupTag.groups, groupFilterCallback);
        });

        //タグなしグループの処理
        var noTagSendTargetGroups = _.filter($scope.groups.noTagGroups, groupFilterCallback);
        sendTargetGroups.push(noTagSendTargetGroups);

        var unionizedTagGroups = _.reduce(sendTargetGroups, function (groups1, groups2) {
          return _.union(groups1, groups2);
        });

        return _.pluck(unionizedTagGroups, 'name');
      };

      var requestParameter = {
        subject: $scope.mailTemplate.subject,
        text: $scope.mailTemplate.text,
        groups: createGroupNameList()
      };

      $http.post(mailSendRequestUrl, requestParameter).success(function () {
        $scope.notificationMessage = $translate.instant('MAIN_SEND_SUCCESS_MESSAGE');
        angular.element('#notification').modal('show');
      }).error(function (data) {
        $scope.notificationMessage = $translate.instant('MAIN_SEND_FAILED_MESSAGE');
        angular.element('#notification').modal('show');

        console.log(data);
      });
    };

    $scope.$watch('mailTemplate.text', function () {
      var length = 0;
      var model = $scope.mailTemplate;
      if (model && model.text) {
        length = model.text.length;
      }
      var numLeft = $scope.mailTemplate.textMaxLength - length;
      $scope.numCharsLeft = numLeft.toString();
    });

    $scope.displayNoTagGroups = function (noTagGroups) {
      if (noTagGroups && noTagGroups.length > 0) {
        return true;
      }
      return false;
    };

    $scope.displayGroupsConfirm = function (groups) {
      if (!groups) {
        return false;
      }

      var result = false;
      groups.forEach(function (group) {
        if (group.checked) {
          result = true;
        }
      });

      return result;
    };

  }]);
