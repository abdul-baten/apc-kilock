'use strict';

describe('Controller: MainCtrl', function () {

  // load the controller's module
  beforeEach(module('serverAttendApiApp'));

  var MainCtrl,
    scope,
    $httpBackend;

  // Initialize the controller and a mock scope
  beforeEach(inject(function (_$httpBackend_, $controller, $rootScope) {
    $httpBackend = _$httpBackend_;
    $httpBackend.expectGET('assets/i18n/locale-en.json')
      .respond({});

    scope = $rootScope.$new();
    MainCtrl = $controller('MainCtrl', {
      $scope: scope
    });
  }));

  it('should load i18n file', function () {
    $httpBackend.flush();
  });
  //it('should attach a list of awesomeThings to the scope', function () {
  //  expect(scope.awesomeThings).toBeUndefined();
  //  $httpBackend.flush();
  //  expect(scope.awesomeThings.length).toBe(4);
  //});
});
