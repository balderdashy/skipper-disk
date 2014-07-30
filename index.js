/**
 * Module dependencies
 */

var WritableStream = require('stream').Writable;
var TransformStream = require('stream').Transform;
var fsx = require('fs-extra');
var path = require('path');
var _ = require('lodash');
var UUIDGenerator = require('node-uuid');



/**
 * skipper-disk
 *
 * @type {Function}
 * @param  {Object} options
 * @return {Object}
 */

module.exports = function DiskStore(options) {
  options = options || {};

  var log = options.log || function _noOpLog() {};

  var adapter = {

    rm: function(fd, cb) {
      return fsx.unlink(fd, function(err) {
        // Ignore "doesn't exist" errors
        if (err && (typeof err !== 'object' || err.code !== 'ENOENT')) {
          return cb(err);
        } else return cb();
      });
    },
    ls: function(dirpath, cb) {
      return fsx.readdir(dirpath, cb);
    },
    read: function(fd, cb) {
      if (cb) {
        return fsx.readFile(fd, cb);
      } else {
        return fsx.createReadStream(fd);
      }
    },

    receive: DiskReceiver,
    receiver: DiskReceiver // (synonym for `.receive()`)
  };

  return adapter;













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
  function DiskReceiver(options) {
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

          var __progress__ = buildProgressStream(options, __newFile, receiver__, outs__);

          // Finally pipe the progress THROUGH the progress stream
          // and out to disk.
          __newFile
            .pipe(__progress__)
            .pipe(outs__);

        });
      });


    };

    return receiver__;
  } // </DiskReceiver>


};

















function buildProgressStream (options, __newFile, receiver__, outs__) {
  var log = options.log || function noOpLog(){};

  // Generate a progress stream and unique id for this file
  // then pipe the bytes down to the outs___ stream
  // We will pipe the incoming file stream to this, which will
  var localID = _.uniqueId();
  var guessedTotal = 0;
  var writtenSoFar = 0;
  var __progress__ = new TransformStream();
  __progress__._transform = function(chunk, enctype, next) {

    // Update the guessedTotal to make % estimate
    // more accurate:
    guessedTotal += chunk.length;
    writtenSoFar += chunk.length;

    // Do the actual "writing", which in our case will pipe
    // the bytes to the outs___ stream that writes to disk
    this.push(chunk);

    // Emit an event that will calculate our total upload
    // progress and determine whether we're within quota
    this.emit('progress', {
      id: localID,
      fd: __newFile._skipperFD,
      name: __newFile.name,
      written: writtenSoFar,
      total: guessedTotal,
      percent: (writtenSoFar / guessedTotal) * 100 | 0
    });
    next();
  };

  // This event is fired when a single file stream emits a progress event.
  // Each time we receive a file, we must recalculate the TOTAL progress
  // for the aggregate file upload.
  //
  // events emitted look like:
  /*
  {
    percentage: 9.05,
    transferred: 949624,
    length: 10485760,
    remaining: 9536136,
    eta: 10,
    runtime: 0,
    delta: 295396,
    speed: 949624
  }
  */
  __progress__.on('progress', function singleFileProgress(milestone) {

    // Lookup or create new object to track file progress
    var currentFileProgress = _.find(receiver__._files, {
      id: localID
    });
    if (currentFileProgress) {
      currentFileProgress.written = milestone.written;
      currentFileProgress.total = milestone.total;
      currentFileProgress.percent = milestone.percent;
      currentFileProgress.stream = __newFile;
    } else {
      currentFileProgress = {
        id: localID,
        fd: __newFile._skipperFD,
        name: __newFile.filename,
        written: milestone.written,
        total: milestone.total,
        percent: milestone.percent,
        stream: __newFile
      };
      receiver__._files.push(currentFileProgress);
    }
    ////////////////////////////////////////////////////////////////


    // Recalculate `totalBytesWritten` so far for this receiver instance
    // (across ALL OF ITS FILES)
    // using the sum of all bytes written to each file in `receiver__._files`
    totalBytesWritten = _.reduce(receiver__._files, function(memo, status) {
      memo += status.written;
      return memo;
    }, 0);

    log(currentFileProgress.percent, '::', currentFileProgress.written, '/', currentFileProgress.total, '       (file #' + currentFileProgress.id + '   :: ' + /*'update#'+counter*/ '' + ')'); //receiver__._files.length+' files)');

    // Emit an event on the receiver.  Someone using Skipper may listen for this to show
    // a progress bar, for example.
    receiver__.emit('progress', currentFileProgress);

    // and then enforce its `maxBytes`.
    if (options.maxBytes && totalBytesWritten >= options.maxBytes) {

      var err = new Error();
      err.code = 'E_EXCEEDS_UPLOAD_LIMIT';
      err.name = 'Upload Error';
      err.maxBytes = options.maxBytes;
      err.written = totalBytesWritten;
      err.message = 'Upload limit of ' + err.maxBytes + ' bytes exceeded (' + err.written + ' bytes written)';

      // Stop listening for progress events
      __progress__.removeAllListeners('progress');
      // Unpipe the progress stream, which feeds the disk stream, so we don't keep dumping to disk
      __progress__.unpipe();
      // Clean up any files we've already written
      (function gc(err) {
      // Garbage-collects the bytes that were already written for this file.
      // (called when a read or write error occurs)
        log('************** Garbage collecting file `' + __newFile.filename + '` located @ ' + fd + '...');
        adapter.rm(fd, function(gcErr) {
          if (gcErr) return outs__.emit('E_EXCEEDS_UPLOAD_LIMIT',[err].concat([gcErr]));
          return outs__.emit('E_EXCEEDS_UPLOAD_LIMIT',err);
        });
      })(err);

      return;

      // Don't do this--it releases the underlying pipes, which confuses node when it's in the middle
      // of a write operation.
      // outs__.emit('error', err);
      //
      //
    }

  });

  return __progress__;
}

