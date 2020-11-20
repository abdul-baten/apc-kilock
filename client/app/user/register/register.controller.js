'use strict';

angular.module('serverAttendApiApp')
  .controller('UserCtrl', function ($scope, $http, $routeParams, $location, $translate) {
    var userId = $routeParams.userId;
    if (!userId || _.isNaN(userId)) {
      userId = 'register';
      $scope.isUserModify = false;
    } else {
      $scope.deviceUrl = '/user/' + userId + '/device';
      $scope.passhistoriesUrl = '/user/' + userId + '/passhistories';
      $scope.attendanceUrl = '/user/' + userId + '/attendance';
      $scope.mailListUrl = '/user/' + userId + '/maillist';
      $scope.isUserModify = true;
    }
    var viewapi = '/viewapi/user/' + userId + '.json';
    $scope.roles = [];
    $scope.infoMessage = '';
    $scope.errorMessage = '';
    $scope.error = false;
    $scope.errorParams = [];
    $scope.permitItems = [];
    $scope.responseUserEnabled = false;

    /**
     * ロール一覧を取得する。
     */
    var getRoles = function() {
      $http.get('/viewapi/role.json').success(function (data, status) {
        $scope.roles = data;
      }).error(function (data, status){

      });
    };

    /**
     * グループ一覧を取得する。
     */
    var getProjects = function() {
      $http.get('/viewapi/projects.json').success(function (data, status) {
        $scope.projects = data.projects;
      }).error(function (data, status){

      });
    };

    $http.get(viewapi)
    .success(function (data, status) {
      console.log({status:status, data: data});
      if (!data.nfcs || data.nfcs.length === 0) {
        data.nfcs = [{number: ''}];
      }
      $scope.user = data;
      $scope.permitItems = data.permitItems;
      $scope.deviceStatusMessage = data.hasDevice ? $translate.instant('デバイス登録済み') : $translate.instant('デバイス未登録');
      $scope.responseUserEnabled = $scope.user.enabled;

      // 役割のチェックボックス初期化
      $scope.checkRoles = [];
      _(data.roles).forEach(function (role) {
        $scope.checkRoles[role._id] = true;
      });

      // ロールに関する権限が有効である場合、ロール一覧を取得する。
      if ($scope.isShow('role')) {getRoles();}

      // グループ一覧を取得
      getProjects();

      // グループのチェックボックス初期化
      $scope.checkGroups = [];
      _(data.manageGroups).forEach(function (group) {
        $scope.checkGroups[group] = true;
      });

      // 勤務表状態更新権限初期化
      $scope.attendancePermissionProjects = {
        middle: [],
        better: [],
      };
      if (data.attendancePermissionProjects) {
        _(data.attendancePermissionProjects.middle).forEach(function (project_Id) {
          $scope.attendancePermissionProjects.middle[project_Id] = true;
        });
        _(data.attendancePermissionProjects.better).forEach(function (project_Id) {
          $scope.attendancePermissionProjects.better[project_Id] = true;
        });
      }
    })
    .error(function (data, status) {
      console.log({status:status, data: data});
    });
    $scope.isShow = function (name) {
      var permitItem = $scope.permitItems[name];
      return permitItem && permitItem >= 1;
    };
    $scope.isShowEdit = function () {
      return !!$scope.user;
    };
    $scope.isShowDelete = function () {
      return !!$scope.user && !$scope.responseUserEnabled &&
        !$scope.user.enabled && $scope.isShow('delete');
    };
    $scope.isPermit = function (name) {
      var permitItem = $scope.permitItems[name];
      return permitItem && permitItem >= 2;
    };
    $scope.isError = function (name) {
      return { 'has-error': $scope.error && $scope.errorParams.indexOf(name) !== -1 };
    };
    $scope.submit = function () {
      var nfcs = _($scope.user.nfcs).map(function (nfc) { return nfc.number; }).value();
      var roleIdList = [];
      for (var checkboxId in $scope.checkRoles) {
        if ($scope.checkRoles[checkboxId]) {
          roleIdList.push(checkboxId);
        }
      }
      var groupIdList = [];
      for (var checkboxId in $scope.checkGroups) {
        if ($scope.checkGroups[checkboxId]) {
          groupIdList.push(checkboxId);
        }
      }
      var attendancePermissionProject_IdList = {
        middle: [],
        better: [],
      };
      for (var middleProject_Id in $scope.attendancePermissionProjects.middle) {
        if ($scope.attendancePermissionProjects.middle[middleProject_Id]) {
          attendancePermissionProject_IdList.middle.push(middleProject_Id);
        }
      }
      for (var betterProject_Id in $scope.attendancePermissionProjects.better) {
        if ($scope.attendancePermissionProjects.better[betterProject_Id]) {
          attendancePermissionProject_IdList.better.push(betterProject_Id);
        }
      }

      var httpMethod;
      if (userId === 'register') {
        httpMethod = 'POST';
      } else {
        httpMethod = 'PUT';
      }
      $http({
        method: httpMethod,
        url: viewapi,
        data: {
          id: $scope.user.id,
          name: $scope.user.name,
          login: $scope.user.mail,
          mail: $scope.user.mail,
          admin: $scope.user.admin,
          top: $scope.user.top,
          doorOpen: $scope.user.doorOpen,
          enabled: $scope.user.enabled,
          imageurl: $scope.user.imageurl,
          profile: $scope.user.profile,
          order: $scope.user.order,
          extensionPhoneNumber: $scope.user.extensionPhoneNumber,
          nfc: nfcs,
          roles: roleIdList,
          manageGroups: groupIdList,
          attendancePermissionMiddleProjects: attendancePermissionProject_IdList.middle,
          attendancePermissionBetterProjects: attendancePermissionProject_IdList.better,
        },
      })
      .success(function (data, status) {
        if (userId === 'register') {
          $location.path('/user/' + data.id).replace();
        } else {
          $scope.infoMessage = $translate.instant('登録しました');
          $scope.errorMessage = '';
          $scope.error = false;
          console.log({status:status, data: data});
          if (!data.nfcs || data.nfcs.length === 0) {
            data.nfcs = [{number: ''}];
          }
          $scope.user = data;
          $scope.permitItems = data.permitItems;
          $scope.responseUserEnabled = $scope.user.enabled;
        }
      })
      .error(function (data, status) {
        $scope.infoMessage = '';
        $scope.errorMessage = {}
        $scope.error = true;
        $scope.errorParams = [];
        _(data).each(function (errorData) {
          if (errorData.param) {
            $scope.errorMessage[errorData.param] = $translate.instant(errorData.msg);
            $scope.errorParams.push(errorData.param);
          }
        });
        console.log({status:status, data: data});
      });
    };
    $scope.delete = function () {
      $http.delete(viewapi)
      .success(function (data, status) {
        $scope.infoMessage = $translate.instant('削除しました');
        $scope.errorMessage = '';
        $scope.error = false;
        console.log({status:status, data: data});
        $scope.user = null;
        $scope.permitItems = [];
        $scope.responseUserEnabled = false;
      })
      .error(function (data, status) {
        $scope.infoMessage = '';
        $scope.errorMessage = {}
        $scope.error = true;
        $scope.errorParams = [];
        _(data).each(function (errorData) {
          if (errorData.param) {
            $scope.errorMessage[errorData.param] = $translate.instant(errorData.msg);
            $scope.errorParams.push(errorData.param);
          }
        });
        console.log({status:status, data: data});
      });
    };

    /**
     * 変数rolesに要素が存在するか確認する。
     * @return boolean 要素が存在すればtrue、そうでなければfalse。
     */
    $scope.roleExist = function() {
      return $scope.roles.length > 0;
    };

    /**
     * 組織固有の番号を生成する。
     * @param user ユーザオブジェクト
     * @return string kより始まる9桁の番号
     */
    $scope.createUserId = function (user) {
      if(!user) return '';

      return 'k' + (Array(8).join('0') + user.id).slice(-8);
    };

    $scope.publishEmailRegistration = function () {
      var url = '/viewapi/mailregistration/createRegistrationToken/' + $scope.user.id;

      $http.post(url).success(function (data, status) {
        $scope.setRegistrationMailAddress(data);
        $scope.registrationMessage = '登録手続き用メールアドレスを発行いたしました。';
        angular.element('#mailRegistrationModal').modal('show');
      }).error(function (data, status) {
        if(data.token) {
          $scope.setRegistrationMailAddress(data);
          $scope.registrationMessage = '発行済みの登録手続き用メールアドレスを表示いたします。';
          angular.element('#mailRegistrationModal').modal('show');
        }
      });
    };

    /**
     * メールアドレス登録用URLを生成し、scopeに設定する。
     * @param id ユーザID
     * @param registerId トークン
     */
    $scope.setRegistrationMailAddress = function(data) {
      $scope.registrationMailAddress = 'reg' + data.token + '@' + data.domain;
    };
  });
