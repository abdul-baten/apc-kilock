// Karma configuration
// http://karma-runner.github.io/0.10/config/configuration-file.html

module.exports = function(config) {
  config.set({
    // base path, that will be used to resolve files and exclude
    basePath: '',

    // testing framework to use (jasmine/mocha/qunit/...)
    frameworks: ['jasmine'],

    // list of files / patterns to load in the browser
    files: [
      'client/bower_components/angular/angular.js',
      'client/bower_components/angular-mocks/angular-mocks.js',
      'client/bower_components/angular-resource/angular-resource.js',
      'client/bower_components/angular-cookies/angular-cookies.js',
      'client/bower_components/angular-sanitize/angular-sanitize.js',
      'client/bower_components/angular-route/angular-route.js',

      // bower:
      'client/bower_components/jquery/dist/jquery.js',
      'client/bower_components/bootstrap/dist/js/bootstrap.js',
      'client/bower_components/angular-animate/angular-animate.js',
      'client/bower_components/angular-bootstrap/ui-bootstrap-tpls.js',
      'client/bower_components/lodash/lodash.js',
      'client/bower_components/FileSaver/dist/FileSaver.min.js',
      'client/bower_components/angular-strap/dist/angular-strap.js',
      'client/bower_components/angular-strap/dist/angular-strap.tpl.js',
      'client/bower_components/angular-translate/angular-translate.js',
      'client/bower_components/angular-loading-bar/build/loading-bar.js',
      'client/bower_components/qrcode-generator/js/qrcode.js',
      'client/bower_components/angular-qrcode/qrcode.js',
      'client/bower_components/angular-i18n/angular-locale_ja-jp.js',
      'client/bower_components/moment/moment.js',
      'client/bower_components/angular-moment/angular-moment.js',
      'client/bower_components/jspdf/dist/jspdf.debug.js',
      'client/bower_components/html2canvas/build/html2canvas.js',
      'client/bower_components/ng-file-upload/ng-file-upload.js',
      'client/bower_components/bootstrap-sass/assets/javascripts/bootstrap.js',
      // endbower

      'client/bower_components/angular-translate-loader-static-files/angular-translate-loader-static-files.js',

      'client/app/*.js',
      'client/app/**/*.js',
      //'client/app/assets/scripts/*.js',
      //'client/app/assets/scripts/**/*.js',
      //'test/client/mock/**/*.js',
      'test/client/spec/**/*.js'
    ],

    // list of files / patterns to exclude
    exclude: [],

    // web server port
    port: 8080,

    // level of logging
    // possible values: LOG_DISABLE || LOG_ERROR || LOG_WARN || LOG_INFO || LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,


    // Start these browsers, currently available:
    // - Chrome
    // - ChromeCanary
    // - Firefox
    // - Opera
    // - Safari (only Mac)
    // - PhantomJS
    // - IE (only Windows)
    //browsers: ['Chrome', 'PhantomJS'],
    browsers: [process.env.TEST_BROWSER || 'Chrome'],
    //browsers: ['PhantomJS'],


    // Continuous Integration mode
    // if true, it capture browsers, run tests and exit
    singleRun: false
  });
};
