const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const axios = require('axios');
const _ = require('lodash');
const mime = require('mime');
const sharp = require('sharp');
const rimrafAsync = Promise.promisify(require('rimraf'));
const duAsync = Promise.promisify(require('du'));
const Vibrant = require('node-vibrant');
// const Logger = require('./logger');

// const logInfo = Logger.info.bind(null, null, 'image');
// const logError = Logger.error.bind(null, null, 'image');

class Image {

  static get mimeTypes() {
    return {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      svg: 'image/png',
    };
  }

  static async process(filePath) {
    let metadata = await sharp(filePath).metadata();

    metadata.mimeType = mime.getType(metadata.fileName);

    if (/^(jpeg|png)$/.test(metadata.format)) {
      const buffer = await fs.readFileAsync(filePath);

      const image = sharp(buffer);

      if (metadata.space !== 'srgb') {
        image.toColorspace('srgb');
      }

      const info = await image.withMetadata()
        .toFormat(metadata.format, {
          quality: 95,
          progressive: true,
        })
        .toFile(filePath);

      metadata = _.merge({}, metadata, info);
    }

    return {
      filePath,
      metadata,
    };
  }

  static async dzi(filePath, options = {}) {
    const file = path.parse(filePath);
    const dir = path.join(file.dir, file.name);
    const name = 'image';
    const dziFilePath = path.join(dir, name);

    try {
      await rimrafAsync(dir);
      await fs.mkdirAsync(dir);
    } catch (error) {
      //
    }

    await sharp(filePath)
      .jpeg({
        quality: 95,
        progressive: true,
      })
      .tile({
        size: options.size || 256,
        overlap: options.overlap || 0,
        container: 'fs',
        layout: 'dz',
      })
      .toFile(dziFilePath);

    const size = await duAsync(dir, { disk: true });

    return {
      fileName: `${name}.dzi`,
      fileSize: size,
      tiles: `${name}_files`,
      size: parseInt(options.size || 256, 10),
      overlap: parseInt(options.overlap || 0, 10),
    };
  }

  static async palette(url) {
    let palette = await Vibrant.from(url).getPalette();

    palette = _.mapValues(palette, (swatch) => {
      if (swatch) {
        swatch.getHex();
        swatch.getYiq();
      }
      return swatch;
    });

    palette = _.mapValues(palette, swatch => _.mapKeys(swatch, (value, key) => key.slice(1)));

    palette = _.mapValues(palette, swatch => (_.size(swatch) ? swatch : null));

    return palette;
  }

  /**
   *
   * Usage:
   *
   * q - quality
   * sh - sharpen
   * bl - blur
   * g - gravity [north|south|east|west|center|entropy|attention|face]
   * x,y,x2,y2 - crop coords
   * w - width [pixels (< 1: percent)]
   * h - height [pixels (< 1: percent)]
   * sm - scale mode [fit/contain|fill/cover]
   * f - output format [jpg/png/webp]
   *
   * Convert format eg. jpg -> png: [filename].jpg.png
   *
   */

  static async transform(url, settings) {
    const input = (await axios.get(url, { responseType: 'arraybuffer' })).data;

    const image = sharp(input);

    const metadata = await image.metadata();

    const width = metadata.width;
    const height = metadata.height;

    if (settings.sh) {
      settings.sh = settings.sh.split(':');

      if (settings.sh.length > 1) {
        const args = settings.sh.map(arg => Number(arg));
        image.sharpen(...args);
      }

      if (settings.sh.length === 1) {
        settings.sh = settings.sh[0];

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

    if (settings.b) {
      settings.b = /:/.test(settings.b) ? settings.b.split(':') : settings.b;
      image.background(settings.b).flatten();

    } else if (!/(png|webp|svg)/.test(settings.outputFormat)) {
      image.background('white').flatten();
    }

    if (/(png|svg)/.test(settings.outputFormat)) {
      image.png();

    } else if (/(webp)/.test(settings.outputFormat)) {
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

    return {
      buffer,
    };
  }

}

module.exports = Image;
