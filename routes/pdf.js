const _ = require('lodash');
const axios = require('axios');
const Promise = require('bluebird');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const Logger = require('../lib/logger');
const asyncMiddleware = require('../lib/async-middleware');

const getUrls = async (fonts) => {
  const result = {};

  const promises = [];
  _.forEach(fonts, (url, id) => {
    promises.push(new Promise(async (resolve, reject) => {
      try {
        result[id] = (await axios.get(url, { responseType: 'arraybuffer' })).data;
        resolve();
      } catch (error) {
        reject(error);
      }
    }));
  });

  await Promise.settle(promises);

  return result;
};

const addItem = async (config, doc, obj, item, pi) => {
  const cmd = Object.keys(item)[0];
  let args = item[cmd];

  args = _.isArray(args) ? args : [args];

  if (cmd === 'image') {
    if (!/\.(png|jpe?g)/i.test(args[0]) && obj.assets[args[0]]) {
      args[0] = obj.assets[args[0]];

      doc.switchToPage(pi);
      doc[cmd](...args);

      return;
    }

    let imagePath = `${obj.slug}/${args[0]}`;

    // Force use of 'master' slug
    imagePath = imagePath.replace(`${obj.slug}/${obj.slug}`, obj.slug);

    const url = `http://${config.bucket}.${config.endpoint}/${imagePath}`;

    const response = await axios.get(url, { responseType: 'arraybuffer' });

    const buffer = await sharp(response.data)
      .max()
      .resize(1500, 1000)
      .jpeg({
        quality: 80,
      })
      .withMetadata()
      .toBuffer();

    args[0] = buffer;

    doc.switchToPage(pi);
    doc[cmd](...args);

    return;
  }

  doc.switchToPage(pi);
  doc[cmd](...args);
};

const addPage = (config, doc, obj, page, pi) => {
  const items = page.map(item => addItem(config, doc, obj, item, pi));

  return Promise.settle(items);
};

module.exports = ({
  app,
  bucket,
}) => {

  const config = {
    bucket,
  };

  app.get('/:slug/pdf/test', (req, res) => {
    res.status(200).send(`<form method="POST" action="/${req.params.slug}/pdf/download"><button type="submit">Submit</button><br><textarea name="payload"></textarea></form>`);
  });

  app.all(
    '/:slug/pdf/download',
    asyncMiddleware(async (req, res) => {
      // let t = process.hrtime();
      console.time('pdf generated');

      // const logInfo = Logger.info.bind(null, null, 'pdf')
      const logError = Logger.error.bind(null, res, 'pdf');

      let obj;

      try {
        obj = JSON.parse(req.body.payload);
      } catch (error) {
        logError(`JSON Parse Error: ${req.body.payload}`);
        return;
      }

      if (!obj.pages) {
        logError('No pages');
        return;
      }

      obj.slug = req.params.slug;
      obj.bufferPages = true;

      const doc = new PDFDocument(obj);

      if (obj.fonts) {
        obj.fonts = await getUrls(obj.fonts);

        _.forEach(obj.fonts, (font, fontName) => {
          doc.registerFont(fontName, font);
        });
      }

      if (obj.assets) {
        obj.assets = await getUrls(obj.assets);
      }

      _.times(obj.pages.length - 1, () => {
        doc.addPage();
      });

      const pages = obj.pages.map((page, pi) => addPage(config, doc, obj, page, pi));

      await Promise.settle(pages);

      res.status(200);
      res.attachment(obj.fileName || 'download.pdf');

      doc.pipe(res);
      doc.end();

      obj = null;

      // t = process.hrtime(t);
      // t = `${(t[0] === 0 ? '' : t[0]) + (t[1] / 1000 / 1000).toFixed(2)}ms`;

      // logInfo('generated in ' + t)
      console.timeEnd('pdf generated');
    })
  );

};
