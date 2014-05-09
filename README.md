# [<img title="skipper-disk - Local disk adapter for Skipper" src="http://i.imgur.com/P6gptnI.png" width="200px" alt="skipper emblem - face of a ship's captain"/>](https://github.com/balderdashy/skipper-disk) Disk Adapter

[![NPM version](https://badge.fury.io/js/skipper-disk.png)](http://badge.fury.io/js/skipper-disk) &nbsp; &nbsp;
[![Build Status](https://travis-ci.org/balderdashy/skipper-disk.svg?branch=master)](https://travis-ci.org/balderdashy/skipper-disk)

Local filesystem adapter for streaming multipart uploads via Skipper.


## Installation

```
$ npm install skipper-disk --save
```


## Usage

To upload files, build and configure a receiver (`outs`):

```js
var UploadAdapter = require('skipper-disk')({/* generalOpts */});
var receiving = ServerFilesystem.receiver({ /* perRequestOpts */ });
```

Then upload file(s) from a particular field into it:

```js
req.file('foo').upload(receiving), function (err, filesUploaded) {
  // ...
});
```



## Options

All options may be passed either into the `skipper-disk` factory method:

```js
var BlobAdapter = require('skipper-disk')({
  /* generalOpts */
});
```

Or directly into the receiver:

```js
var receiving = ServerFilesystem.receiver({
  /* perRequestOpts */
});
```


For example:

```js
// ...
var adapter = require('skipper-disk')({ /* default opts */ });
var receiver = adapter.receiver({
  /* per-request opts */
  id: 'foo.jpg'
});

```


| Option    | Type       | Details |
|-----------|:----------:|---------|
| `dirname`  | ((string)) | The path to the directory on disk where file uploads should be streamed.  May be specified as an absolute path (e.g. `/Users/mikermcneil/foo`) or a relative path from the current working directory.  Defaults to `".tmp/uploads/"`
| `rename()`  | ((function)) | An optional function that can be used to define the logic for naming files.  By default, the filename of the uploaded file is used. |


========================================

## Advanced Usage

#### `upstream.pipe(receiving)`

As an alternative to the `upload()` method, you can pipe the incoming **Upstream** returned from `req.file()` (a Readable stream of Readable binary streams) directly to the receiver (a Writable stream designed to support a Readable stream of Readable binary streams.)

```js
req.file('foo').pipe(receiving);
```

> **Note:**
>
> There is no performance benefit to using `.pipe()` instead of `.upload()`-- they both use streams2.  The `.pipe()` method is available as a matter of flexibility/chainability. If you do choose to use it, be sure to listen for error events:
>
> ```js
> req.file('foo')
> .on('error', function onError() { ... })
> .on('finish', function onSuccess() { ... })
> .pipe(receiving)
> ```
>

========================================

## Contribute

See `CONTRIBUTING.md`.


========================================

### Version

This repository holds the socket client SDK for Sails versions 0.10.0 and up.  If you're looking for the SDK for the v0.9.x releases of Sails, the source is [located here](https://github.com/balderdashy/sails/blob/v0.9.16/bin/boilerplates/assets/js/sails.io.js).

========================================

### License

**[MIT](./LICENSE)**
&copy; 2014
[Mike McNeil](http://michaelmcneil.com), [Balderdash](http://balderdash.co) & contributors

See `LICENSE.md`.

This module is part of the [Sails framework](http://sailsjs.org), and is free and open-source under the [MIT License](http://sails.mit-license.org/).


![image_squidhome@2x.png](http://i.imgur.com/RIvu9.png)


[![githalytics.com alpha](https://cruel-carlota.pagodabox.com/a22d3919de208c90c898986619efaa85 "githalytics.com")](http://githalytics.com/balderdashy/sails.io.js)
