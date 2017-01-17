// process.env.TMPDIR = 'tmp'; // to avoid the EXDEV rename error, see http://stackoverflow.com/q/21071303/76173

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');

class Flow {
  constructor(temporaryFolder = '/tmp', maxFileSize = 0) {
    this.temporaryFolder = temporaryFolder;
    this.maxFileSize = maxFileSize;
    this.fileParameterName = 'file';

    try {
      fs.mkdirSync(this.temporaryFolder);
    } catch (event) {
      //
    }
  }

  static cleanIdentifier(identifier) {
    return identifier.replace(/[^0-9A-Za-z_-]/g, '');
  }

  getChunkFilename(chunkNumber, identifier) {
    identifier = Flow.cleanIdentifier(identifier);

    return path.resolve(this.temporaryFolder, `./flow-${identifier}.${chunkNumber}`);
  }

  validate(chunkNumber, chunkSize, totalSize, identifier, filename, fileSize) {
    chunkNumber = typeof chunkNumber !== 'number' ? parseInt(chunkNumber, 10) : chunkNumber;
    chunkSize = typeof chunkSize !== 'number' ? parseInt(chunkSize, 10) : chunkSize;
    totalSize = typeof totalSize !== 'number' ? parseInt(totalSize, 10) : totalSize;

    identifier = Flow.cleanIdentifier(identifier);

    // Check if the request is sane
    if (chunkNumber === 0 || chunkSize === 0 || totalSize === 0 || identifier.length === 0 || filename.length === 0) {
      return 'non_flow_request';
    }

    const numberOfChunks = Math.max(Math.floor(totalSize / chunkSize), 1);

    if (chunkNumber > numberOfChunks) {
      return 'invalid_flow_request1';
    }

    // Is the file too big?
    if (this.maxFileSize && totalSize > this.maxFileSize) {
      return 'invalid_flow_request2';
    }

    if (typeof fileSize !== 'undefined') {
      fileSize = typeof fileSize !== 'number' ? parseInt(fileSize, 10) : fileSize;

      if (chunkNumber < numberOfChunks && fileSize !== chunkSize) {
        // The chunk in the POST request isn't the correct size
        return 'invalid_flow_request3';
      }

      if (numberOfChunks > 1 && chunkNumber === numberOfChunks && fileSize !== ((totalSize % chunkSize) + parseInt(chunkSize, 10))) {
        // The chunks in the POST is the last one, and the file is not the correct size
        return 'invalid_flow_request4';
      }

      if (numberOfChunks === 1 && fileSize !== totalSize) {
        // The file is only a single chunk, and the data size does not fit
        return 'invalid_flow_request5';
      }
    }

    return 'valid';
  }

  checkChunk(chunkNumber = 0, chunkSize = 0, totalSize = 0, identifier = '', filename = '') {
    chunkNumber = typeof chunkNumber !== 'number' ? parseInt(chunkNumber, 10) : chunkNumber;
    chunkSize = typeof chunkSize !== 'number' ? parseInt(chunkSize, 10) : chunkSize;
    totalSize = typeof totalSize !== 'number' ? parseInt(totalSize, 10) : totalSize;

    return new Promise((resolve, reject) => {
      const validation = this.validate(chunkNumber, chunkSize, totalSize, identifier, filename);

      if (validation !== 'valid') {
        reject(validation);
        return;
      }

      const chunkFilename = this.getChunkFilename(chunkNumber, identifier);

      fs.statAsync(chunkFilename)
        .then(resolve, reject);
    });
  }

  mergeChunks(numberOfChunks, identifier, filename) {
    return new Promise((resolve, reject) => {
      const chunks = [];

      for (let i = 1; i <= numberOfChunks; i++) {
        chunks.push(fs.readFileAsync(this.getChunkFilename(i, identifier)));
      }

      Promise.all(chunks)
        .then((results) => {
          fs.writeFileAsync(path.join(this.temporaryFolder, filename), Buffer.concat(results))
            .then(resolve, reject);
        }, reject);
    });
  }

  deleteFile(filename) {
    return fs.unlinkAsync(path.join(this.temporaryFolder, filename));
  }

  removeChunks(identifier) {
    return new Promise((resolve, reject) => {
      const removeChunk = (num) => {
        const chunkFilename = this.getChunkFilename(num, identifier);

        fs.stat(chunkFilename, (error) => {
          if (!error) {
            fs.unlink(chunkFilename, (error) => {
              if (error) {
                reject(error);
              }
            });

            removeChunk(num + 1);

          } else {
            resolve();
          }
        });
      };

      removeChunk(1);
    });
  }

  saveChunk(files, chunkNumber, chunkSize, totalChunks, totalSize, identifier, filename) {
    chunkNumber = typeof chunkNumber !== 'number' ? parseInt(chunkNumber, 10) : chunkNumber;
    chunkSize = typeof chunkSize !== 'number' ? parseInt(chunkSize, 10) : chunkSize;
    totalChunks = typeof totalChunks !== 'number' ? parseInt(totalChunks, 10) : totalChunks;
    totalSize = typeof totalSize !== 'number' ? parseInt(totalSize, 10) : totalSize;

    return new Promise((resolve, reject) => {
      if (!files[this.fileParameterName] || !files[this.fileParameterName].size) {
        reject('invalid_flow_request');
        return;
      }

      const originalFilename = files[this.fileParameterName].originalFilename;

      let filesize = files[this.fileParameterName].size;
      filesize = typeof filesize !== 'number' ? parseInt(filesize, 10) : filesize;

      const validation = this.validate(chunkNumber, chunkSize, totalSize, identifier, filename, filesize);

      if (validation === 'valid') {
        const chunkFilename = this.getChunkFilename(chunkNumber, identifier);
        const numberOfChunks = Math.max(Math.floor(totalSize / chunkSize), 1);

        fs.rename(files[this.fileParameterName].path, chunkFilename, () => {
          const testChunkExists = (testChunk) => {
            fs.stat(this.getChunkFilename(testChunk, identifier), (error) => {
              if (!error) {
                if (testChunk === numberOfChunks && chunkNumber === numberOfChunks) {
                  this.mergeChunks(numberOfChunks, identifier, filename)
                    .then(() => {
                      this.removeChunks(identifier)
                        .then(() => {
                          resolve({
                            status: 'complete',
                            filename,
                            originalFilename,
                            identifier,
                          });
                        }, reject);
                    }, reject);

                } else {
                  testChunkExists(testChunk + 1);
                }

              } else {
                resolve({
                  status: 'incomplete',
                  filename,
                  originalFilename,
                  identifier,
                });
              }
            });
          };

          testChunkExists(1);
        });

      } else {
        reject(`${validation}: ${filename} ${originalFilename} ${identifier}`);
      }
    });
  }

  // Pipe chunks directly in to an existsing WritableStream
  //   flow.write(identifier, response);
  //   flow.write(identifier, response, {end:false});
  //
  //   var stream = fs.createWriteStream(filename);
  //   flow.write(identifier, stream);
  //   stream.on('data', function(data){...});
  //   stream.on('finish', function(){...});
  write(identifier, writableStream, options = {}) {
    options.end = (typeof options.end === 'undefined' ? true : options.end);

    // Iterate over each chunk
    const pipeChunk = (num) => {
      const chunkFilename = this.getChunkFilename(num, identifier);

      fs.stat(chunkFilename, (error) => {
        if (!error) {
          // If the chunk with the current num exists,
          // then create a ReadStream from the file
          // and pipe it to the specified writableStream.
          const sourceStream = fs.createReadStream(chunkFilename);

          sourceStream.pipe(writableStream, {
            end: false,
          });

          sourceStream.on('end', () => {
            // When the chunk is fully streamed,
            // jump to the next one
            pipeChunk(num + 1);
          });

        } else {
          // When all the chunks have been piped, end the stream
          if (options.end) {
            writableStream.end();
          }

          if (options.onDone) {
            options.onDone();
          }
        }
      });
    };

    pipeChunk(1);
  }

}

module.exports = Flow;
