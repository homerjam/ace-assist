// const PDFDocument = require('pdfkit')
const PDFDocument = require('pdfkit/index');
const _ = require('lodash');
const request = require('request-promise');
const Promise = require('bluebird');
const sharp = require('sharp');
const Logger = require('./logger');

const log = new Logger();

const registerFonts = fonts => new Promise((resolve, reject) => {
  const promises = [];

  _.forEach(fonts, (url, name) => {
    promises.push(new Promise((resolve, reject) => {
      request({
        url,
        encoding: null,
      })
        .then((body) => {
          resolve({
            name,
            font: body,
          });
        }, reject);
    }));
  });

  Promise.settle(promises)
    .then((results) => {
      const fonts = {};

      results.forEach((result) => {
        fonts[result.value().name] = result.value().font;
      });

      resolve({
        fonts,
      });
    })
    .catch(reject);
});

const downloadAssets = assets => new Promise((resolve, reject) => {
  const promises = [];

  _.forEach(assets, (url, key) => {
    promises.push(new Promise((resolve, reject) => {
      request({
        url,
        encoding: null,
      })
        .then((body) => {
          resolve({
            key,
            asset: body,
          });
        }, reject);
    }));
  });

  Promise.settle(promises)
    .then((results) => {
      const assets = {};

      results.forEach((result) => {
        assets[result.value().key] = result.value().asset;
      });

      resolve({
        assets,
      });
    })
    .catch(reject);
});

const addItem = (doc, publicDir, assets, item, pi) => new Promise((resolve, reject) => {
  const cmd = Object.keys(item)[0];
  let args = item[cmd];

  args = _.isArray(args) ? args : [args];

  if (cmd === 'image') {
    if (!/\.(png|jpe?g)/i.test(args[0]) && assets[args[0]]) {
      args[0] = assets[args[0]];

      doc.switchToPage(pi);
      doc[cmd](...args);

      resolve();
    } else {
      const imagePath = [publicDir, args[0]].join('/');

      const image = sharp(imagePath);
      image.max();
      image.resize(1500, 1000);
      image.jpeg({
        quality: 80,
      });
      image.withMetadata();
      image.toBuffer()
        .then((buffer) => {
          args[0] = buffer;

          doc.switchToPage(pi);
          doc[cmd](...args);

          resolve();
        }, reject);
    }
  } else {
    doc.switchToPage(pi);
    doc[cmd](...args);

    resolve();
  }
});

const addPage = (doc, publicDir, assets, page, pi) => new Promise((resolve, reject) => {
  const items = page.map(item => addItem(doc, publicDir, assets, item, pi));

  Promise.settle(items)
    .then(resolve)
    .catch(reject);
});

module.exports = (app) => {
  const publicDir = app.get('publicDir');

  app.get('/pdf/test', (req, res) => {
    res.status(200).send('<form method="POST" action="/pdf/download"><button type="submit">Submit</button><br><textarea name="payload"></textarea></form>');
  });

  app.all('/pdf/download', (req, res) => {
    let t = process.hrtime();
    console.time('pdf generated');

    const logInfo = log.info.bind(null, null, 'pdf');
    const logError = log.error.bind(null, res, 'pdf');

    let obj;

    try {
      obj = JSON.parse(req.body.payload);
    } catch (e) {
      logError('JSON Parse Error: ' + req.body.payload);
      return;
    }

    if (!obj.pages) {
      logError('No pages');
      return;
    }

    obj.bufferPages = true;

    const doc = new PDFDocument(obj);

    const promises = [];

    if (obj.fonts) {
      promises.push(registerFonts(obj.fonts));
    }

    if (obj.assets) {
      promises.push(downloadAssets(obj.assets));
    }

    Promise.settle(promises)
      .then((results) => {
        let assets = {};

        results.forEach((result) => {
          if (result.isFulfilled()) {
            const value = result.value();

            if (value.assets) {
              assets = value.assets;
            }

            if (value.fonts) {
              _.forEach(value.fonts, (font, fontName) => {
                doc.registerFont(fontName, font);
              });
            }
          }
        });

        _.times(obj.pages.length - 1, () => {
          doc.addPage();
        });

        const pages = obj.pages.map((page, pi) => addPage(doc, publicDir, assets, page, pi));

        Promise.settle(pages)
          .then(() => {
            res.status(200);

            res.attachment(obj.fileName || 'download.pdf');

            doc.pipe(res);

            doc.end();

            assets = null;

            t = process.hrtime(t);
            t = (t[0] === 0 ? '' : t[0]) + (t[1] / 1000 / 1000).toFixed(2) + 'ms';

            // logInfo('generated in ' + t);
            console.timeEnd('pdf generated');
          })
          .catch(logError);
      })
      .catch(logError);
  });
};
