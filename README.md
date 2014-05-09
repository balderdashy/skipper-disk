# [<img title="skipper-disk - Local disk adapter for Skipper" src="http://i.imgur.com/P6gptnI.png" width="200px" alt="skipper emblem - face of a ship's captain"/>](https://github.com/balderdashy/skipper-disk) Disk Adapter

[![NPM version](https://badge.fury.io/js/skipper-disk.png)](http://badge.fury.io/js/skipper-disk) &nbsp; &nbsp;
[![Build Status](https://travis-ci.org/balderdashy/skipper-disk.svg?branch=master)](https://travis-ci.org/balderdashy/skipper-disk)

Local filesystem adapter for streaming multipart uploads via Skipper.


## Installation

```
$ npm install skipper-disk --save
```


## Usage

To upload files, configure a blob adapter and build a receiver (`receiving`):

```js
var blobAdapter = require('skipper-disk')();
var receiving = blobAdapter.receive();
```

Then upload file(s) from a particular field into it:

```js
req.file('foo').upload(receiving), function (err, filesUploaded) {
  // ...
});
```



## Options

All options may be passed either into the blob adapter's factory method:

```js
var blobAdapter = require('skipper-disk')({
  // These options will be applied unless overridden.
});
```

Or directly into a receiver:

```js
var receiving = blobAdapter.receive({
  // Options will be applied only to this particular receiver.
});
```


| Option    | Type       | Details |
|-----------|:----------:|---------|
| `dirname`  | ((string)) | The path to the directory on disk where file uploads should be streamed.  May be specified as an absolute path (e.g. `/Users/mikermcneil/foo`) or a relative path from the current working directory.  Defaults to `".tmp/uploads/"`
| `rename()`  | ((function)) | An optional function that can be used to define the logic for naming files. For example: <br/> `function (file) {return Math.random()+file.name;} });` <br/> By default, the filename of the uploaded file is used, including the extension (e.g. `"Screen Shot 2014-05-06 at 4.44.02 PM.jpg"`.  If a file already exists at `dirname` with the same name, it will be overridden. |


========================================

## Advanced Usage

#### `.pipe(receiving)`

As an alternative to the `upload()` method, you can pipe an incoming **Upstream** returned from `req.file()` (a Readable stream of Readable binary streams) directly to the receiver (a Writable stream designed to support a Readable stream of Readable binary streams.)

```js
req.file('foo').pipe(receiving);
```

> **Note:**
>
> There is no performance benefit to using `.pipe()` instead of `.upload()`-- they both use streams2.  The `.pipe()` method is available merely as a matter of flexibility/chainability.  Be aware that `.upload()` handles the `error` and `finish` events for you; if you choose to use `.pipe()`, you will of course need to listen for these events manually:
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
