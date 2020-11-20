/**
 * Error responses
 */

'use strict';

// TODO きちんとしたエラー画面を用意する
var simpleError = function(statusCode) {
  return function (req, res) {
    res.status(statusCode);
    res.send(statusCode);
  };
};

module.exports[400] = simpleError(400);
module.exports[401] = simpleError(401);
module.exports[403] = simpleError(403);

module.exports[404] = function pageNotFound(req, res) {
  var viewFilePath = '404';
  var statusCode = 404;
  var result = {
    status: statusCode
  };

  res.status(result.status);
  res.render(viewFilePath, function (err) {
    if (err) { return res.json(result, result.status); }

    res.render(viewFilePath);
  });
};

module.exports[405] = simpleError(405);

module.exports[418] = simpleError(418);
module.exports[500] = simpleError(500);
module.exports[501] = simpleError(501);
module.exports[503] = simpleError(503);
