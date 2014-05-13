/**
 * Module dependencies
 */

var Writable = require('stream').Writable;
var fsx = require('fs-extra');
var path = require('path');
var _ = require('lodash');
var ProgressStream = require('progress-stream');



/**
 * skipper-disk
 *
 * @param  {Object} options
 * @return {Object}
 */

module.exports = function DiskStore (options) {
  options = options || {};

  var adapter = {

    rm: function (filepath, cb){
      return fsx.unlink(filepath, function(err) {
        // Ignore "doesn't exist" errors
        if (err && err.code !== 'ENOENT') { return cb(err); }
        else return cb();
      });
    },
    ls: function (dirpath, cb) {
      return fsx.readdir(dirpath, cb);
    },
    read: function (filepath, cb) {
      if (cb) {
        return fsx.readFile(filepath, cb);
      }
      else {
        return fsx.createReadStream(filepath);
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
  function DiskReceiver (options) {
    options = options || {};

    // Normalize `saveAs()` option:
    // options.saveAs() <==> options.rename() <==> options.getFilename() <==> options.getFileName()
    options.saveAs = options.saveAs || options.rename;
    options.saveAs = options.saveAs || options.getFileName;
    options.saveAs = options.saveAs || options.getFilename;

    _.defaults(options, {

      // By default, create new files on disk
      // using their uploaded filenames.
      // (no overwrite-checking is performed!!)
      saveAs: function (__newFile) {
        return __newFile.filename;
      },

      // Bind a progress event handler, e.g.:
      // function (milestone) {
      //   milestone.id
      //   milestone.name
      //   milestone.written
      //   milestone.total
      //   milestone.percent
      // },
      onProgress: undefined,

      // Upload limit (in bytes)
      // defaults to ~15MB
      maxBytes: 15000000,

      // By default, upload files to `./.tmp/uploads` (relative to cwd)
      dirname: '.tmp/uploads'
    });

    var receiver__ = Writable({
      objectMode: true
    });

    // Track the progress of each file upload in this Upstream.
    receiver__._files = [];

    // Keep track of the number total bytes written so that maxBytes can
    // be enforced.
    var totalBytesWritten = 0;

    // This `_write` method is invoked each time a new file is received
    // from the Readable stream (Upstream) which is pumping filestreams
    // into this receiver.  (filename === `__newFile.filename`).
    receiver__._write = function onFile(__newFile, encoding, done) {


      // Determine location where file should be written:
      // -------------------------------------------------------
      var filePath, dirPath, filename;
      if (options.id) {
        // If `options.id` was specified, use it directly as the path.
        filePath = options.id;
        dirPath = path.dirname(filePath);
        filename = path.basename(filePath);
      }
      else {
        // Otherwise, use the more sophisiticated options:
        dirPath = path.resolve(options.dirname);
        filename = options.filename || options.saveAs(__newFile);
        filePath = path.join(dirPath, filename);
      }
      // -------------------------------------------------------


      // Garbage-collect the bytes that were already written for this file.
      // (called when a read or write error occurs)
      function gc(err) {
        // console.log('************** Garbage collecting file `' + __newFile.filename + '` located @ ' + filePath + '...');
        adapter.rm(filePath, function (gcErr) {
          if (gcErr) return done([err].concat([gcErr]));
          else return done();
        });
      }

      // Ensure necessary parent directories exist:
      fsx.mkdirs(dirPath, function (mkdirsErr) {
        // If we get an error here, it's probably because the Node
        // user doesn't have write permissions at the designated
        // path.
        if (mkdirsErr) {
          return done(mkdirsErr);
        }

        var outs__ = fsx.createWriteStream(filePath, encoding);
        __newFile.on('error', function (err) {
          // console.log('***** READ error on file ' + __newFile.filename, '::', err);
        });
        outs__.on('error', function failedToWriteFile(err) {
          // console.log('Error on output stream- garbage collecting unfinished uploads...');
          gc(err);
        });
        outs__.on('finish', function successfullyWroteFile() {
          done();
        });


        // Generate a progress stream and unique id for this file
        var localID = _.uniqueId();
        var __progress__ = ProgressStream({});
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

        // Used to calculate total size of this file (used for estimated %, etc.)
        // var total = (__newFile._readableState && __newFile._readableState.length) || milestone.length;
        var guessedTotal = 0;
        var __countBytes__ = require('stream').Transform();
        __countBytes__._transform = function (chunk, enctype, next) {
          guessedTotal += chunk.length;

          // Update the length on the progress stream to make % estimate
          // more accurate:
          __progress__.setLength(guessedTotal);

          this.push(chunk);
          next();
        };

        __progress__.on('progress', function singleFileProgress (milestone) {

          // Lookup or create new object to track file progress
          var currentFileProgress = _.find(receiver__._files, {
            id: localID
          });
          if (currentFileProgress) {
            currentFileProgress.written = milestone.transferred;
            currentFileProgress.total = milestone.length;
            currentFileProgress.percent = milestone.percentage;
          }
          else {
            currentFileProgress = {
              id          : localID,
              name        : __newFile.filename,
              written     : milestone.transferred,
              total       : milestone.length,
              percent     : milestone.percentage
            };
            receiver__._files.push(currentFileProgress);
          }
          ////////////////////////////////////////////////////////////////


          // Recalculate `totalBytesWritten` so far for this receiver instance
          // (across ALL OF ITS FILES)
          // using the sum of all bytes written to each file in `receiver__._files`
          totalBytesWritten = _.reduce(receiver__._files, function (memo, status) {
            memo += status.written;
            return memo;
          }, 0);

          // console.log(currentFileProgress.percent, '::', currentFileProgress.written,'/',currentFileProgress.total, '       (file #'+currentFileProgress.id+'   :: '+/*'update#'+counter*/''+')');//receiver__._files.length+' files)');
          // console.log(totalBytesWritten,currentFileProgress);
          // console.log(__newFile._readableState.length);

          // and then enforce its `maxBytes`.
          if (totalBytesWritten >= options.maxBytes) {
            var err = new Error();
            err.code = 'E_EXCEEDS_UPLOAD_LIMIT';
            err.name = 'Upload Error';
            err.maxBytes = options.maxBytes;
            err.written = totalBytesWritten;
            err.message = 'Upload limit of '+err.maxBytes+' bytes exceeded ('+err.written+' bytes written)';
            receiver__.emit('error', err);
          }

          // Emit an event on the receiver
          receiver__.emit('progress', currentFileProgress);

        });


        // Finally pipe the progress THROUGH the progress stream
        // and out to disk.
        __newFile
        .pipe(__countBytes__)
        .pipe(__progress__)
        .pipe(outs__);

      });

    };

    return receiver__;
  } // </DiskReceiver>


};

