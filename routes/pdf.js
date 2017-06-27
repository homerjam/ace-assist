const _ = require('lodash');
const request = require('request-promise');
const Promise = require('bluebird');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const Logger = require('../lib/logger');

let publicDir;

const log = new Logger();

const getFonts = fonts => new Promise((resolve, reject) => {
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

const getAssets = assets => new Promise((resolve, reject) => {
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

const addItem = (doc, obj, item, pi) => new Promise((resolve, reject) => {
  const cmd = Object.keys(item)[0];
  let args = item[cmd];

  args = _.isArray(args) ? args : [args];

  if (cmd === 'image') {
    if (!/\.(png|jpe?g)/i.test(args[0]) && obj.assets[args[0]]) {
      args[0] = obj.assets[args[0]];

      doc.switchToPage(pi);
      doc[cmd](...args);

      resolve();
      return;
    }

    const imagePath = [publicDir, obj.slug, args[0]].join('/');

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

    return;
  }

  doc.switchToPage(pi);
  doc[cmd](...args);

  resolve();
});

const addPage = (doc, obj, page, pi) => new Promise((resolve, reject) => {
  const items = page.map(item => addItem(doc, obj, item, pi));

  Promise.settle(items)
    .then(resolve)
    .catch(reject);
});

module.exports = (app) => {
  publicDir = app.get('publicDir');

  app.get('/:slug/pdf/test', (req, res) => {
    res.status(200).send('<form method="POST" action="/' + req.params.slug + '/pdf/download"><button type="submit">Submit</button><br><textarea name="payload"></textarea></form>');
  });

  app.all('/:slug/pdf/download', (req, res) => {
    let t = process.hrtime();
    console.time('pdf generated');

    // const logInfo = log.info.bind(null, null, 'pdf')
    const logError = log.error.bind(null, res, 'pdf');

    let obj;

    try {
      obj = JSON.parse(req.body.payload);
    } catch (error) {
      logError('JSON Parse Error: ' + req.body.payload);
      return;
    }

    if (!obj.pages) {
      logError('No pages');
      return;
    }

    obj.slug = req.params.slug;
    obj.bufferPages = true;

    const doc = new PDFDocument(obj);

    const promises = [];

    if (obj.fonts) {
      promises.push(getFonts(obj.fonts));
    }

    if (obj.assets) {
      promises.push(getAssets(obj.assets));
    }

    Promise.settle(promises)
      .then((results) => {
        obj.fonts = {};
        obj.assets = {};

        results.forEach((result) => {
          if (result.isFulfilled()) {
            const value = result.value();

            if (value.fonts) {
              obj.fonts = value.fonts;

              _.forEach(value.fonts, (font, fontName) => {
                doc.registerFont(fontName, font);
              });
            }

            if (value.assets) {
              obj.assets = value.assets;
            }
          }
        });

        _.times(obj.pages.length - 1, () => {
          doc.addPage();
        });

        const pages = obj.pages.map((page, pi) => addPage(doc, obj, page, pi));

        Promise.settle(pages)
          .then(() => {
            res.status(200);

            res.attachment(obj.fileName || 'download.pdf');

            doc.pipe(res);

            doc.end();

            obj = null;

            t = process.hrtime(t);
            t = (t[0] === 0 ? '' : t[0]) + (t[1] / 1000 / 1000).toFixed(2) + 'ms';

            // logInfo('generated in ' + t)
            console.timeEnd('pdf generated');
          }, logError)
          .catch(logError);
      }, logError)
      .catch(logError);
  });
};
