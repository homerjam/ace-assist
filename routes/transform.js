const _ = require('lodash');
const axios = require('axios');
const si = require('systeminformation');
const Image = require('../lib/image');
const Logger = require('../lib/logger');
const asyncMiddleware = require('../lib/async-middleware');

const MIN_AVAIL_MEM = 64000000;

const transformHandler = async ({ bucket }, req, res) => {
  const mode = req.params.fileName ? 'local' : 'proxy';

  let settings = {};
  let options;
  let useQuery;
  let file;

  try {
    useQuery = true;

    // Take settings from json string after ?
    settings = JSON.parse(Object.keys(req.query)[0]);

    if (!_.isObject(settings)) {
      Logger.error(res, req.url, 'invalid settings');
      return;
    }
  } catch (error) {
    useQuery = false;

    if (req.params.options) {
      // Take settings from params
      options = req.params.options;
    }

    if (mode === 'proxy') {
      // Take settings from first part of params
      options = req.params[0].split('/')[0];
    }

    if (!options) {
      Logger.error(res, req.url, error);
      return;
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
    const fileNameParts = req.params.fileName.split('.');
    const fileName = fileNameParts.length > 2 ? fileNameParts.slice(0, fileNameParts.length - 1).join('.') : req.params.fileName;

    file = `${slug}/${fileName}`;

    settings.outputFormat = fileNameParts.slice(-1)[0].toLowerCase();
  }

  if (mode === 'proxy') {
    if (useQuery) {
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

  const url = mode === 'local' ? `http://${bucket}.s3.amazonaws.com/${file}` : `http://${file}`;

  const logPrefix = `${req.originalUrl} ${JSON.stringify(settings)}`;
  // const logInfo = Logger.info.bind(null, null, logPrefix);
  const logError = Logger.error.bind(null, res, logPrefix);

  let time = process.hrtime();

  let buffer;

  // TODO: check and use filru cache using url/settings as key
  // for video use 'touch' to create empty key/placeholder and overwrite
  // if zero bytes then serve encoding in progress video

  try {
    buffer = await Image.transform((await axios.get(url, { responseType: 'arraybuffer' })).data, settings);
  } catch (error) {
    console.error(error);
    logError(error);
  }

  time = process.hrtime(time);
  time = `${(time[0] === 0 ? '' : time[0]) + (time[1] / 1000 / 1000).toFixed(2)}ms`;

  res.set('Content-Type', Image.mimeTypes[settings.outputFormat]);

  res.set('Last-Modified', new Date(0).toUTCString());
  res.set('Cache-Tag', settings.slug);
  res.set('X-Time-Elapsed', time);

  res.status(200);
  res.send(buffer);

  buffer = null;

  try {
    si.mem((mem) => {
      if (mem.available < MIN_AVAIL_MEM) {
        global.gc();
      }
    });
  } catch (error) {
    console.error('Couldn\'t collect garbage, please run with --expose-gc option');
  }
};

module.exports = ({
  app,
  bucket,
}) => {

  const transformHandlerAsync = asyncMiddleware(transformHandler.bind(app, { bucket }));

  app.get('/:slug/proxy/transform/*', transformHandlerAsync);

  app.get('/:slug/transform/:options/:fileName/:originalFileName', transformHandlerAsync);

  app.get('/:slug/transform/:options/:fileName', transformHandlerAsync);

  app.get('/:slug/transform/:fileName', transformHandlerAsync);

};
