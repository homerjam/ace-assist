const _ = require('lodash');
const sharp = require('sharp');
const axios = require('axios');
const si = require('systeminformation');
const Logger = require('../lib/logger');
const asyncMiddleware = require('../lib/async-middleware');

const MIN_AVAIL_MEM = 64000000;

const mimeTypes = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/jpeg',
};

/*

Usage:

q - quality
sh - sharpen
bl - blur
g - gravity [north|south|east|west|center|entropy|attention|face]
x,y,x2,y2 - crop coords
w - width [pixels (< 1: percent)]
h - height [pixels (< 1: percent)]
sm - scale mode [fit/contain|fill/cover]
f - output format [jpg/png/webp]

Convert format eg. jpg -> png: [filename].jpg.png

*/

const transform = async (input, settings) => {
  const image = sharp(input);

  const metadata = await image.metadata();

  const width = metadata.width;
  const height = metadata.height;

  if (settings.sh) {
    if (_.isArray(settings.sh)) {
      const args = settings.sh.map(arg => Number(arg));
      image.sharpen(...args);
    }
    if (_.isString(settings.sh)) {
      switch (settings.sh.toLowerCase()) {
        case 'kirpan':
          image.sharpen(1, 0.4, 0.6);
          break;
        case 'default':
          image.sharpen();
          break;
        default:
          if (Number(settings.sh) >= 0.5) {
            image.sharpen(Number(settings.sh));
          }
          break;
      }
    }
  }

  if (settings.bl && Number(settings.bl) >= 0.3) {
    image.blur(Number(settings.bl));
  }

  if (settings.x && settings.y && settings.x2 && settings.y2) {
    settings.x = Number(settings.x);
    settings.y = Number(settings.y);
    settings.x2 = Number(settings.x2);
    settings.y2 = Number(settings.y2);

    if (settings.x <= 1) {
      settings.x = Math.round(width * settings.x);
    }
    if (settings.y <= 1) {
      settings.y = Math.round(height * settings.y);
    }
    if (settings.x2 <= 1) {
      settings.x2 = Math.round(width * settings.x2);
    }
    if (settings.y2 <= 1) {
      settings.y2 = Math.round(height * settings.y2);
    }

    image.extract({
      left: settings.x,
      top: settings.y,
      width: settings.x2 - settings.x,
      height: settings.y2 - settings.y,
    });
  }

  if (settings.w || settings.h) {
    if (settings.w && Number(settings.w) <= 1) {
      settings.w *= (width / 100);
    }

    if (settings.h && Number(settings.h) <= 1) {
      settings.h *= (height / 100);
    }


    if (!(settings.sm && /fill|cover/i.test(settings.sm)) || settings.g) {
      image.max();
    }

    const newWidth = parseInt(settings.w, 10) || null;
    const newHeight = parseInt(settings.h, 10) || null;

    image.resize(newWidth, newHeight);

    if (settings.w && settings.h && settings.g) {
      const g = settings.g.toLowerCase();

      if (/^(north|northeast|east|southeast|south|southwest|west|northwest|center|centre)$/.test(g)) {
        image.crop(sharp.gravity[g]);
      }
      if (/^(entropy|attention)$/.test(g)) {
        image.crop(sharp.strategy[g]);
      }
    }
  }

  if (settings.f && mimeTypes[settings.f]) {
    settings.outputFormat = settings.f;
  }

  if (settings.outputFormat === 'png') {
    image.png();

  } else if (settings.outputFormat === 'webp') {
    image.webp({
      quality: parseInt(settings.q || 100, 10),
    });

  } else {
    image.jpeg({
      quality: parseInt(settings.q || 100, 10),
      progressive: true,
    });
  }

  image.withMetadata();

  const buffer = await image.toBuffer();

  return buffer;
};

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

  const logPrefix = `${req.originalUrl} ${JSON.stringify(settings)}`;
  // const logInfo = Logger.info.bind(null, null, logPrefix);
  const logError = Logger.error.bind(null, res, logPrefix);

  try {
    let time = process.hrtime();

    const url = mode === 'local' ? `http://${bucket}.s3.amazonaws.com/${file}` : `http://${file}`;
    const response = await axios.get(url, { responseType: 'arraybuffer' });

    let buffer = await transform(response.data, settings);

    time = process.hrtime(time);
    time = `${(time[0] === 0 ? '' : time[0]) + (time[1] / 1000 / 1000).toFixed(2)}ms`;

    res.set('Content-Type', mimeTypes[settings.outputFormat]);
    res.set('Last-Modified', new Date(0).toUTCString());
    res.set('Cache-Tag', settings.slug);
    res.set('X-Time-Elapsed', time);

    res.status(200);
    res.send(buffer);

    buffer = null;

  } catch (error) {
    console.error(error);
    logError(error);
  }

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
