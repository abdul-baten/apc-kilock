'use strict';

//var _ = window.lodash;

angular.module('serverAttendApiApp')
  .controller('ResttimeCtrl', ['$scope', '$http', '$routeParams','$location', '$translate', '$filter', function ($scope, $http, $routeParams, $location, $translate, $filter) {

  $scope.userId = $routeParams.userId;
  $scope.userUrl = '/user';
  if ($scope.userId !== undefined && $scope.userId !== null) {
    $scope.userUrl = '/user/' + $scope.userId + '/attendance';
  }

  // 2重送信防止用
  $scope.requesting = false;

  $scope.restTimes = [];
  $scope.deleteRestTimes = [];

  function clearMessage() {
    $scope.errors = [];
    $scope.messages = [];
  }

  // 初期読み込み
  loadRestTime();

  // サーバーからの取得処理
  function loadRestTime() {
    $http({
      method: 'GET',
      url: '/viewapi/resttime.json',
      params: {
        userId: $scope.userId,
      },
    })
    .success(function (data, status) {
      console.log({status:status, data: data});

      $scope.restTimes = data.restTimes;
      $scope.restTimes.forEach(function(restTime) {
        restTime.period = {
          start: new Date(restTime.period.start),
          end:   new Date(restTime.period.end),
        };
        restTime.times.forEach(function(time) {
          convertStartEndTimeToDate(time);
        });
      });
    });
  };

  // 休憩時間追加ボタンクリック時(モーダル表示)
  $scope.buttonAddRestTimeClick = function() {
    clearMessage();
    $http({
      method: 'GET',
      url: '/viewapi/resttime-templates.json',
    }).success(function (data, status) {
      console.log({status: status, data: data});

      $scope.restTimeTemplates = data.restTimeTemplates;
      $scope.restTimeTemplates.forEach(function(restTimeTemplate) {
        restTimeTemplate.times.forEach(function(time) {
          convertStartEndTimeToDate(time);
        });
      });

      $scope.addRestTime = {
        id: '',
        period: {
          start: new Date(),
          end: new Date((new Date()).getTime() + 86400000),
        },
        errorMessage:  '',
        times:     [{
          start: new Date(1970, 0, 1, 0, 0, 0),
          end:   new Date(1970, 0, 1, 0, 0, 0),
        }],
        isManualAdded: true,
      };

      angular.element("#restTimeModalInput").modal({
        backdrop: 'static'
      });
    }).error(function (data, status) {
      console.error({status: status, data: data});

      if (data.errors.length > 0) {
        $scope.errors = data.errors;
      }
    });
  };

  var convertStartEndTimeToDate = function(time) {
    var startTimes = time.start.split(':');
    var endTimes   = time.end.split(':');
    time.start = new Date(1970, 0, 1, startTimes[0], startTimes[1], 0);
    time.end   = new Date(1970, 0, 1, endTimes[0], endTimes[1], 0);
  };

  // 休憩時間追加時
  $scope.buttonRestTimeAddClick = function(restTime) {
    clearMessage();
    restTime.times.push({
      start: new Date(1970, 0, 1, 0, 0, 0),
      end:   new Date(1970, 0, 1, 0, 0, 0),
    });
  };

  // 休憩時間削除時
  $scope.buttonRestTimeRemoveClick = function(restTimeTemplate, index) {
    clearMessage();
    restTimeTemplate.times.splice(index, 1) ;
  };

  // テンプレート選択
  $scope.changeRestTimeTemplate = function(restTimeTemplate) {
    $scope.addRestTime.times = $scope.selectRestTimeTemplate.times;
  };

  // 追加ボタンクリック時
  $scope.buttonAddRestTimeConfigClick = function() {
    clearMessage();
    if ($scope.validateRestTime($scope.addRestTime)) {
      $scope.restTimes.push($scope.addRestTime);
      delete $scope.addRestTime;
      angular.element("#restTimeModalInput").modal('hide');
    }
  };

  // キャンセルボタンクリック時
  $scope.buttonCloseRestTimeModal = function() {
    clearMessage();
    delete $scope.addRestTime;
    angular.element("#restTimeModalInput").modal('hide');
  };

  // 設定休憩時間全体のバリデーションチェックを行います。
  $scope.validateRestTimes = function(restTimes) {
    var validateResult = true;
    $scope.errors = [];

    // 入力チェック
    restTimes.forEach(function(restTime) {
      if (!$scope.validateRestTime(restTime)) {
        validateResult = false;
      }
    });

    // 対象期間の相互チェック
    if (validateResult) {
      // ソートオブジェクトを複製
      var sortRestTimes = angular.copy(restTimes);

      // 期間をを開始日でソート
      sortRestTimes.sort(function(a, b) {
        if (a.period.start < b.period.start) return -1;
        if (a.period.start > b.period.start) return 1;
        return 0;
      });

      var keepRestTimeCheck = true;
      sortRestTimes.forEach(function(sortRestTime, index) {
        if (keepRestTimeCheck) {
          if (sortRestTime.period.end == null || sortRestTime.period.end.toString() === "Invalid Date") {
            // 終了日が未入力のため、未来日(3000年)を設定
            sortRestTime.period.end = new Date(3000, 0, 1, 0, 0, 0);
          }

          if (index + 1 < sortRestTimes.length && sortRestTime.period.end >= sortRestTimes[index+1].period.start) {
            $scope.errors = [$translate.instant('MSG_REST_TIME_TERM_OVER')];
            keepRestTimeCheck = false;
            validateResult = false;
          }
        }
      });
    }

    return validateResult;
  }

  // 休憩時間単体のバリデーションチェックを行います。
  $scope.validateRestTime = function(restTime) {
    var validateResult = true;
    restTime.errorMessage = '';
    restTime.restTimeErrorMessage = '';

    // 日付の入力チェック
    if (!validateInput(restTime.period.start)) {
      // 開始日が未入力
      restTime.errorMessage = $translate.instant('MSG_REST_TIME_TERM_INPUT');;
      return false;
    }
    if (validateInput(restTime.period.end)) {
      if (restTime.period.start > restTime.period.end) {
        // 日付の前後NG
        restTime.errorMessage = $translate.instant('MSG_REST_TIME_TERM_ERROR');
        return false;
      }
    }
    // 時間の整合性チェック
    validateResult = $scope.validateRestTimeTimes(restTime);

    return validateResult;
  }

  // 入力チェックを行います。
  function validateInput(param) {
    var validateResult = true;

    if(!angular.isDefined(param) || param == '' || param == null) {
      validateResult = false;
    }
    return validateResult;
  }

　// 休憩時間部分の入力チェックを行います。
  $scope.validateRestTimeTimes = function(restTime) {
    var validateResult = true;
    var keepRestTimeCheck = true;
    var resttimeArray = [];

    if (restTime.times.length == 0 ){
      restTime.restTimeErrorMessage = $translate.instant('MSG_REST_TIME_TIME_INPUT');
      return false;
    }

    // 休憩時間の相互チェック
    restTime.times.forEach(function(time) {
      if (keepRestTimeCheck) {
        if (!validateInput(time.start) || !validateInput(time.end)) {
          restTime.restTimeErrorMessage = $translate.instant('MSG_REST_TIME_TIME_ERROR');;
          keepRestTimeCheck = false;
          validateResult = false;
        }

//        if (time.start >= time.end) {
//          restTime.restTimeErrorMessage = $translate.instant('MSG_REST_TIME_TIME_ERROR');
//          keepRestTimeCheck = false;
//          validateResult = false;
//        }
        resttimeArray.push(time);
      }
    });

    if (keepRestTimeCheck) {
      // 休憩時間を開始時間でソート
      resttimeArray.sort(function(a, b) {
        if(a.start < b.start) return -1;
        if(a.start > b.start) return 1;
        return 0;
      });

      // 前後の終了、開始時間に前後がある場合はNG
      resttimeArray.forEach(function(time, index) {
        if (keepRestTimeCheck){
          if (index + 1 < resttimeArray.length && time.end >= resttimeArray[index+1].start) {
            restTime.restTimeErrorMessage = $translate.instant('MSG_REST_TIME_TIME_OVER');
            keepRestTimeCheck = false;
            validateResult = false;
          }
        }
      });
    }

    return validateResult;
  }

  $scope.buttonRestTimeRemoveClick = function(restTimeTemplate, index) {
    clearMessage();
    restTimeTemplate.times.splice(index, 1) ;
  };

  // 休憩時間削除時
  $scope.buttonRestTimeConfigDeleteClick = function(restTime) {
    clearMessage();
    var index = $scope.restTimes.indexOf(restTime);
    $scope.deleteRestTimes.push(restTime);
    $scope.restTimes.splice(index, 1);
  };

  // 休憩期間変更時
  $scope.restPeriodDatePickerChange = function($event) {
    clearMessage();
  }

  // 休憩時間変更時
  $scope.restTimePickerChange = function($event, form, restTime, updateRestTime, ftflg) {
    clearMessage();
    var index = $scope.restTimes.indexOf(restTime);
    if (index >= 0) {
      if (updateRestTime.start > restTime.end) {
        if (ftflg == 'from') {
          restTime.end = angular.copy(restTime.start);
        } else {
          restTime.start = angular.copy(restTime.end);
        }
      }
      $scope.restTimes.splice(index, 1, restTime);
    }
  }

  // 登録ボタンクリック時
  $scope.buttonSendConfigClick = function() {
    clearMessage();
    if ($scope.validateRestTimes($scope.restTimes)) {
      // 送信用にオブジェクトを複製
      var sendRestTimes = angular.copy($scope.restTimes);
      // テンプレートの時間を変換
      sendRestTimes.forEach(function(restTime) {
        restTime.times.forEach(function(time) {
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
          url: '/viewapi/resttime.json',
          data: {
            userId:           $scope.userId,
          //  userObjId:        $scope.user,
            restTimes:        JSON.stringify(sendRestTimes),
            deleteRestTimes:  JSON.stringify($scope.deleteRestTimes),
          }
        }).success(function (data, status) {
          loadRestTime();
          $scope.messages = ['登録しました'];

          // リクエスト状態更新
          $scope.requesting = false;

        }).error(function (data, status) {
          console.log({status:status, data: data});
          if (data.errors.length > 0) {
            $scope.errors = data.errors;
          }

          // リクエスト状態更新
          $scope.requesting = false;
        });
      }
    }
  };

  // クリアボタンクリック時
  $scope.buttonClearConfigClick = function() {
    clearMessage();
    loadRestTime();
    $scope.deleteRestTimes = [];
  };

  // 戻るボタンクリック
  $scope.buttonReturnClick = function() {
    $location.path($scope.userUrl);
  };

  $scope.restTimeTimePickerErrorClass = function(form, restTime) {
    return {
      'has-error':
      $scope.restTimeTimePickerError(form, restTime)
    };
  };

  $scope.restTimeTimePickerError = function(form, restTime) {
    return angular.isDefined(restTime.start) && restTime.start.$viewValue !== '' && restTime.start.$invalid;
  };
}]);
