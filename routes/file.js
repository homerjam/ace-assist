const path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const multiparty = require('connect-multiparty')();
const uuid = require('uuid');
const Glob = require('glob').Glob;
const rimrafAsync = Promise.promisify(require('rimraf'));
const Logger = require('../lib/logger');
const Image = require('../lib/image');
const Flow = require('../lib/flow');

module.exports = function (app, isAuthorised) {
  const uploadDir = app.get('uploadDir');
  const publicDir = app.get('publicDir');

  const log = new Logger();
  const image = new Image();

  app.options('/:slug/file/upload?*', (req, res) => {
    res.status(200);
    res.send();
  });

  app.get('/:slug/file/upload?*', isAuthorised, (req, res) => {
    const flow = new Flow(uploadDir);

    flow.checkChunk(req.query.flowChunkNumber, req.query.flowChunkSize, req.query.flowTotalSize, req.query.flowIdentifier, req.query.flowFilename)
      .then(() => {
        res.status(200);
        res.send();
      }, () => {
        res.status(204);
        res.send();
      });
  });

  app.post('/:slug/file/upload?*', isAuthorised, multiparty, (req, res) => {
    const slug = req.params.slug;

    const logInfo = log.info.bind(null, null, 'upload');
    const logError = log.error.bind(null, res, 'upload');

    const flow = new Flow(uploadDir);

    let options = {};

    try {
      options = JSON.parse(req.body.options);
    } catch (error) {
      //
    }

    flow.saveChunk(req.files, req.body.flowChunkNumber, req.body.flowChunkSize, req.body.flowTotalChunks, req.body.flowTotalSize, req.body.flowIdentifier, req.body.flowFilename)
      .then((uploadResult) => {
        res.header('Access-Control-Allow-Origin', '*');

        if (uploadResult.status !== 'complete') {
          res.status(200);
          res.send(uploadResult);
          return;
        }

        if (!fs.existsSync(path.join(publicDir, slug))) {
          fs.mkdirSync(path.join(publicDir, slug));
        }

        const filePath = path.join(uploadDir, uploadResult.filename);
        const filePathOut = path.join(publicDir, slug, uuid.v1());

        image.processImage(filePath, filePathOut)
          .then((metadata) => {
            const info = {
              fileName: metadata.fileName,
              fileSize: metadata.size,
              mimeType: metadata.mimeType,
              location: 'assist',
              mediaType: 'image',
              original: {
                fileName: uploadResult.originalFilename,
              },
              metadata: {
                format: metadata.format.toUpperCase(),
                width: metadata.width,
                height: metadata.height,
              },
            };

            if (!options.dzi) {
              res.status(200).send(info);
              return;
            }

            image.dzi(path.join(publicDir, slug, metadata.fileName), options.dzi)
              .then((dzi) => {
                info.dzi = dzi;
                res.status(200).send(info);
              }, logError);
          }, logError);
      }, logError);
  });

  app.delete('/:slug/file/delete', isAuthorised, (req, res) => {
    const slug = req.params.slug;
    const files = req.body.files;

    const logInfo = log.info.bind(null, null, 'delete');
    const logError = log.error.bind(null, res, 'delete');

    const deleteFiles = files.map(file => new Promise((resolve, reject) => {
      const name = path.parse(file).name;

      const pattern = path.join(publicDir, slug, name) + '*';

      Glob(pattern, (error, _files) => {
        const _deleteFiles = _files.map((_fileOrDir) => {
          if (_fileOrDir.indexOf('.') !== -1) {
            return fs.unlinkAsync(_fileOrDir);
          }
          return rimrafAsync(_fileOrDir);
        });

        Promise.all(_deleteFiles)
          .then(resolve, reject);
      });
    }));

    Promise.all(deleteFiles)
      .then(() => {
        res.status(200).send('OK');
      }, logError);
  });

  app.get('/:slug/file/download/:fileName/:originalFileName', (req, res) => {
    const filePath = [publicDir, req.params.slug, req.params.fileName].join('/');
    res.download(filePath, req.params.originalFileName);
  });
};
