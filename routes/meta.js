const _ = require('lodash');
const Image = require('../lib/image');
const asyncMiddleware = require('../lib/async-middleware');

module.exports = ({
  app,
  endpoint,
  bucket,
}) => {

  app.options('/:slug/meta*', (req, res) => {
    res.status(200);
    res.send();
  });

  app.get(
    '/:slug/meta/palette/:fileName',
    asyncMiddleware(async (req, res) => {
      let time = process.hrtime();

      const fileUrl = `http://${bucket}.${endpoint}/${req.params.slug}/${req.params.fileName}`;

      const result = await Image.palette(fileUrl);

      // TODO: use filru to cache result as json?

      time = process.hrtime(time);
      time = `${(time[0] === 0 ? '' : time[0]) + (time[1] / 1000 / 1000).toFixed(2)}ms`;

      res.setHeader('Cache-Tag', req.params.slug);
      res.setHeader('X-Time-Elapsed', time);
      // res.setHeader('X-Cached-Response', cachedResponse);

      res.status(200);
      res.send(result);
    })
  );

};
