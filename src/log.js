const fs = require('fs');

module.exports = function (app) {
  const logDir = app.get('logDir');

  app.get('/log/out/clear', (req, res) => {
    fs.writeFileSync(logDir + '/out.log', '');

    res.status(200).send('<pre>Cleared OK</log>');
  });

  app.get('/log/err/clear', (req, res) => {
    fs.writeFileSync(logDir + '/err.log', '');

    res.status(200).send('<pre>Cleared OK</log>');
  });

  app.get('/log/out', (req, res) => {
    const log = fs.readFileSync(logDir + '/out.log', {
      encoding: 'utf8',
    });

    res.status(200).send('<pre>' + log + '</log>');
  });

  app.get('/log/err', (req, res) => {
    const log = fs.readFileSync(logDir + '/err.log', {
      encoding: 'utf8',
    });

    res.status(200).send('<pre>' + log + '</log>');
  });
};
