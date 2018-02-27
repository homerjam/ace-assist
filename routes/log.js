const fs = require('fs');

module.exports = ({
  app,
  authMiddleware,
  logDir,
}) => {

  app.get('/_log/out/clear', authMiddleware, (req, res) => {
    fs.writeFileSync(`${logDir}/out.log`, '');

    res.status(200).send('<pre>Cleared OK</log>');
  });

  app.get('/_log/err/clear', authMiddleware, (req, res) => {
    fs.writeFileSync(`${logDir}/err.log`, '');

    res.status(200).send('<pre>Cleared OK</log>');
  });

  app.get('/_log/out', authMiddleware, (req, res) => {
    const log = fs.readFileSync(`${logDir}/out.log`, {
      encoding: 'utf8',
    });

    res.status(200).send(`<pre>${log}</log>`);
  });

  app.get('/_log/err', authMiddleware, (req, res) => {
    const log = fs.readFileSync(`${logDir}/err.log`, {
      encoding: 'utf8',
    });

    res.status(200).send(`<pre>${log}</log>`);
  });

};
