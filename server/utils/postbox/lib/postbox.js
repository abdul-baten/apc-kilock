(function() {
  'use strict';
  var Postbox, kue;

  kue = require('kue');

  Postbox = (function() {
    function Postbox(config) {
      this.config = config;
      this.kueJobs = kue.createQueue(this.config.kue);
    }

    Postbox.prototype.post_mail = function(mailOptions, callback) {
      var job;
      if (mailOptions == null) {
        mailOptions = {};
      }
      console.log("mailOptions: ");
      console.log(mailOptions);
      var now = new Date();
      console.log(now);

      job = this.kueJobs.create(this.config.queueName, mailOptions);
      job.removeOnComplete(true);
      return job.save(callback);
    };

    return Postbox;

  })();

  if (typeof module !== "undefined" && module !== null ? module.exports : void 0) {
    module.exports = Postbox;
  } else {
    this.Postbox = Postbox;
  }

}).call(this);
