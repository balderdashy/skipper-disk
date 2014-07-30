/**
 * Module dependencies
 */

var Writable = require('stream').Writable;
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

    rm: function(filepath, cb) {
      return fsx.unlink(filepath, function(err) {
        // Ignore "doesn't exist" errors
        if (err && (typeof err !== 'object' || err.code !== 'ENOENT')) {
          return cb(err);
        }
        else return cb();
      });
    },
    ls: function(dirpath, cb) {
      return fsx.readdir(dirpath, cb);
    },
    read: function(filepath, cb) {
      if (cb) {
        return fsx.readFile(filepath, cb);
      } else {
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
  function DiskReceiver(options) {
    options = options || {};

    ////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Removed this normalization:
    // TODO: handle in skipper core
    // (~mike)
    //
    // Normalize `saveAs()` option:
    // options.saveAs() <==> options.rename() <==> options.getFilename() <==> options.getFileName()
    // options.saveAs = options.saveAs || options.rename;
    // options.saveAs = options.saveAs || options.getFileName;
    // options.saveAs = options.saveAs || options.getFilename;
    //
    ////////////////////////////////////////////////////////////////////////////////////////////////

    _.defaults(options, {

      // By default, create new files on disk and generate a UUID
      saveAs: function(__newFile, cb) {
        options.filename = this.getUUID(__newFile);
        return cb(null);
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

    var receiver__ = Writable({
      objectMode: true
    });

    // if onProgress handler was provided, bind an event automatically:
    if (_.isFunction(options.onProgress)) {
      receiver__.on('progress', options.onProgress);
    }

    // Track the progress of each file upload in this Upstream.
    receiver__._files = [];

    // Keep track of the number total bytes written so that maxBytes can
    // be enforced.
    var totalBytesWritten = 0;



    //////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////
    // Removing the stuff below unless it's frequently requested
    // This is in order avoid issues with userland fns which implement `arguments[i]` usage, etc.
    //
    // Instead, just do:
    receiver__.saveAs = options.saveAs;


    // <removed-this-stuff>
    //
    // /*
    //  * Get arity of `func`
    //  *
    //  * @param {function} func - Function that sould be checked
    //  * @return {integer} - Count of params
    //  *
    //  * a variant of http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascriptleo
    //  */

    // function getArity(func) {

    //   var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    //   var ARGUMENT_NAMES = /([^\s,]+)/g;

    //   var fnStr = func.toString().replace(STRIP_COMMENTS, '');
    //   var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    //   if (result === null) {
    //     return 0;
    //   }

    //   return result.length;
    // }

    // If saveAs-Function have no callback (old style)
    // if (getArity(options.saveAs) < 2) {
    //   receiver__.saveAs = function(__newFile, cb) {
    //     options.filename = options.saveAs(__newFile);
    //     return cb(null);
    //   };
    // } else {
    //   receiver__.saveAs = options.saveAs;
    // }
    //
    // </removed-this-stuff>
    //////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////


    /* Generate a UUIDv4 Filename
     * @param {string} filename - Filename (e.g. 'foo.jpg')
     * @return {string} - UUID-Filename like 24d5f444-38b4-4dc3-b9c3-74cb7fbbc932.jpg - if filename invalid returns ""
     *
     */
    receiver__.getUUID = function(filename) {
      // if Filename was passend
      if (filename !== undefined && filename !== "") {
        return UUIDGenerator.v4() + path.extname(filename);
      } else {
        return "";
      }
    };

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
      } else {
        // Otherwise, use the more sophisiticated options:
        dirPath = path.resolve(options.dirname);

        // if Filename was set
        if (options.filename === undefined || options.filename === "") {
          filename = this.getUUID(__newFile.filename);
        } else {
          filename = options.filename;
        }

        filePath = path.join(dirPath, filename);
      }

      // Add write-filename to the file
      __newFile.filename_write = filename;

      // -------------------------------------------------------

      // Garbage-collect the bytes that were already written for this file.
      // (called when a read or write error occurs)
      function gc(err) {

        log('************** Garbage collecting file `' + __newFile.filename + '` located @ ' + filePath + '...');
        adapter.rm(filePath, function(gcErr) {
          if (gcErr) return done([err].concat([gcErr]));
          else return done(err);
        });
      }

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
        var outs__ = fsx.createWriteStream(filePath, encoding);

        // When the file is done writing, call the callback
        outs__.on('finish', function successfullyWroteFile() {
          log('finished file: ' + __newFile.filename);
          done();
        });

        // Generate a progress stream and unique id for this file
        // We will pipe the incoming file stream to this, which will
        // then pipe the bytes down to the outs___ stream
        var localID = _.uniqueId();
        var guessedTotal = 0;
        var writtenSoFar = 0;
        var __progress__ = new require('stream').Transform();
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
            gc(err);

            // Don't do this--it releases the underlying pipes, which confuses node when it's in the middle
            // of a write operation.
            // outs__.emit('error', err);
            return;

          }


        });


        // Finally pipe the progress THROUGH the progress stream
        // and out to disk.
        __newFile
          .pipe(__progress__)
          .pipe(outs__);

      });

    };

    return receiver__;
  } // </DiskReceiver>


};
