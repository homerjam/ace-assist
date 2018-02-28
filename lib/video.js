const _ = require('lodash');
const Promise = require('bluebird');
const path = require('path');
const ffmpeg = Promise.promisifyAll(require('fluent-ffmpeg'));

// const Logger = require('./logger');

// const logInfo = Logger.info.bind(null, null, 'image');
// const logError = Logger.error.bind(null, null, 'image');

// ffmpeg.getAvailableFormats((err, formats) => {
//   console.log('Available formats:');
//   // console.dir(formats);
//   _.forEach(formats, (format, formatId) => {
//     console.log(formatId);
//   });
// });

// ffmpeg.getAvailableCodecs((err, codecs) => {
//   console.log('Available codecs:');
//   // console.dir(codecs);
//   _.forEach(codecs, (codec, codecId) => {
//     console.log(codecId);
//   });
// });

class Video {

  static get mimeTypes() {
    return {
      mp4: 'video/mp4',
      webm: 'video/webm',
    };
  }

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

  static async transform(input, settings) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(input)

        // .format('mp4')
        // .videoCodec('libx264')
        // .audioCodec('aac')

        .format('webm')
        .videoCodec('libvpx-vp9')
        .audioCodec('libvorbis')

        .videoBitrate(1000)
        .size('?x360')

        .on('progress', (progress) => {
          console.log('Video.transform: progress:', progress);
        })
        .on('error', (error) => {
          console.error('Video.transform: error:', error);
        })
        .on('start', (cmd) => {
          console.log('Video.transform: start:', cmd);
        })
        .on('end', () => {
          console.log('Video.transform: end');
        });

      resolve(command.pipe());
    });
  }

}

module.exports = Video;
