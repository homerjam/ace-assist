const _ = require('lodash');
const axios = require('axios');
const si = require('systeminformation');
const Filru = require('filru');
const Image = require('../lib/image');
const AV = require('../lib/av');
const Logger = require('../lib/logger');
const asyncMiddleware = require('../lib/async-middleware');

const MIN_AVAIL_MEM = 1024 * 1024 * 50; // 50 megabytes

let filru;

const transformHandler = async ({ bucket }, req, res) => {
  try {
    si.mem((mem) => {
      if (mem.available < MIN_AVAIL_MEM) {
        global.gc();
      }
    });
  } catch (error) {
    console.error('Couldn\'t collect garbage, please run with --expose-gc option');
  }

  const mode = req.params.fileName ? 'local' : 'proxy';
  let settings = {};
  let querySettings;
  let options;
  let file;

  try {
    // Take settings from json string after ?
    querySettings = JSON.parse(Object.keys(req.query)[0]);
    if (_.isObject(querySettings)) {
      settings = querySettings;
    } else {
      querySettings = false;
    }
  } catch (error) {
    //
  }

  if (!querySettings) {
    if (req.params.options) {
      // Take settings from params
      options = req.params.options;
    }

    if (mode === 'proxy') {
      // Take settings from first part of params
      options = req.params[0].split('/')[0];
    }
  }

  if (options) {
    settings = {};
    options = options.split(/,|;/);

    options = options.filter(option => /_|:/.test(option));

    if (options.length === 0) {
      Logger.error(res, req.url, 'invalid options');
      return;
    }

    options.forEach((option) => {
      option = option.split(/_|:/);

      const key = option[0].toLowerCase();
      const value = option.length > 2 ? option.slice(1) : option[1];

      if (settings[key] && _.isArray(settings[key])) {
        settings[key].push(value);
      } else if (settings[key]) {
        settings[key] = [settings[key], value];
      } else {
        settings[key] = value;
      }
    });
  }

  const slug = req.params.slug || settings.slug;
  settings.slug = slug;

  if (mode === 'local') {
    let fileName = req.params.originalFileName ? `${req.params.fileName}/${req.params.originalFileName}` : req.params.fileName;
    const fileNameParts = fileName.split(/(\.|\/)/);
    fileName = [2, 5, 7].indexOf(fileNameParts.length) > -1 ? fileNameParts.slice(0, 3).join('') : fileName;

    file = `${slug}/${fileName}`;

    settings.outputFormat = fileNameParts.slice(-1)[0].toLowerCase();
  }

  if (mode === 'proxy') {
    if (querySettings) {
      file = req.params[0];
    } else {
      file = req.params[0].split('/').slice(1).join('/');

      const qs = req.originalUrl.split('?')[1];
      if (qs) {
        file = `${file}?${qs}`;
      }
    }

    settings.outputFormat = req.params[0].split('.').slice(-1)[0].toLowerCase();
  }

  if (settings.f) {
    settings.outputFormat = settings.f;
  }

  settings.inputFormat = file.split('.').slice(-1)[0].toLowerCase();

  const logPrefix = `${req.originalUrl} ${JSON.stringify(settings)}`;
  // const logInfo = Logger.info.bind(null, null, logPrefix);
  const logError = Logger.error.bind(null, res, logPrefix);

  let type;
  if (Image.mimeTypes[settings.outputFormat]) {
    type = 'image';
  }
  if (AV.mimeTypes[settings.outputFormat]) {
    type = 'av';
  }
  if (!type) {
    logError(new Error(`Unsupported output format: ${settings.outputFormat}`));
    return;
  }

  const url = mode === 'local' ? `http://${bucket}.s3.amazonaws.com/${file}` : `http://${file}`;
  const key = `[${url}](${JSON.stringify(_.toPairs(settings).sort())})`;
  const hashKey = Filru.hash(key);

  let response;
  let cachedResponse = false;
  let time = process.hrtime();

  try {
    response = await filru.get(key);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(error);
    }
  }

  if (!response) {
    try {
      if (type === 'image') {
        response = await Image.transform((await axios.get(url, { responseType: 'arraybuffer' })).data, settings);
      }
      if (type === 'av') {
        response = await AV.transform((await axios.get(url, { responseType: settings.inputFormat === 'gif' ? 'arraybuffer' : 'stream' })).data, settings, hashKey);
      }
    } catch (error) {
      if (_.get(error, 'response.status') !== 403) {
        console.error(error.toString());
      }
      logError(error);
      return;
    }
  } else {
    cachedResponse = true;
  }

  time = process.hrtime(time);
  time = `${(time[0] === 0 ? '' : time[0]) + (time[1] / 1000 / 1000).toFixed(2)}ms`;

  res.setHeader('Content-Type', Image.mimeTypes[settings.outputFormat] || AV.mimeTypes[settings.outputFormat]);
  res.setHeader('Last-Modified', new Date(0).toUTCString());
  res.setHeader('Cache-Tag', settings.slug);
  res.setHeader('X-Time-Elapsed', time);
  res.setHeader('X-Cached-Response', cachedResponse);

  res.status(200);

  if (response.promise) {
    response.promise
      .then((buffer) => {
        filru.set(key, buffer);
      });
  }

  if (response instanceof Buffer) {
    try {
      await filru.set(key, response);
    } catch (error) {
      console.log(error);
    }

    res.sendSeekable(response);

    return;
  }

  if (response.stream) {
    req.on('close', () => {
      if (response.ffmpeg) {
        response.ffmpeg.kill();
      }
    });

    response.stream.pipe(res, { end: true });

    return;
  }

  if (response.placeholder) {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Expires', '-1');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(response.placeholder);
  }
};

module.exports = ({
  app,
  bucket,
  cacheDir,
  cacheMaxSize,
}) => {

  filru = new Filru(cacheDir, cacheMaxSize);
  filru.start();

  const transformHandlerAsync = asyncMiddleware(transformHandler.bind(app, { bucket }));

  app.get('/:slug/proxy/transform/*', transformHandlerAsync);

  app.get('/:slug/transform/:options/:fileName/:originalFileName', transformHandlerAsync);

  app.get('/:slug/transform/:options/:fileName', transformHandlerAsync);

  app.get('/:slug/transform/:fileName', transformHandlerAsync);

};
