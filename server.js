// server.js
const app = require('./app.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const debug = require('debug')('novelink-brush-server:server');

const isPkg = typeof process.pkg !== 'undefined';
const basePath = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');

let config = {};
try {
  const configPath = path.join(basePath, 'server.config.json');
  if (fs.existsSync(configPath)) {
    const configFile = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configFile);
  } else {
    const defaultConfigPath = path.join(__dirname, 'server.config.default.json');
    if (fs.existsSync(defaultConfigPath)) {
        const configFile = fs.readFileSync(defaultConfigPath, 'utf8');
        config = JSON.parse(configFile);
    }
  }
} catch (error) {
  console.error('Error reading or parsing config file:', error);
}

var port = normalizePort(config.port || process.env.PORT || '3000');
app.set('port', port);

var server = http.createServer(app);

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    return val;
  }

  if (port >= 0) {
    return port;
  }

  return false;
}

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
  console.log('Server listening on ' + bind);
}
