
const _ = require('lodash');
const path = require('path');
const AWS = require('aws-sdk');
const Image = require('../lib/image');
const asyncMiddleware = require('../lib/async-middleware');

let s3;

module.exports = ({
  app,
  accessKeyId,
  secretAccessKey,
  endpoint,
  bucket,
}) => {

  s3 = new AWS.S3({
    accessKeyId,
    secretAccessKey,
  });

  app.options('/:slug/meta*', (req, res) => {
    res.status(200);
    res.send();
  });

  app.get(
    '/:slug/meta/palette/:fileName',
    asyncMiddleware(async (req, res) => {
      const fileUrl = `http://${bucket}.${endpoint}/${req.params.slug}/${req.params.fileName}`;
      const file = path.parse(fileUrl);
      const paletteJsonKey = `${req.params.slug}/${file.name}/palette.json`;

      let result;
      let cachedResponse = true;
      let time = process.hrtime();

      try {
        result = (await s3.getObject({
          Bucket: bucket,
          Key: paletteJsonKey,
        }).promise()).Body.toString('utf8');

      } catch (error) {
        result = await Image.palette(fileUrl);

        cachedResponse = false;

        s3.upload({
          Bucket: bucket,
          Key: paletteJsonKey,
          Body: JSON.stringify(result),
          ACL: 'public-read',
          StorageClass: 'REDUCED_REDUNDANCY',
          Metadata: {},
          Expires: new Date('2099-01-01'),
          CacheControl: 'max-age=31536000',
          ContentType: 'application/json',
          ContentLength: result.length,
        }, (error) => {
          if (error) {
            console.error('s3: error:', error);
          }
        });
      }

      time = process.hrtime(time);
      time = `${(time[0] === 0 ? '' : time[0]) + (time[1] / 1000 / 1000).toFixed(2)}ms`;

      res.setHeader('Cache-Tag', req.params.slug);
      res.setHeader('X-Time-Elapsed', time);
      res.setHeader('X-Cached-Response', cachedResponse);

      res.status(200);
      res.send(result);
    })
  );

};
