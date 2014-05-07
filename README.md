# [<img title="skipper-disk - Local disk adapter for Skipper" src="http://i.imgur.com/P6gptnI.png" width="125px" alt="skipper emblem - face of a ship's captain"/>](https://github.com/balderdashy/skipper-disk) Disk Adapter

[![Bower version](https://badge.fury.io/bo/skipper-disk.png)](http://badge.fury.io/bo/skipper-disk)
[![NPM version](https://badge.fury.io/js/skipper-disk.png)](http://badge.fury.io/js/skipper-disk) &nbsp; &nbsp;
[![Build Status](https://travis-ci.org/balderdashy/skipper-disk.svg?branch=master)](https://travis-ci.org/balderdashy/skipper-disk)

Local filesystem adapter for streaming multipart uploads via Skipper.


## Usage

```
$ npm install skipper-disk --save
```

```js
// ...
var adapter = require('skipper-disk')({ /* default opts */ });
var receiver = adapter.receiver({
  /* per-request opts */
  id: 'foo.jpg'
});

req.file('foo').upload(receiver, function (err, filesUploaded) {
  // ...
});

// :or alternatively:
// req.file('foo').pipe(receiver);

// ...
```

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
