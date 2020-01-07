const express = require('express');
const tus = require('tus-node-server');
const EVENTS = require('tus-node-server').EVENTS;

module.exports = ({ app, tmpDir }) => {
  const server = new tus.Server();

  server.datastore = new tus.FileStore({
    directory: tmpDir,
    path: '/',
  });

  server.on(EVENTS.EVENT_UPLOAD_COMPLETE, event => {
    console.log(`Upload complete for file ${event.file.id}`);
  });

  const uploadApp = express();

  uploadApp.all('*', server.handle.bind(server));

  app.use('/uploads', uploadApp);
};
