'use strict';

var Promise     = require('../../ext/promise');
var chalk       = require('chalk');
var path        = require('path');
var Task        = require('../../models/task');
var SilentError = require('../../errors/silent');

function createServer() {
  var instance;
  var Server = (require('tiny-lr')).Server;
  Server.prototype.error = function() {
    instance.error.apply(instance, arguments);
  };
  instance = new Server();
  return instance;
}

module.exports = Task.extend({
  liveReloadServer: function() {
    if (this._liveReloadServer) {
      return this._liveReloadServer;
    }

    this._liveReloadServer = createServer();
    return this._liveReloadServer;
  },


  listen: function(port) {
    var server = this.liveReloadServer();
    return new Promise(function(resolve, reject) {
      server.error = reject;
      server.listen(port, resolve);
    });
  },

  start: function(options) {
    if (options.liveReload !== true) {
      return Promise.resolve('Livereload server manually disabled.');
    }

    // Reload on file changes
    this.watcher.on('change', this.didChange.bind(this));
    this.watcher.on('error',  this.didError.bind(this));

    // Start LiveReload server
    return this.listen(options.liveReloadPort)
      .then(this.writeBanner.bind(this, options.liveReloadPort))
      .catch(this.writeErrorBanner.bind(this, options.liveReloadPort));
  },

  writeBanner: function(port) {
    this.ui.writeLine('Livereload server on port ' + port);
  },

  writeErrorBanner: function(port) {
    throw new SilentError('Livereload failed on port ' + port + '.  It is either in use or you do not have permission.');
  },

  didChange: function(results) {
    var filePath = path.relative(this.project.root, results.filePath || '');

    var canTrigger = this.project.liveReloadFilterPatterns.reduce(function(bool, pattern) {
      bool = bool && !filePath.match(pattern);
      return bool;
    }, true);

    if (canTrigger) {
      this.liveReloadServer().changed({
        body: {
          files: ['LiveReload files']
        }
      });

      this.analytics.track({
        name:    'broccoli watcher',
        message: 'live-reload'
      });
    }
  },

  didError: function(error) {
    if (error.message) {
      this.ui.writeLine(chalk.red(error.message));
    } else {
      this.ui.writeLine(chalk.red(error));
    }
    if (error.stack) {
      this.ui.writeLine(error.stack);
    }

    this.analytics.trackError({
      description: error.message + ' ' + error.stack,
      isFatal:     false
    });
  }
});
