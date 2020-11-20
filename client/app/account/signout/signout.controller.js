'use strict';

angular.module('serverAttendApiApp')
  .controller('SignoutCtrl', function ($window) {

    const signOutPromise = new Promise((resolve, reject) => {
      const getTimeOutValue = localStorage.getItem('timeOut');
      if (getTimeOutValue) localStorage.removeItem('timeOut');
      resolve();
    });

    signOutPromise.then(() => {
      $window.location.href = '/auth/signout';
    }).catch(err => console.log(err));
  });
