const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const _ = require('lodash');
const mime = require('mime');
const sharp = require('sharp');
const duAsync = Promise.promisify(require('du'));
const Logger = require('./logger');

// const logInfo = Logger.info.bind(null, null, 'image');
const logError = Logger.error.bind(null, null, 'image');

class Image {

  static processImage (filePath, filePathOut) {
    return new Promise((resolve, reject) => {
      sharp(filePath)
        .metadata()
        .then((metadata) => {
          let ext;

          if (!/^(jpeg|png)$/.test(metadata.format)) {
            ext = path.extname(filePath).toLowerCase().replace('jpeg', 'jpg');
            filePathOut = `${filePathOut}${ext}`;

            metadata.fileName = path.basename(filePathOut);
            metadata.mimeType = mime.getType(metadata.fileName);

            fs.renameAsync(filePath, filePathOut)
              .then(() => {
                resolve(metadata);
              })
              .catch((error) => {
                logError(error);
                resolve(metadata);
              });
            return;
          }

          ext = metadata.format.replace('jpeg', 'jpg');
          filePathOut = `${filePathOut}.${ext}`;

          metadata.fileName = path.basename(filePathOut);
          metadata.mimeType = mime.getType(metadata.fileName);

          sharp(filePath)
            .toColorspace('srgb')
            .withMetadata()
            .toFormat(metadata.format, {
              quality: 95,
              progressive: true,
            })
            .toFile(filePathOut)
            .then((info) => {
              _.extend(metadata, info);

              fs.unlinkAsync(filePath)
                .then(() => {
                  resolve(metadata);
                })
                .catch((error) => {
                  logError(error);
                  resolve(metadata);
                });
            }, reject);
        });
    });
  }

  static dzi (filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const file = path.parse(filePath);

      const name = 'image';
      const dir = path.join(file.dir, file.name);
      const dziFilePath = path.join(dir, name);

      fs.mkdirAsync(dir)
        .then(() => {
          sharp(filePath)
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
            .toFile(dziFilePath)
            .then(() => {
              duAsync(dir, {
                disk: true,
              })
                .then((size) => {
                  resolve({
                    dir: file.name,
                    fileName: name + '.dzi',
                    fileSize: size,
                    tiles: name + '_files',
                    size: options.size || 256,
                    overlap: options.overlap || 0,
                  });
                }, reject);
            }, reject);
        }, reject);
    });
  }

}

module.exports = Image;
