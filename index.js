const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const compression = require('compression');
const errorHandler = require('errorhandler');
const helmet = require('helmet');
const expires = require('connect-expires');
const http = require('http');
const https = require('https');
const passport = require('passport');
const BasicStrategy = require('passport-http').BasicStrategy;
const passwordHash = require('password-hash');
const greenlock = require('greenlock');
const greenlockExpress = require('greenlock-express');
const redirectHttps = require('redirect-https');
// const consoleStamp = require('console-stamp')(console);

const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const HTTP_PORT = process.env.HTTP_PORT || 49001;
const HTTPS_PORT = process.env.HTTPS_PORT || 49002;
const EMAIL = process.env.EMAIL || '';
const DOMAINS = process.env.DOMAINS || '';
const USERNAME = process.env.USERNAME || 'username';
const PASSWORD = process.env.PASSWORD || 'password';
let PUBLIC_FOLDER = process.env.PUBLIC_FOLDER || 'public';

passport.use(new BasicStrategy(
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
));

const app = express();

app.use(bodyParser.urlencoded({
  extended: true,
}));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(errorHandler({
  showStack: true,
  dumpExceptions: true,
}));
app.use(helmet());
app.use(compression());
app.use(expires({
  pattern: /^(.*)$/,
  duration: 1000 * 60 * 60 * 24 * 365,
}));
app.use(passport.initialize());

if (ENVIRONMENT === 'testing') {
  app.use('/tests', express.static(path.join(__dirname, 'tests')));
  PUBLIC_FOLDER = 'tests';
}

app.set('logDir', path.join(__dirname, 'log'));
app.set('uploadDir', path.join(__dirname, 'uploads'));

if (/^\/(.*)$/.test(PUBLIC_FOLDER)) {
  app.set('publicDir', PUBLIC_FOLDER);
} else {
  app.set('publicDir', path.join(__dirname, PUBLIC_FOLDER));
}

if (!fs.existsSync(app.get('publicDir'))) {
  fs.mkdirSync(app.get('publicDir'));
}

if (!fs.existsSync(app.get('uploadDir'))) {
  fs.mkdirSync(app.get('uploadDir'));
}

app.use((req, res, next) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
  };

  if (req.headers['access-control-request-headers']) {
    headers['Access-Control-Allow-Headers'] = req.headers['access-control-request-headers'];
  }

  res.set(headers);

  return next();
});

const isAuthorised = (req, res, next) => {
  passport.authenticate('basic', {
    session: false,
  })(req, res, next);
};

require('./routes/file')(app, isAuthorised);
require('./routes/log')(app, isAuthorised);
require('./routes/transform')(app, isAuthorised);
require('./routes/pdf')(app, isAuthorised);
require('./routes/utils')(app, isAuthorised);
require('./routes/image')(app, isAuthorised);

app.use(express.static(app.get('publicDir')));

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

// app.get('/robots.txt', function (req, res) {
//   res.type('text/plain');
//   res.send('User-agent: *\nDisallow: /');
// });

if (ENVIRONMENT === 'production') {
  const lex = greenlockExpress.create({
    // store: require('le-store-certbot').create({ webrootPath: '/tmp/acme-challenges' }),
    server: ENVIRONMENT === 'production' ? greenlock.productionServerUrl : greenlock.stagingServerUrl,
    email: EMAIL,
    agreeTos: true,
    approveDomains: DOMAINS.split(','),
    app,
    debug: ENVIRONMENT !== 'production',
  });

  http.createServer(lex.middleware(redirectHttps())).listen(HTTP_PORT, function () {
    console.log('Listening for ACME http-01 challenges on', this.address());
  });

  https.createServer(lex.httpsOptions, lex.middleware(app)).listen(HTTPS_PORT, function () {
    console.log('Listening for ACME tls-sni-01 challenges and serve app on', this.address());
  });

} else {
  const httpServer = http.createServer(app);
  httpServer.on('listening', () => {
    console.log('Express server listening on port ' + HTTP_PORT);
  });
  httpServer.listen(HTTP_PORT);
}
