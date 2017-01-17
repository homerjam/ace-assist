const path = require('path');
const sharp = require('sharp');
const attention = require('attention');

module.exports = (app) => {
  const publicDir = app.get('publicDir');

  app.get('/info/:slug/:fileName', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.params.fileName);

    sharp(filePath)
      .metadata((err, info) => {
        res.status(err ? 500 : 200).send(err || info);
      });
  });

  app.get('/palette/:slug/:fileName', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.params.fileName);

    attention(filePath)
      .palette((err, palette) => {
        res.status(err ? 500 : 200).send(err || palette);
      });
  });

  app.get('/focus/point/:slug/:fileName', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.params.fileName);

    attention(filePath)
      .point((err, point) => {
        res.status(err ? 500 : 200).send(err || point);
      });
  });

  app.get('/focus/region/:slug/:fileName', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.params.fileName);

    attention(filePath)
      .region((err, region) => {
        res.status(err ? 500 : 200).send(err || region);
      });
  });
};
