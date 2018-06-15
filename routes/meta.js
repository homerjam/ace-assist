const _ = require('lodash');
const Image = require('../lib/image');
const asyncMiddleware = require('../lib/async-middleware');

module.exports = ({
  app,
  endpoint,
  bucket,
}) => {

  app.get(
    '/:slug/meta/palette/:fileName',
    asyncMiddleware(async (req, res) => {
      const fileUrl = `http://${bucket}.${endpoint}/${req.params.slug}/${req.params.fileName}`;

      const result = await Image.palette(fileUrl);

      res.status(200);
      res.send(result);
    })
  );

};
