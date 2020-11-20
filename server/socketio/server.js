
var logger = log4js.getLogger(),
    config = require('../config/environment');

var io;
if (config.httpsOptions) {
  io = require('socket.io').listen(config.port.socketio, config.httpsOptions);
} else {
  io = require('socket.io').listen(config.port.socketio);
}

io.of('/sio/test').on('connection', function (socket){
  socket.on('msg send', function (msg) {
    socket.emit('msg push', msg);
    socket.broadcast.emit('msg push', msg);
  });
  socket.on('disconnect', function () {
    logger.trace('disconnect');
  });
});

io.of('/sio/test2').on('connection', function (socket){
  socket.on('msg send', function (msg) {
    socket.emit('msg push', msg);
    socket.broadcast.emit('msg push', msg);
  });
  socket.on('disconnect', function () {
    logger.trace('disconnect');
  });
});

// Expose app
exports = module.exports = io;
