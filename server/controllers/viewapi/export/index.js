'use strict';

var express = require('express');
var controller = require('./excel.controller');
var auth = require('../../../auth/auth.service');

var router = express.Router();

router.get('/excel.json', auth.login(), controller.getExcel);
router.get('/excelAll.json', auth.login(), controller.getExcelAll);

module.exports = router;
