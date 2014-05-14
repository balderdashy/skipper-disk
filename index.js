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

    // if onProgress handler was provided, bind an event automatically:
    if (_.isFunction(options.onProgress)) {
      receiver__.on('progress', options.onProgress);
    }

    // Track the progress of each file upload in this Upstream.
    receiver__._files = [];

    // Keep track of the number total bytes written so that maxBytes can
    // be enforced.
    var totalBytesWritten = 0;

    // Flag to track whether this file upload has been aborted.
    // receiver__._aborted = false;

    // And a function to abort it.
    // (returns true if abort is redundant)
    // var abort = function () {
    //   if (receiver__._aborted) return false;
    //   else receiver__._aborted = true;
    //   console.log('Aborted receiver.');

    //   // Pipe all of our files to /dev/null
    //   _.each(receiver__._files, function (file) {
    //     console.log('piping file ('+file.name+') down the leaky drain');
    //     var leaky = new Writable();
    //     leaky._write = function (chunk,encoding, cb) { console.log(chunk.length,'bytes down the drain, whee!!!'); cb(); };
    //     file.stream.unpipe();
    //     file.stream.pipe( leaky );
    //   });

    //   return true;
    // };

    // This `_write` method is invoked each time a new file is received
    // from the Readable stream (Upstream) which is pumping filestreams
    // into this receiver.  (filename === `__newFile.filename`).
    receiver__._write = function onFile(__newFile, encoding, done) {


      // var _done = done;
      // done = function () {
      //   console.log('CALLED DONE ON RECEIVER WITH ARGS:',Array.prototype.slice.call(arguments));
      //   _done.apply(null, Array.prototype.slice.call(arguments));
      // };

      console.log('new file received:', __newFile.filename);

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
          else return done(err);
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

        __newFile.on('error', function (err) {
          // var leaky = new Writable();
          // leaky._write = function (chunk,encoding, cb) { cb(); };
          // __newFile.unpipe();
          // __newFile.pipe( leaky );
          console.log('***** READ error on file ' + __newFile.filename, '::', err);
        });


        var outs__ = fsx.createWriteStream(filePath, encoding);
        outs__.on('error', function failedToWriteFile(err) {
          // if ( !abort() ) return;
          console.log('Error on output stream- garbage collecting unfinished uploads...', err);
          gc(err);
        });
        outs__.on('finish', function successfullyWroteFile() {
          console.log('finished file: '+__newFile.filename);
          // if ( !abort() ) return;
          done();
        });


        // Generate a progress stream and unique id for this file
        var localID = _.uniqueId();
        // var __progress__ = ProgressStream({});
        var guessedTotal = 0;
        var writtenSoFar = 0;
        var __progress__ = new require('stream').Transform();
        __progress__._transform = function (chunk,enctype,next) {

          // Update the guessedTotal to make % estimate
          // more accurate:
          guessedTotal += chunk.length;
          writtenSoFar += chunk.length;

          this.push(chunk);
          this.emit('progress', {
            id: localID,
            name: __newFile.name,
            written: writtenSoFar,
            total: guessedTotal,
            percent: (writtenSoFar/guessedTotal)*100 | 0
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

        // Used to calculate total size of this file (used for estimated %, etc.)
        // var total = (__newFile._readableState && __newFile._readableState.length) || milestone.length;
        // var guessedTotal = 0;
        // var __countBytes__ = require('stream').Transform();
        // __countBytes__._transform = function (chunk, enctype, next) {
        //   guessedTotal += chunk.length;

        //   // Update the length on the progress stream to make % estimate
        //   // more accurate:
        //   __progress__.setLength(guessedTotal);

        //   this.push(chunk);
        //   next();
        // };

        __progress__.on('progress', function singleFileProgress (milestone) {

          // Lookup or create new object to track file progress
          var currentFileProgress = _.find(receiver__._files, {
            id: localID
          });
          if (currentFileProgress) {
            currentFileProgress.written = milestone.written;
            currentFileProgress.total = milestone.total;
            currentFileProgress.percent = milestone.percent;
            currentFileProgress.stream = __newFile;
          }
          else {
            currentFileProgress = {
              id          : localID,
              name        : __newFile.filename,
              written     : milestone.written,
              total       : milestone.total,
              percent     : milestone.percent,
              stream      : __newFile
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

          console.log(currentFileProgress.percent, '::', currentFileProgress.written,'/',currentFileProgress.total, '       (file #'+currentFileProgress.id+'   :: '+/*'update#'+counter*/''+')');//receiver__._files.length+' files)');
          // console.log(totalBytesWritten,currentFileProgress);
          // console.log(__newFile._readableState.length);

          // Emit an event on the receiver
          receiver__.emit('progress', currentFileProgress);

          // and then enforce its `maxBytes`.
          if (options.maxBytes && totalBytesWritten >= options.maxBytes) {
            // if ( !abort() ) return;
            // __progress__.removeAllListeners('progress');

            // TODO:Pipe the remainder of this file to /dev/null
            // _.each(receiver__._files, function (file) {
            //   console.log('piping file ('+file.name+') down the leaky drain');
            //   var leaky = new Writable();
            //   leaky._write = function (chunk,encoding, cb) { console.log(chunk.length,'bytes down the drain, whee!!!'); cb(); };
            //   file.stream.unpipe();
            //   file.stream.pipe( leaky );
            // });


            var err = new Error();
            err.code = 'E_EXCEEDS_UPLOAD_LIMIT';
            err.name = 'Upload Error';
            err.maxBytes = options.maxBytes;
            err.written = totalBytesWritten;
            err.message = 'Upload limit of '+err.maxBytes+' bytes exceeded ('+err.written+' bytes written)';
            // __newFile.emit('error', err);
            console.log('unpiping all the things...');

            // __progress__.unpipe();
            // var memoryhole0 = new Writable();
            // memoryhole0._write = function (chunk,encoding, cb) {
            //   console.log(__newFile.filename, chunk.length,'bytes down the drain to the memory hole (draining __progress__)');
            //   cb();
            // };
            // __progress__.pipe(memoryhole0);
            // receiver__.emit('error', err);
            __progress__.removeAllListeners('progress');
            outs__.emit('error', err);
            return;
            // return done(err);
            // __newFile.unpipe();
            // var memoryhole = new Writable();
            // memoryhole._write = function (chunk,encoding, cb) {
            //   console.log(__newFile.filename, chunk.length,'bytes down the drain to the memory hole (draining __newFile)');
            //   cb();
            // };
            // __newFile.pipe(memoryhole);
            // var x;
            // console.log('past unpipes');
            // __countBytes__.unpipe();
            // outs__.unpipe();
            // console.log('past unpipes');
            // while (x !== null) {
            //   x = __progress__.read();
            // }
            // while (x !== null) {
            //   x = __countBytes__.read();
            // }
            // while (x !== null) {
            //   x = __newFile.read();
            // }
            // console.log('past reads');
            // outs__.end();
            // console.log('made it');

            // __progress__.on('data', function () {});
            // __progress__.resume();


            // var leaky1 = new Writable();
            // leaky1._write = function (chunk,encoding, cb) { /*console.log(chunk.length,'bytes down the drain, whee!!!');*/ cb(); };
            // __newFile.pipe(leaky1);

            // var leaky2 = new Writable();
            // leaky2._write = function (chunk,encoding, cb) { /*console.log(chunk.length,'bytes down the drain, whee!!!');*/ cb(); };
            // __countBytes__.pipe(leaky2);
            //   file.stream.pipe( leaky );
            // outs__.removeAllListeners();
            // outs__.end();
            // outs__.on('error', function (){});
            // return done(err);
            // return done();
          }


        });


        // Finally pipe the progress THROUGH the progress stream
        // and out to disk.
        __newFile
        // .pipe(__countBytes__)
        .pipe(__progress__)
        .pipe(outs__);

      });

    };

    return receiver__;
  } // </DiskReceiver>


};



