const dotenv = require('dotenv');
const express = require('express');
const Promise = require('bluebird');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const compression = require('compression');
const errorHandler = require('errorhandler');
const helmet = require('helmet');
const expires = require('connect-expires');
const sendSeekable = require('send-seekable');
const proxy = require('express-http-proxy');
const http = require('http');
const passport = require('passport');
const BasicStrategy = require('passport-http').BasicStrategy;
const passwordHash = require('password-hash');
const rimrafAsync = Promise.promisify(require('rimraf'));
// const consoleStamp = require('console-stamp')(console);
const Greenlock = require('greenlock');
const GreenlockExpress = require('greenlock-express');

dotenv.config();

dotenv.config();

const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const SSL_DISABLED = process.env.SSL_DISABLED
  ? JSON.parse(process.env.SSL_DISABLED)
  : false;
const HTTP_PORT = process.env.HTTP_PORT || 8080;
const MAINTAINER_EMAIL = process.env.MAINTAINER_EMAIL || '';
const PACKAGE_AGENT = process.env.PACKAGE_AGENT || '';
const DOMAINS = (process.env.DOMAINS || '')
  .split(',')
  .map(domain => domain.trim());
const USERNAME = process.env.USERNAME || 'username';
const PASSWORD = process.env.PASSWORD || 'password';
const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY;
const ENDPOINT = process.env.ENDPOINT;
const BUCKET = process.env.BUCKET;
const CDN = process.env.CDN;

process.on('unhandledRejection', result =>
  console.error('unhandledRejection:', result)
);

passport.use(
  new BasicStrategy(
    {
      realm: 'ACE Assist',
    },
    (username, password, done) => {
      if (username !== USERNAME) {
        return done(null, false);
      }
      if (!passwordHash.verify(PASSWORD, password)) {
        return done(null, false);
      }
      return done(null, true);
    }
  )
);

const app = express();

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(bodyParser.json());
app.use(methodOverride());
app.use(
  errorHandler({
    showStack: true,
    dumpExceptions: true,
  })
);
app.use(helmet());
app.use(compression());
app.use(
  expires({
    pattern: /^(.*)$/,
    duration: 1000 * 60 * 60 * 24 * 365,
  })
);
app.use(sendSeekable);
app.use(passport.initialize());

app.use((req, res, next) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
  };

  if (req.headers['access-control-request-headers']) {
    headers['Access-Control-Allow-Headers'] =
      req.headers['access-control-request-headers'];
  }

  res.set(headers);

  return next();
});

const authMiddleware = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  passport.authenticate('basic', {
    session: false,
  })(req, res, next);
};

const config = {
  app,
  authMiddleware,
  logDir: path.join(__dirname, 'log'),
  tmpDir: path.join(__dirname, 'tmp'),
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY,
  endpoint: ENDPOINT,
  bucket: BUCKET,
  cdn: CDN,
};

if (!fs.existsSync(config.tmpDir)) {
  fs.mkdirSync(config.tmpDir);
}

rimrafAsync(path.join(config.tmpDir, '*'));

require('./routes/file')(config);
require('./routes/transform')(config);
require('./routes/pdf')(config);
require('./routes/meta')(config);

app.get('/', (req, res) => {
  res.send(`
  <pre>
   ______
  |A     |
  |  /\\  |
  | /  \\ |
  |(    )|
  |  )(  |
  |______|
  </pre>
  `);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow:');
});

app.use(
  '/',
  proxy(`${config.bucket}.${config.endpoint}`, {
    limit: '500mb',
  })
);

if (ENVIRONMENT === 'development') {
  http.createServer(app).listen(HTTP_PORT, () => {
    console.log(`http://localhost:${HTTP_PORT}`);
  });
}

if (SSL_DISABLED && ENVIRONMENT !== 'development') {
  http.createServer(app).listen(HTTP_PORT, () => {
    console.log(`http://localhost:${HTTP_PORT}`);
  });
}

if (!SSL_DISABLED && ENVIRONMENT !== 'development') {
  GreenlockExpress.init(() => {
    const greenlock = Greenlock.create({
      packageAgent: PACKAGE_AGENT,
      maintainerEmail: MAINTAINER_EMAIL,
      packageRoot: __dirname,
    });

    greenlock.manager.defaults({
      subscriberEmail: MAINTAINER_EMAIL,
      agreeToTerms: true,
    });

    greenlock.sites.add({
      subject: DOMAINS[0],
      altnames: DOMAINS,
    });

    return {
      greenlock,
      cluster: false,
    };
  }).ready(glx => glx.serveApp(app));
}
