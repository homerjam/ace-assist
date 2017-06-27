const fs = require('fs');

module.exports = function (app, isAuthorised) {
  const logDir = app.get('logDir');

  app.get('/_log/out/clear', isAuthorised, (req, res) => {
    fs.writeFileSync(logDir + '/out.log', '');

    res.status(200).send('<pre>Cleared OK</log>');
  });

  app.get('/_log/err/clear', isAuthorised, (req, res) => {
    fs.writeFileSync(logDir + '/err.log', '');

    res.status(200).send('<pre>Cleared OK</log>');
  });

  app.get('/_log/out', isAuthorised, (req, res) => {
    const log = fs.readFileSync(logDir + '/out.log', {
      encoding: 'utf8',
    });

    res.status(200).send('<pre>' + log + '</log>');
  });

  app.get('/_log/err', isAuthorised, (req, res) => {
    const log = fs.readFileSync(logDir + '/err.log', {
      encoding: 'utf8',
    });

    res.status(200).send('<pre>' + log + '</log>');
  });
};
