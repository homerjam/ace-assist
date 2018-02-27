const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const _ = require('lodash');
const mime = require('mime');
const sharp = require('sharp');
const rimrafAsync = Promise.promisify(require('rimraf'));
const duAsync = Promise.promisify(require('du'));
// const Logger = require('./logger');

// const logInfo = Logger.info.bind(null, null, 'image');
// const logError = Logger.error.bind(null, null, 'image');

class Image {

  static async processImage(filePath) {
    let metadata = await sharp(filePath).metadata();

    metadata.mimeType = mime.getType(metadata.fileName);

    if (/^(jpeg|png)$/.test(metadata.format)) {
      const buffer = await fs.readFileAsync(filePath);

      const info = await sharp(buffer)
        .toColorspace('srgb')
        .withMetadata()
        .toFormat(metadata.format, {
          quality: 95,
          progressive: true,
        })
        .toFile(filePath);

      metadata = _.merge({}, metadata, info);
    }

    return metadata;
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

    const size = await duAsync(dir, {
      disk: true,
    });

    return {
      dir: file.name,
      fileName: `${name}.dzi`,
      fileSize: size,
      tiles: `${name}_files`,
      size: parseInt(options.size || 256, 10),
      overlap: parseInt(options.overlap || 0, 10),
    };
  }

}

module.exports = Image;
