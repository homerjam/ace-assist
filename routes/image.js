const path = require('path');
const sharp = require('sharp');
const attention = require('attention');
// const smartcrop = require('smartcrop-sharp');

module.exports = (app) => {
  const publicDir = app.get('publicDir');

  app.get('/:slug/image/metadata', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.query.image || req.query.fileName);

    sharp(filePath)
      .metadata((err, info) => {
        res.status(err ? 500 : 200).send(err || info);
      });
  });

  app.get('/:slug/image/palette', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.query.image || req.query.fileName);

    attention(filePath)
      .palette((err, palette) => {
        res.status(err ? 500 : 200).send(err || palette);
      });
  });

  app.get('/:slug/image/focus-point', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.query.image || req.query.fileName);

    attention(filePath)
      .point((err, point) => {
        res.status(err ? 500 : 200).send(err || point);
      });
  });

  // app.get('/:slug/image/focus-region', (req, res) => {
  //   fs.readFileAsync(path.join(publicDir, req.params.slug, req.query.image || req.query.fileName))
  //     .then((file) => {
  //       smartcrop.crop(file, req.query)
  //         .then((result) => {
  //           res.status(200)
  //           res.send(result.topCrop)
  //         }, (error) => {
  //           res.status(500)
  //           res.send(error)
  //         })
  //     }, (error) => {
  //       res.status(500)
  //       res.send(error)
  //     })
  // })

  app.get('/:slug/image/focus/region', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.query.image || req.query.fileName);

    attention(filePath)
      .region((err, region) => {
        res.status(err ? 500 : 200).send(err || region);
      });
  });
};