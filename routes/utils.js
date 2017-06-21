const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const os = require('os');
const duAsync = Promise.promisify(require('du'));
const sharp = require('sharp');
const attention = require('attention');
const smartcrop = require('smartcrop-sharp');
const prettyBytes = require('pretty-bytes');
const diskusage = require('diskusage');

module.exports = (app) => {
  const publicDir = app.get('publicDir');

  app.get('/utils/size', (req, res) => {
    fs.readdirAsync(publicDir)
      .then((filesOrDirs) => {
        const dirs = filesOrDirs.filter(fileOrDir => !/\./.test(fileOrDir));

        const slugSizePromises = dirs.map(dir => new Promise((resolve, reject) => {
          duAsync(path.join(publicDir, dir), {
            disk: true,
          })
            .then((bytes) => {
              resolve({
                slug: dir,
                size: prettyBytes(bytes),
                bytes,
              });
            }, reject);
        }));

        Promise.all(slugSizePromises)
          .then((slugSizes) => {
            duAsync(publicDir, {
              disk: true,
            })
              .then((totalBytes) => {
                const path = os.platform() === 'win32' ? 'c:' : '/';

                diskusage.check(path, (error, info) => {
                  if (error) {
                    res.status(500);
                    res.send(error);
                    return;
                  }

                  const result = {
                    totalSize: prettyBytes(totalBytes),
                    totalBytes,
                    availableSize: prettyBytes(info.available),
                    availableBytes: info.available,
                    slugs: slugSizes,
                  };

                  res.status(200);
                  res.send(result);
                });

              }, (error) => {
                res.status(500);
                res.send(error);
              });
          }, (error) => {
            res.status(500);
            res.send(error);
          });
      });
  });

  app.get('/utils/size/:slug', (req, res) => {
    const dir = path.join(publicDir, req.params.slug);

    duAsync(dir, {
      disk: true,
    })
      .then((bytes) => {
        res.status(200);
        res.send({
          size: prettyBytes(bytes),
          bytes,
        });
      }, (error) => {
        res.status(500);
        res.send(error);
      });
  });

  app.get('/utils/list/:slug', (req, res) => {
    const dir = path.join(publicDir, req.params.slug);

    fs.readdirAsync(dir)
      .then((files) => {
        res.status(200);
        res.send({
          files,
        });
      }, (error) => {
        res.status(500);
        res.send(error);
      });
  });

  app.get('/utils/image/metadata/:slug/:fileName', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.params.fileName);

    sharp(filePath)
      .metadata((err, info) => {
        res.status(err ? 500 : 200).send(err || info);
      });
  });

  app.get('/utils/image/palette/:slug/:fileName', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.params.fileName);

    attention(filePath)
      .palette((err, palette) => {
        res.status(err ? 500 : 200).send(err || palette);
      });
  });

  app.get('/utils/image/focus/point/:slug/:fileName', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.params.fileName);

    attention(filePath)
      .point((err, point) => {
        res.status(err ? 500 : 200).send(err || point);
      });
  });

  // app.get('/utils/image/focus/region/:slug/:fileName', (req, res) => {
  //   fs.readFileAsync(path.join(publicDir, req.params.slug, req.params.fileName))
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

  app.get('/utils/image/focus/region/:slug/:fileName', (req, res) => {
    const filePath = path.join(publicDir, req.params.slug, req.params.fileName);

    attention(filePath)
      .region((err, region) => {
        res.status(err ? 500 : 200).send(err || region);
      });
  });
};
