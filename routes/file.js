const path = require('path');
const Promise = require('bluebird');
const axios = require('axios');
const fs = Promise.promisifyAll(require('fs'));
const multiparty = require('connect-multiparty')();
const uuid = require('uuid');
const mime = require('mime');
// const Glob = require('glob').Glob;
const rimrafAsync = Promise.promisify(require('rimraf'));
const duAsync = Promise.promisify(require('du'));
const recursive = require('recursive-readdir');
const Logger = require('../lib/logger');
const Image = require('../lib/image');
const AV = require('../lib/av');
const Flow = require('../lib/flow');
const S3 = require('../lib/s3');
const asyncMiddleware = require('../lib/async-middleware');

module.exports = ({
  app,
  authMiddleware,
  tmpDir,
  accessKeyId,
  secretAccessKey,
  bucket,
}) => {

  app.options('/:slug/file/upload?*', (req, res) => {
    res.status(200);
    res.send();
  });

  app.get('/:slug/file/upload?*', authMiddleware, (req, res) => {
    const flow = new Flow(tmpDir);

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

      const flow = new Flow(tmpDir);

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

      const tmpFile = path.join(tmpDir, upload.filename);

      try {
        const s3 = new S3(accessKeyId, secretAccessKey, bucket);

        const name = uuid.v1();
        const ext = path.parse(tmpFile).ext.toLowerCase().replace('jpeg', 'jpg');
        // const mimeType = mime.getType(tmpFile);

        const objects = [
          {
            file: tmpFile,
            key: `${slug}/${name}${ext}`,
          },
        ];

        let metadata = {};

        if (Image.mimeTypes[ext.replace('.')]) {
          metadata = await Image.process(tmpFile);

          if (options.dzi) {
            metadata.dzi = await Image.dzi(tmpFile, options.dzi);
          }
        }

        if (AV.mimeTypes[ext.replace('.', '')]) {
          metadata = await AV.process(tmpFile);
        }

        const extrasPath = path.join(tmpDir, path.parse(tmpFile).name);

        let extrasFiles = [];
        let extrasSize = 0;

        try {
          extrasFiles = await recursive(extrasPath);
          extrasSize = await duAsync(extrasPath, { disk: true });
        } catch (error) {
          //
        }

        const extraObjects = extrasFiles.map(file => ({
          file,
          key: `${slug}/${name}${file.replace(extrasPath, '')}`,
        }));

        const transfers = objects.map(object => s3.upload(object.file, object.key))
          .concat(extraObjects.map(object => s3.upload(object.file, object.key)));

        const results = await Promise.all(transfers);

        const result = results[0];

        const size = result.original.fileSize + extrasSize;

        result.file = {
          name,
          ext,
          size,
        };
        result.original.fileName = upload.originalFilename;
        result.metadata = metadata;

        await Promise.all(objects.map(object => fs.unlinkAsync(object.file))
          .concat(rimrafAsync(extrasPath)));

        res.status(200);
        res.send(result);

      } catch (error) {
        console.error(error);
        Logger.error(res, 'upload', error);
      }
    })
  );

  app.post(
    '/:slug/file/delete',
    authMiddleware,
    asyncMiddleware(async (req, res) => {
      const slug = req.params.slug;
      const fileNames = req.body.fileNames;

      try {
        const s3 = new S3(accessKeyId, secretAccessKey, bucket);

        const prefixes = fileNames.map(fileName => `${slug}/${fileName}`);

        const results = await s3.delete(prefixes);

        res.status(200);
        res.send(results);

      } catch (error) {
        console.error(error);
        Logger.error(res, 'delete', error);
      }
    })
  );

  app.get(
    '/:slug/file/download/:fileName/:originalFileName',
    asyncMiddleware(async (req, res) => {
      const fileUrl = `http://${bucket}.s3.amazonaws.com/${req.params.slug}/${req.params.fileName}`;

      const stream = (await axios.get(fileUrl, { responseType: 'stream' })).data;

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename=${req.params.originalFileName}`);

      stream.pipe(res);
    })
  );

};
