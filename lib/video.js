const path = require('path');
const Promise = require('bluebird');
const ffmpeg = Promise.promisifyAll(require('fluent-ffmpeg'));

// const Logger = require('./logger');

// const logInfo = Logger.info.bind(null, null, 'image');
// const logError = Logger.error.bind(null, null, 'image');

class Video {

  static async process(filePath) {
    const metadata = await ffmpeg.ffprobeAsync(filePath);

    await Video.thumbnail(filePath);

    return metadata;
  }

  static thumbnail(filePath) {
    return new Promise((resolve, reject) => {
      const file = path.parse(filePath);

      ffmpeg(filePath)
        // .on('filenames', (filenames) => {
        //   console.log(`Video.thumbnail: ${filenames.join(', ')}`);
        // })
        .on('end', resolve)
        .on('error', reject)
        .screenshots({
          folder: path.join(file.dir, file.name),
          timestamps: [0],
          filename: 'thumb.jpg',
        });
    });
  }

}

module.exports = Video;
