'use strict';

angular.module('serverAttendApiApp')
  .controller('ResttimeTemplateCtrl', ['$scope', '$http', '$translate', '$filter', function ($scope, $http, $translate, $filter) {

  // 2重送信防止用
  $scope.requesting = false;

  $scope.restTimeTemplates = [];
  $scope.deleteRestTimeTemplates = [];

  function clearMessage() {
    $scope.template_errors = [];
    $scope.messages = [];
  }

  // 初期読み込み
  loadRestTimeTemplates();

  // サーバーからの取得処理
  function loadRestTimeTemplates() {
    $http({
      method: 'GET',
      url: '/viewapi/resttime-templates.json',
      params: {},
    })
    .success(function (data, status) {
      console.log({status:status, data: data});

      $scope.restTimeTemplates = data.restTimeTemplates;
      $scope.restTimeTemplates.forEach(function(restTimeTemplate) {
        restTimeTemplate.times.forEach(function(time) {
          var startTimes = time.start.split(':');
          var endTimes   = time.end.split(':');
          time.start = new Date(1970, 0, 1, startTimes[0], startTimes[1], 0);
          time.end   = new Date(1970, 0, 1, endTimes[0], endTimes[1], 0);
        });
      });
    });
  }

  // 休憩時間追加時
  $scope.buttonRestTimeAddClick = function(restTimeTemplate) {
    clearMessage();
    restTimeTemplate.times.push({
      start: new Date(1970, 0, 1, 0, 0, 0),
      end:   new Date(1970, 0, 1, 0, 0, 0),
    });
  };

  $scope.buttonRestTimeRemoveClick = function(restTimeTemplate, index) {
    clearMessage();
    restTimeTemplate.times.splice(index, 1);
  };

  // テンプレート追加時
  $scope.buttonRestTimeTemplateAddClick = function() {
    clearMessage();
    $scope.restTimeTemplates.push({
      id:   '',
      name: '',
      times:           [{
        start: new Date(1970, 0, 1, 0, 0, 0),
        end:   new Date(1970, 0, 1, 0, 0, 0),
      }],
      errorMessage:  '',
      modified:      true,
      isManualAdded: true,
    });
  };

  // テンプレート削除時
  $scope.buttonRestTimeTemplateRemoveClick = function(restTimeTemplate) {
    clearMessage();
    var index = $scope.restTimeTemplates.indexOf(restTimeTemplate);
    if (restTimeTemplate.isManualAdded) {
      $scope.restTimeTemplates.splice(index, 1);
    } else {
      $scope.deleteRestTimeTemplates.push(restTimeTemplate);
      $scope.restTimeTemplates.splice(index, 1);
    }
  };

  // 休憩時間変更時
  $scope.restTimePickerChange = function($event, form, restTimeTemplate, restTime, ftflg) {
    clearMessage();
//    var index = $scope.restTimeTemplates.indexOf(restTimeTemplate);
//    if (index >= 0) {
//      if (restTime.start > restTime.end) {
//        if (ftflg == 'from'){
//          restTime.end = angular.copy(restTime.start);
//        } else {
//          restTime.start = angular.copy(restTime.end);
//        }
//      }
//      $scope.restTimeTemplates.splice(index, 1, restTimeTemplate);
//    }
  }

  // テンプレート名変更時
  $scope.templateNameChange = function($event, form, restTimeTemplate) {
    clearMessage();
    var index = $scope.restTimeTemplates.indexOf(restTimeTemplate);
    if (index >= 0) {
      $scope.restTimeTemplates.splice(index, 1, restTimeTemplate);
    }
  }

  // 登録ボタンクリック時
  $scope.buttonSendTemplateClick = function() {
    clearMessage();
    if ($scope.validateRestTimes()) {
      // 送信用にオブジェクトを複製
      var sendTemplates = angular.copy($scope.restTimeTemplates);

      // テンプレートの時間を変換
      sendTemplates.forEach(function(restTimeTemplate) {
        restTimeTemplate.times.forEach(function(time) {
          time.start = $filter('date')(time.start, 'HH:mm');
          time.end   = $filter('date')(time.end, 'HH:mm');
        });
      });

      // 2重送信防止
      if (!$scope.requesting) {
        // リクエスト状態更新
        $scope.requesting = true;

        $http({
          method: 'POST',
          url: '/viewapi/resttime-templates.json',
          data: {
            templates:        JSON.stringify(sendTemplates),
            deleteTemplates:  JSON.stringify($scope.deleteRestTimeTemplates),
          }
        }).success(function (data, status) {
          console.log({status:status, data: data});
          loadRestTimeTemplates();
          $scope.messages = ['登録しました'];

          // リクエスト状態更新
          $scope.requesting = false;

        }).error(function (data, status) {
          console.log({status:status, data: data});

          // リクエスト状態更新
          $scope.requesting = false;
        });
      }
    }
  };

  // クリアボタンクリック時
  $scope.buttonClearTemplateClick = function() {
    clearMessage();
    loadRestTimeTemplates();
    $scope.deleteRestTimeTemplates = [];
  }

  // 入力チェックを行います。
  function validateInput(param) {
    var validateResult = true;

    if(!angular.isDefined(param) || param == '' || param == null) {
      validateResult = false;
    }
    return validateResult;
  }

  // バリデーション時間
  $scope.validateRestTimes = function() {
    var validateResult = true;
    var keepRestTimeCheck = true;

    // 休憩時間の相互チェック
    $scope.restTimeTemplates.forEach(function(restTimeTemplate) {
      var resttimeArray = [];
      restTimeTemplate.errorMessage = '';
      restTimeTemplate.templateNameErrorMessage = '';
      if (!angular.isDefined(restTimeTemplate.name) || restTimeTemplate.name == '') {
        restTimeTemplate.templateNameErrorMessage = $translate.instant('MSG_REST_TIME_TEMPLATE_NAME');
        validateResult = false;
      }

      // 休憩時間の相互チェック
      restTimeTemplate.times.forEach(function(time) {
        if (!validateInput(time.start) || !validateInput(time.end)) {
          restTimeTemplate.errorMessage = $translate.instant('MSG_REST_TIME_TIME_ERROR');;
          keepRestTimeCheck = false;
          validateResult = false;
        }

        if (keepRestTimeCheck) {
//          if (time.start >= time.end) {
//            restTimeTemplate.errorMessage = $translate.instant('MSG_REST_TIME_TIME_ERROR');
//            keepRestTimeCheck = false;
//            validateResult = false;
//          }
          resttimeArray.push(time);
        }
      });

      if (keepRestTimeCheck) {
        // 休憩時間を開始時間でソート
        resttimeArray.sort(function(a,b) {
          if(a.start < b.start) return -1;
          if(a.start > b.start) return 1;
          return 0;
        });

        // 前後の終了、開始時間に前後がある場合はNG
        resttimeArray.forEach(function(restTime, index) {
          if (keepRestTimeCheck) {
            if (index + 1 < resttimeArray.length && restTime.end >= resttimeArray[index+1].start) {
              restTimeTemplate.errorMessage = $translate.instant('MSG_REST_TIME_TIME_OVER');
              keepRestTimeCheck = false;
              validateResult = false;
            }
          }
        });
      }

      keepRestTimeCheck = true;
    });

    return validateResult;
  }

  $scope.restTimeTimePickerErrorClass = function(form, restTime) {
    return {
      'has-error': form.apiError  || $scope.restTimeTimePickerError(form, restTime)
    };
  };

  $scope.restTimeTimePickerError = function(form, restTime) {
    return angular.isDefined(restTime.start) && restTime.start.$viewValue !== '' && restTime.start.$invalid;
  };
}]);
