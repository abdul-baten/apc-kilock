'use strict';

//var _ = window.lodash;

angular.module('serverAttendApiApp')
  .controller('MailTemplateEditorCtrl', ['$scope', '$http', '$translate', function ($scope, $http, $translate) {

    $scope.maxTextLength = 0;
    //$scope.editingTemplate || ($scope.editingTemplate = {});
    //$scope.editingTemplate.text || ($scope.editingTemplate.text = '');

    var disableSaveButton = function () {
      var button = angular.element('#saveButton');
      button.disabled = true;
    };

    $scope.clear = function () {
      $scope.editingTemplate.text = '';
    };

    $scope.save = function () {
      var template = $scope.editingTemplate;
      var urlStr = '/viewapi/mail-templates/' + template.passTypeId + '.json';

      var req = {
        method: 'PUT',
        url: urlStr,
        data: template,
      };

      $http(req).success(function (data, status) {
        console.log({status:status, data: data});
      })
      .error(function (data, status) {
        console.log({status:status, data: data});
        //revert
        var data = $scope.passTypeInfos;
        var ids = _.map(data, function (passTypeInfo) {
          return passTypeInfo.id;
        });

        var idx = _.indexOf(ids, template.passTypeId);
        if (idx < 0) {
          //panic
          return;
        }
        $scope.passTypeTabClickHandler(data[idx]);
      });
    };

    $scope.passTypeTabClickHandler = function (passTypeInfo) {
      $scope.maxTextLength = 0;
      $scope.editingTemplate = null;

      $http({
        method: 'GET',
        url: '/viewapi/mail-templates/' + passTypeInfo.id + '.json',
      })
      .success(function (data, status) {
        console.log({status:status, data: data});
        if (!_.isPlainObject(data)) {
          //TODO:
          return;
        }
        var maxTextLength = passTypeInfo.maxTextLength || 100;
        $scope.maxTextLength = maxTextLength;
        $scope.editingTemplate = data;
      })
      .error(function (data, status) {
        console.log({status:status, data: data});
      });
    };

    $scope.currentLinkClass = function (passTypeInfo) {
      var isActive = ($scope.editingTemplate && $scope.editingTemplate.passTypeId === passTypeInfo.id);
      return {
        'active': isActive,
      };
    };


    $scope.$watch('editingTemplate.text', function () {
      var length = 0;
      var model = $scope.editingTemplate;
      if (model && model.text) {
        length = model.text.length;
      }
      var numLeft = $scope.maxTextLength - length;
      $scope.numCharsLeft = numLeft.toString();
    });

    $scope.$watch('editingTemplate.subject', function () {
      var length = 0;
      var model = $scope.editingTemplate;
      if (model && model.subject) {
        length = model.subject.length;
      }
    });

    disableSaveButton();

    $http({
      method: 'GET',
      url: '/viewapi/passtypes.json',
    })
    .success(function (data, status) {
      console.log({status:status, data: data});
      if (data.length === 0) {
        return;
      }
      $scope.passTypeInfos = data;
      $scope.passTypeTabClickHandler(data[0]);
    })
    .error(function (data, status) {
      console.log({status:status, data: data});
    });

  }])
;
