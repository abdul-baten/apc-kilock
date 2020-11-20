'use strict';

var express = require('express');
var controller = require('./attendanceType.controller');
var auth = require('../../../auth/auth.service');

var router = express.Router();

router.get('/list.json', auth.login(), controller.getAttendanceTypeList);

module.exports = router;
