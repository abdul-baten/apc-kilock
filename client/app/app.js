'use strict';

angular.module('serverAttendApiApp', [
    'ngCookies',
    'ngResource',
    'ngSanitize',
    'ngRoute',
    'ui.bootstrap',
    'mgcrea.ngStrap',
    'pascalprecht.translate',
    'angular-loading-bar',
    'monospaced.qrcode',
    'angularMoment',
    'ngFileUpload'
  ])
  .config(function ($routeProvider, $locationProvider, $translateProvider, $httpProvider) {

    $routeProvider
      .otherwise({
        redirectTo: '/'
      });

    $locationProvider.html5Mode(true);

    $translateProvider.useStaticFilesLoader({
      prefix: 'assets/i18n/locale-',
      suffix: '.json'
    });

    var userLanguage = function () {
      try {
        return (navigator.languages ? navigator.languages[0] : (navigator.browserLanguage || navigator.language || navigator.userLanguage)).substr(0, 2);
      } catch (e) {
        return 'en';
      }
    };

    $translateProvider.preferredLanguage(userLanguage());

    $translateProvider.fallbackLanguage('en');
    //$translateProvider.useMissingTranslationHandlerLog();
    //$translateProvider.useLocalStorage();

    //GETメソッド用のヘッダーを初期化
    if (!$httpProvider.defaults.headers.get) {
      $httpProvider.defaults.headers.get = {};
    }
    //IEのAjaxリクエストキャッシュを無効にする
    $httpProvider.defaults.headers.get['If-Modified-Since'] = '0';

  });
