var path = require('path');

// override instance methods
function extend(log4js) {
  var logger = log4js.getLogger();
  ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(function (method) {
    var original = logger.constructor.prototype[method];
    logger.constructor.prototype[method] = function log() {
      var args = [].slice.call(arguments),
          trace = getTrace(log);
      if (args[0] instanceof Object) {
        args.push({at: formatter(trace)});
      } else {
        args.push('(' + formatter(trace) + ')');
      }
      return original.apply(this, args);
    };
  });
}

function prepareStackTrace(error, structuredStackTrace) {
  var trace = structuredStackTrace[0];
  return {
    // method name
    name: trace.getMethodName() || trace.getFunctionName() || '<anonymous>',
    // file name
    file: trace.getFileName(),
    // line number
    line: trace.getLineNumber(),
    // column number
    column: trace.getColumnNumber()
  };
}

function getTrace(caller) {
  var original = Error.prepareStackTrace,
      error = {};
  Error.captureStackTrace(error, caller || getTrace);
  Error.prepareStackTrace = prepareStackTrace;
  var stack = error.stack;
  Error.prepareStackTrace = original;
  return stack;
}

// format trace
function formatter(trace) {
  if (!trace.file) {
    trace.file = '';
  } else if (exports.path) {
    // absolute path -> relative path
    trace.file = path.relative(exports.path, trace.file);
  }

  return exports.format
    .split('@name').join(trace.name)
    .split('@file').join(trace.file)
    .split('@line').join(trace.line)
    .split('@column').join(trace.column);
}

var extended = false;
exports = module.exports = function (log4js, options) {
  if (!extended) {
    extend(log4js);
  }
  extended = true;

  // init
  options = options || {};
  exports.path = options.path || null;
  exports.format = options.format || '@file:@line:@column - @name';

  return log4js;
};
