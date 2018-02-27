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
const S3 = require('../lib/s3');
const asyncMiddleware = require('../lib/async-middleware');

module.exports = ({
  app,
  authMiddleware,
  uploadDir,
  publicDir,
  accessKeyId,
  secretAccessKey,
  bucket,
}) => {

  app.options('/:slug/file/upload?*', (req, res) => {
    res.status(200);
    res.send();
  });

  app.get('/:slug/file/upload?*', authMiddleware, (req, res) => {
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

  app.post(
    '/:slug/file/upload?*',
    authMiddleware,
    multiparty,
    asyncMiddleware(async (req, res) => {
      const slug = req.params.slug;

      const flow = new Flow(uploadDir);

      let options = {};

      try {
        options = JSON.parse(req.body.options);
      } catch (error) {
        //
      }

      const upload = await flow.saveChunk(req.files, req.body.flowChunkNumber, req.body.flowChunkSize, req.body.flowTotalChunks, req.body.flowTotalSize, req.body.flowIdentifier, req.body.flowFilename);

      res.header('Access-Control-Allow-Origin', '*');

      if (upload.status !== 'complete') {
        res.status(200);
        res.send(upload);
        return;
      }

      const tmpFile = path.join(uploadDir, upload.filename);

      try {
        const s3 = new S3(accessKeyId, secretAccessKey, bucket);

        const base = uuid.v1();

        const objects = [
          {
            file: tmpFile,
            key: `${slug}/${base}${path.parse(tmpFile).ext}`,
          },
        ];

        let metadata = {};

        if (/^(image)$/.test(options.type)) {
          metadata = await Image.processImage(tmpFile);

          if (options.dzi) {
            metadata.dzi = await Image.dzi(tmpFile, options.dzi);
          }
        }

        const results = await Promise.all(objects.map(object => s3.upload(object.file, object.key, base)));

        const result = results[0];

        result.original.fileName = upload.originalFilename;
        result.metadata = metadata;

        // await Promise.all(objects.map(object => fs.unlinkAsync(object.file)));

        res.status(200);
        res.send(result);

      } catch (error) {
        Logger.error(res, 'upload', error);
      }
    })
  );

  app.delete('/:slug/file/delete', authMiddleware, (req, res) => {
    const slug = req.params.slug;
    const files = req.body.files;

    // const logInfo = Logger.info.bind(null, null, 'delete');
    const logError = Logger.error.bind(null, res, 'delete');

    const deleteFiles = files.map(file => new Promise((resolve, reject) => {
      const name = path.parse(file).name;

      const pattern = `${path.join(publicDir, slug, name)}*`;

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
