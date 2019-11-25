const path = require('path');
const Promise = require('bluebird');
const axios = require('axios');
const fs = Promise.promisifyAll(require('fs'));
const multiparty = require('connect-multiparty')();
const uuid = require('uuid');
const mime = require('mime');
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
  endpoint,
  bucket,
}) => {
  app.options('/:slug/file/upload?*', (req, res) => {
    res.status(200);
    res.send();
  });

  app.get('/:slug/file/upload?*', authMiddleware, (req, res) => {
    const slug = req.params.slug;
    const flow = new Flow(path.join(tmpDir, slug));

    flow
      .checkChunk(
        req.query.flowChunkNumber,
        req.query.flowChunkSize,
        req.query.flowTotalChunks,
        req.query.flowTotalSize,
        req.query.flowIdentifier,
        req.query.flowFilename
      )
      .then(
        result => {
          res.status(200);
          res.send(result);
        },
        error => {
          res.status(204);
          res.send(error);
        }
      );
  });

  app.post(
    '/:slug/file/upload?*',
    authMiddleware,
    multiparty,
    asyncMiddleware(async (req, res) => {
      const slug = req.params.slug;
      const flow = new Flow(path.join(tmpDir, slug));

      let options = {};

      try {
        options = JSON.parse(req.body.options);
      } catch (error) {
        //
      }

      const upload = await flow.saveChunk(
        req.files,
        req.body.flowChunkNumber,
        req.body.flowChunkSize,
        req.body.flowTotalChunks,
        req.body.flowTotalSize,
        req.body.flowIdentifier,
        req.body.flowFilename
      );

      res.header('Access-Control-Allow-Origin', '*');

      if (upload.status !== 'complete') {
        res.status(200);
        res.send(upload);
        return;
      }

      let tmpFile = path.join(tmpDir, slug, upload.filename);

      try {
        const s3 = new S3(accessKeyId, secretAccessKey, bucket);

        const type = path
          .parse(tmpFile)
          .ext.toLowerCase()
          .replace('.', '');

        let processResult;
        let metadata = {};

        if (Image.mimeTypes[type]) {
          processResult = await Image.process(tmpFile);
          metadata = processResult.metadata;
          tmpFile = processResult.filePath;

          if (options.dzi) {
            metadata.dzi = await Image.dzi(tmpFile, options.dzi);
          }
        }

        if (AV.mimeTypes[type]) {
          processResult = await AV.process(tmpFile);
          metadata = processResult.metadata;
          tmpFile = processResult.filePath;
        }

        const file = path.parse(tmpFile);

        const name = uuid.v1();
        const ext = file.ext.toLowerCase().replace('jpeg', 'jpg');

        const objects = [
          {
            file: tmpFile,
            key: `${slug}/${name}${ext}`,
          },
        ];

        const extrasPath = path.join(tmpDir, slug, file.name);
        let extrasFiles = [];
        let extrasSize = 0;
        try {
          extrasFiles = await recursive(extrasPath);
          extrasSize = await duAsync(extrasPath, { disk: true });
        } catch (error) {
          //
        }

        extrasFiles.forEach(file => {
          objects.push({
            file,
            key: `${slug}/${name}${file.replace(extrasPath, '')}`,
          });
        });

        const results = await Promise.all(
          objects.map(object => s3.upload(object.file, object.key))
        );

        const result = results[0];

        const size = result.fileSize + extrasSize;

        result.file = {
          name,
          ext,
          size,
        };
        result.original = {
          fileName: file.base,
          fileSize: result.fileSize,
          mimeType: result.mimeType,
        };
        result.metadata = metadata;

        await Promise.all(
          objects
            .map(object => fs.unlinkAsync(object.file))
            .concat(rimrafAsync(extrasPath))
        );

        res.status(200);
        res.send(result);
      } catch (error) {
        console.error(error);
        Logger.error(res, 'upload', error);
      }
    })
  );

  app.options('/:slug/file/delete', (req, res) => {
    res.status(200);
    res.send();
  });

  app.post(
    '/:slug/file/delete',
    authMiddleware,
    asyncMiddleware(async (req, res) => {
      const slug = req.params.slug;
      let fileNames = req.body.fileNames;

      try {
        const s3 = new S3(accessKeyId, secretAccessKey, bucket);

        fileNames = fileNames.filter(fileName => fileName);
        fileNames = fileNames.map(fileName => fileName.split('.')[0]);

        const originalFilePrefixes = fileNames.map(
          fileName => `${slug}/${fileName}.`
        );
        const extraFilePrefixes = fileNames.map(
          fileName => `${slug}/${fileName}/`
        );

        const prefixes = originalFilePrefixes.concat(extraFilePrefixes);

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
      const fileUrl = `http://${bucket}.${endpoint}/${req.params.slug}/${req.params.fileName}`;

      const stream = (await axios.get(fileUrl, { responseType: 'stream' }))
        .data;

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${req.params.originalFileName}`
      );

      stream.pipe(res);
    })
  );

  app.get(
    '/:slug/file/view/:fileName/:originalFileName',
    asyncMiddleware(async (req, res) => {
      const fileUrl = `http://${bucket}.${endpoint}/${req.params.slug}/${req.params.fileName}`;

      const stream = (await axios.get(fileUrl, { responseType: 'stream' }))
        .data;

      const type = path
        .parse(req.params.fileName)
        .ext.toLowerCase()
        .replace('.', '');

      res.setHeader('Content-Type', mime.getType(type));

      stream.pipe(res);
    })
  );
};
