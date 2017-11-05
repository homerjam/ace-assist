const dateFormat = require('dateformat');

const stamp = function (type) {
  return '[' + dateFormat(new Date(), 'ddd mmm dd yyyy HH:MM:ss') + '] [' + type + ']\t';
};

class Logger {
  static error(res, prefix, err, statusCode) {
    const message = err.message || err;

    const str = [stamp('ERROR'), prefix || '', message, '\n'].join(' ');

    // console.error(prefix || '', message);
    process.stderr.write(str);

    if (res) {
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.header('Expires', '-1');
      res.header('Pragma', 'no-cache');
      res.status(statusCode || 500);
      res.send(message);
    }
  }

  static info(res, prefix, message, statusCode) {
    const str = [stamp('INFO'), prefix || '', message, '\n'].join(' ');

    // console.log(prefix || '', message);
    process.stdout.write(str);

    if (res) {
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.header('Expires', '-1');
      res.header('Pragma', 'no-cache');
      res.status(statusCode || 200);
      res.send(message);
    }
  }
}

module.exports = Logger;
