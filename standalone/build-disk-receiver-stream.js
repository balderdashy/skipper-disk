/**
 * Module dependencies
 */

var WritableStream = require('stream').Writable;
var path = require('path');
var _ = require('lodash');
var UUIDGenerator = require('node-uuid');
var fsx = require('fs-extra');
var r_buildProgressStream = require('./build-progress-stream');




/**
 * A simple receiver for Skipper that writes Upstreams to
 * disk at the configured path.
 *
 * Includes a garbage-collection mechanism for failed
 * uploads.
 *
 * @param  {Object} options
 * @return {Stream.Writable}
 */
module.exports = function buildDiskReceiverStream(options) {
  var log = options.log || function noOpLog(){};

  options = options || {};

  _.defaults(options, {

    // The default `saveAs` implements a unique filename by combining:
    //  • a generated UUID  (like "4d5f444-38b4-4dc3-b9c3-74cb7fbbc932")
    //  • the uploaded file's original extension (like ".jpg")
    saveAs: function(__newFile, cb) {
      return cb(null, UUIDGenerator.v4() + path.extname(__newFile.filename));
    },

    // Bind a progress event handler, e.g.:
    // function (milestone) {
    //   milestone.id;
    //   milestone.name;
    //   milestone.written;
    //   milestone.total;
    //   milestone.percent;
    // },
    onProgress: undefined,

    // Upload limit (in bytes)
    // defaults to ~15MB
    maxBytes: 15000000,

    // By default, upload files to `./.tmp/uploads` (relative to cwd)
    dirname: '.tmp/uploads'
  });


  var receiver__ = WritableStream({ objectMode: true });

  // if onProgress handler was provided, bind an event automatically:
  if (_.isFunction(options.onProgress)) {
    receiver__.on('progress', options.onProgress);
  }

  // Track the progress of all file uploads that pass through this receiver
  // through one or more attached Upstream(s).
  receiver__._files = [];

  // Keep track of the number total bytes written so that maxBytes can
  // be enforced.
  var totalBytesWritten = 0;


  // This `_write` method is invoked each time a new file is received
  // from the Readable stream (Upstream) which is pumping filestreams
  // into this receiver.  (filename === `__newFile.filename`).
  receiver__._write = function onFile(__newFile, encoding, done) {

    // -------------------------------------------------------
    // -------------------------------------------------------
    // -------------------------------------------------------
    //
    // Determine the file descriptor-- the unique identifier.
    // Often represents the location where file should be written.
    var fd;

    var dirPath;
    if (options.dirname) {
      dirPath = path.resolve(options.dirname);
    }
    else dirPath = process.cwd();

    // Run `saveAs` to get the desired name for the file
    options.saveAs(__newFile, function (err, filename){
      if (err) return done(err);

      if (options.fd) {
        fd = path.resolve(options.fd);
      }
      else fd = path.join(dirPath, filename);

      // Attach fd as metadata to the file stream for use back in skipper core
      __newFile._skipperFD = fd;

      //
      // -------------------------------------------------------
      // -------------------------------------------------------
      // -------------------------------------------------------


      // Ensure necessary parent directories exist:
      fsx.mkdirs(dirPath, function(mkdirsErr) {
        // If we get an error here, it's probably because the Node
        // user doesn't have write permissions at the designated
        // path.
        if (mkdirsErr) {
          return done(mkdirsErr);
        }

        // Error reading from the file stream
        __newFile.on('error', function(err) {
          log('***** READ error on file ' + __newFile.filename, '::', err);
        });

        // Create a new write stream to write to disk
        var outs__ = fsx.createWriteStream(fd, encoding);

        // When the file is done writing, call the callback
        outs__.on('finish', function successfullyWroteFile() {
          log('finished file: ' + __newFile.filename);
          done();
        });
        outs__.on('E_EXCEEDS_UPLOAD_LIMIT', function (err) {
          done(err);
        });

        var __progress__ = r_buildProgressStream(options, __newFile, receiver__, outs__);

        // Finally pipe the progress THROUGH the progress stream
        // and out to disk.
        __newFile
          .pipe(__progress__)
          .pipe(outs__);

      });
    });


  };

  return receiver__;
}; // </DiskReceiver>
