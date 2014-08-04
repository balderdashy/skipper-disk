# Simplified example

It is helpful to look at a somewhat simplified example of the `receive()` method defined in this adapter:

```js
module.exports = function receive(options) {
  var receiver__ = WritableStream({ objectMode: true });
  receiver__._write = function onFile(__newFile, unused, done) {
    if (!__newFile.fd.match(/^\//)) {
      __newFile.fd = path.resolve(__newFile.fd);
    }

    fsx.mkdirs(path.dirname(fd), function(mkdirsErr) {
      if (mkdirsErr) return done(mkdirsErr);

      var outs__ = fsx.createWriteStream(fd);
      outs__.on('finish', function successfullyWroteFile() {
        done();
      });
      __newFile.pipe(outs__);
    });
  };
  return receiver__;
};
```
