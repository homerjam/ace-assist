const _ = require('lodash');
const path = require('path');
const Promise = require('bluebird');
const axios = require('axios');
const fs = Promise.promisifyAll(require('fs'));
const uuid = require('uuid');
const mime = require('mime');
const rimrafAsync = Promise.promisify(require('rimraf'));
const duAsync = Promise.promisify(require('du'));
const recursive = require('recursive-readdir');
const tus = require('tus-node-server');
// const EVENTS = require('tus-node-server').EVENTS;
const Logger = require('../lib/logger');
const Image = require('../lib/image');
const AV = require('../lib/av');
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
  const server = new tus.Server();

  server.datastore = new tus.FileStore({
    directory: tmpDir,
    path: '/upload',
  });

  // server.on(EVENTS.EVENT_UPLOAD_COMPLETE, event => {
  //   console.log('upload:complete', event.file.id);
  // });

  app.all('/upload*', authMiddleware, server.handle.bind(server));

  app.options('/:slug/file/process?*', (req, res) => {
    res.status(200);
    res.send();
  });

  app.post(
    '/:slug/file/process?*',
    authMiddleware,
    asyncMiddleware(async (req, res) => {
      const slug = req.params.slug;

      const options = _.get(req.body, 'options', {});

      const fileName = req.body.fileName;

      const name = uuid.v1();
      const ext = path
        .parse(fileName)
        .ext.toLowerCase()
        .replace('.', '')
        .replace('jpeg', 'jpg')
        .replace('mpeg', 'mpg');

      let tmpFile = path.join(tmpDir, `${name}.${ext}`);

      await fs.renameSync(path.join(tmpDir, req.body.fileId), tmpFile);

      try {
        const s3 = new S3(accessKeyId, secretAccessKey, bucket);

        let processResult;
        let metadata = {};

        if (Image.mimeTypes[ext]) {
          processResult = await Image.process(tmpFile);
          metadata = processResult.metadata;
          tmpFile = processResult.filePath;

          if (options.dzi) {
            metadata.dzi = await Image.dzi(tmpFile, options.dzi);
          }
        }

        if (AV.mimeTypes[ext]) {
          processResult = await AV.process(tmpFile);
          metadata = processResult.metadata;
          tmpFile = processResult.filePath;
        }

        const objects = [
          {
            file: tmpFile,
            key: `${slug}/${name}.${ext}`,
          },
        ];

        const extrasPath = path.join(tmpDir, name);
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
          ext: `.${ext}`,
          size,
        };
        result.original = {
          fileName,
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
