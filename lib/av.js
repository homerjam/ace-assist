const _ = require('lodash');
const Promise = require('bluebird');
const path = require('path');
const axios = require('axios');
const stream = require('stream');
const fs = Promise.promisifyAll(require('fs'));
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

const DEFAULT_BITRATE_VIDEO = 1000;
const DEFAULT_BITRATE_AUDIO = 128;

module.exports = class AV {

  static get mimeTypes() {
    return {
      mp4: 'video/mp4',
      webm: 'video/webm',
      m3u8: 'application/x-mpegURL',
      ts: 'video/MP2T',
      gif: 'image/gif',
      mp3: 'audio/mpeg',
      aac: 'audio/aac',
      weba: 'audio/weba',
      m4v: 'video/x-m4v',
    };
  }

  static get placeholders() {
    return {
      audio: path.join(__dirname, '../assets/encoding.mp4'),
      image: path.join(__dirname, '../assets/encoding.mp4'),
      video: path.join(__dirname, '../assets/encoding.mp4'),
    };
  }

  static async process(filePath) {
    const metadata = await ffmpeg.ffprobeAsync(filePath);

    const videoStream = metadata.streams.filter(stream => stream.codec_type === 'video')[0];

    if (videoStream) {
      await AV.thumbnail(filePath);
    }

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

  static async transform(url, settings, hashKey) {
    return new Promise(async (resolve, reject) => {
      let inputFile;
      const outputFile = path.join(__dirname, '../tmp', `${hashKey}.out.${settings.outputFormat}`);
      const outputOptions = [];
      const type = AV.mimeTypes[settings.outputFormat].split('/')[0];

      if (fs.existsSync(outputFile)) {
        resolve({
          placeholder: AV.placeholders[type],
        });
        return;
      }

      fs.writeFileSync(outputFile, '');

      const input = (await axios.get(url, { responseType: settings.inputFormat === 'gif' ? 'arraybuffer' : 'stream' })).data;

      if (input instanceof Buffer) {
        inputFile = path.join(__dirname, '../tmp', `${hashKey}.in.${settings.outputFormat}`);
        await fs.writeFileAsync(inputFile, input);
      }

      const command = ffmpeg(inputFile || input);
      // let passThroughStream;

      command.inputFormat(settings.inputFormat);

      if (settings.outputFormat === 'mp4') {
        command
          .output(outputFile)
          .format('mp4')
          .videoCodec('libx264')
          .audioCodec('libfdk_aac');
      }

      if (settings.outputFormat === 'webm') {
        command
          .output(outputFile)
          .format('webm')
          .videoCodec('libvpx-vp9')
          .audioCodec('libvorbis');

        // passThroughStream = new stream.PassThrough();
        // command
        //   .output(passThroughStream)
        //   .format('webm')
        //   .videoCodec('libvpx-vp9')
        //   .audioCodec('libvorbis');
      }

      if (settings.outputFormat === 'mp3') {
        command
          .output(outputFile)
          .format('mp3')
          .noVideo()
          .audioCodec('libmp3lame');
      }

      if (settings.outputFormat === 'aac') {
        command
          .output(outputFile)
          .format('aac')
          .noVideo()
          .audioCodec('libfdk_aac');
      }

      if (settings.outputFormat === 'gif') {
        command
          .output(outputFile)
          .format('gif');
      }

      const bv = parseInt(settings.bv !== undefined ? settings.bv : DEFAULT_BITRATE_VIDEO, 10);
      if (bv === 0) {
        command.noVideo();
      } else {
        command.videoBitrate(bv);
      }

      const ba = parseInt(settings.ba !== undefined ? settings.ba : DEFAULT_BITRATE_AUDIO, 10);
      if (ba === 0) {
        command.noAudio();
      } else {
        command.audioBitrate(ba);
      }

      // Force dimensions to be divisible by 2
      if (settings.w || settings.h) {
        settings.w = settings.w ? Math.floor(settings.w / 2) * 2 : '?';
        settings.h = settings.h ? Math.floor(settings.h / 2) * 2 : '?';
        command.size(`${settings.w}x${settings.h}`);
      } else {
        outputOptions.push('-filter:v crop=\'floor(in_w/2)*2:floor(in_h/2)*2\'');
      }

      if (settings.s) {
        command.seek(settings.s);
      }

      if (settings.d) {
        command.duration(settings.d);
      }

      command.outputOptions([
        '-pix_fmt yuv420p',
        '-movflags +faststart',
      ].concat(outputOptions));

      command
        .on('start', (cmd) => {
          console.log('AV.transform: start:', cmd);
        })
        .on('progress', (progress) => {
          // console.log('AV.transform: progress:', progress);
        });

      const promise = new Promise((resolve, reject) => {
        command
          .on('end', async (...args) => {
            try {
              const buffer = await fs.readFileAsync(outputFile);

              try {
                await fs.unlinkAsync(outputFile);
              } catch (error) {
                //
              }
              try {
                await fs.unlinkAsync(inputFile);
              } catch (error) {
                //
              }

              if (buffer.length < 1024) {
                const error = new Error('Conversion failed: result too small');

                console.error('AV.transform: error:', error);

                reject(error);

                return;
              }

              console.log('AV.transform: end:', args);

              resolve(buffer);
            } catch (error) {
              if (error.code !== 'ENOENT') {
                console.error('AV.transform: error:', error);
              }
              reject(error);
            }
          })
          .on('error', async (error) => {
            try {
              await fs.unlinkAsync(outputFile);
            } catch (error) {
              //
            }
            try {
              await fs.unlinkAsync(inputFile);
            } catch (error) {
              //
            }

            console.error('AV.transform: error:', error);

            reject(error);
          });
      });

      command.run();

      resolve({
        ffmpeg: command,
        // stream: passThroughStream,
        placeholder: AV.placeholders[type],
        promise,
      });
    });
  }

};
