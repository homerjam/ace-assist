const express = require('express');
const Promise = require('bluebird');
const fs = require('fs');
const path = require('path');
const url = require('url');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const compression = require('compression');
const errorHandler = require('errorhandler');
const helmet = require('helmet');
const expires = require('connect-expires');
const sendSeekable = require('send-seekable');
const proxy = require('express-http-proxy');
const http = require('http');
const https = require('https');
const passport = require('passport');
const BasicStrategy = require('passport-http').BasicStrategy;
const passwordHash = require('password-hash');
const greenlock = require('greenlock');
const rimrafAsync = Promise.promisify(require('rimraf'));
// const consoleStamp = require('console-stamp')(console);

const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const SSL_DISABLED = process.env.SSL_DISABLED
  ? JSON.parse(process.env.SSL_DISABLED)
  : false;
const HTTP_PORT = process.env.HTTP_PORT || 49001;
const HTTPS_PORT = process.env.HTTPS_PORT || 49002;
const EMAIL = process.env.EMAIL || '';
const DOMAINS = process.env.DOMAINS || '';
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

const redirectHttps = (req, res, next) => {
  if (
    req.connection.encrypted ||
    req.protocol === 'https' ||
    req.headers['x-forwarded-proto'] === 'https'
  ) {
    next();
    return;
  }

  res.writeHead(301, {
    Location: `https://${req.headers.host}${url.parse(req.url).path}`,
  });
  res.end();
};

if (ENVIRONMENT === 'development') {
  http.createServer(app).listen(HTTP_PORT, () => {
    console.log(`Express server listening on port ${HTTP_PORT}`);
  });
}

if (SSL_DISABLED && ENVIRONMENT !== 'development') {
  https.createServer(app).listen(HTTPS_PORT, () => {
    console.log(`Express server listening on port ${HTTPS_PORT}`);
  });
}

if (!SSL_DISABLED && ENVIRONMENT !== 'development') {
  const debug = ENVIRONMENT === 'testing';

  const lex = greenlock.create({
    version: 'draft-11',
    store: require('le-store-certbot').create({
      webrootPath: '/tmp/acme/var',
      debug,
    }),
    challenges: {
      'http-01': require('le-challenge-fs').create({
        webrootPath: '/tmp/acme/var',
        debug,
      }),
      'tls-sni-01': require('le-challenge-sni').create({ debug }),
      'tls-sni-02': require('le-challenge-sni').create({ debug }),
    },
    server: debug ? greenlock.stagingServerUrl : greenlock.productionServerUrl,
    configDir: '/tmp/acme/etc',
    email: EMAIL,
    agreeTos: true,
    approveDomains: DOMAINS.split(','),
    app,
    debug,
  });

  http
    .createServer(lex.middleware(redirectHttps))
    .listen(HTTP_PORT, function createServer() {
      console.log('Listening for ACME http-01 challenges on', this.address());
    });

  https
    .createServer(lex.httpsOptions, lex.middleware(app))
    .listen(HTTPS_PORT, function createServer() {
      console.log(
        'Listening for ACME tls-sni-01 challenges and serve app on',
        this.address()
      );
    });
}
