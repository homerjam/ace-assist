const tus = require('tus-node-server');
// const EVENTS = require('tus-node-server').EVENTS;

module.exports = ({ app, authMiddleware, tmpDir }) => {
  const server = new tus.Server();

  server.datastore = new tus.FileStore({
    directory: tmpDir,
    path: '/upload',
  });

  // server.on(EVENTS.EVENT_UPLOAD_COMPLETE, event => {
  //   console.log('upload:complete', event.file.id);
  // });

  app.all('/upload*', authMiddleware, server.handle.bind(server));
};
