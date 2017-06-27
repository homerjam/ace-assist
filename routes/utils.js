const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const os = require('os');
const duAsync = Promise.promisify(require('du'));
const prettyBytes = require('pretty-bytes');
const diskusage = require('diskusage');

module.exports = (app, isAuthorised) => {
  const publicDir = app.get('publicDir');

  app.get('/_utils/size', isAuthorised, (req, res) => {
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

  app.get('/_utils/size/:slug', isAuthorised, (req, res) => {
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

  app.get('/_utils/list/:slug', isAuthorised, (req, res) => {
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
};
