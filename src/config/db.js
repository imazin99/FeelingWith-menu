const mongoose = require('mongoose');
const { mongodbUri, mongoServerSelectionTimeoutMs, mongooseAutoIndex } = require('./env');

// Phase 05B (Atlas readiness): ongoing connection-state visibility. These
// fire for any disconnect/error that happens AFTER a successful startup
// connection too (e.g. a transient Atlas network blip), not just the
// initial connect — server.js's own try/catch around connectDB() only
// covers the startup attempt. Deliberately logs only err.name/err.message,
// never the error object as a whole and never `uri`/`mongodbUri` — the
// connection string carries the username/password, and some driver error
// objects echo back parts of what they were given.
let listenersAttached = false;
function attachConnectionLogging() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error(`MongoDB connection error: ${err && err.name ? err.name : 'Error'}: ${err && err.message ? err.message : 'unknown error'}`);
  });
  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.error('MongoDB disconnected.');
  });
  mongoose.connection.on('reconnected', () => {
    // eslint-disable-next-line no-console
    console.log('MongoDB reconnected.');
  });
}

async function connectDB(uriOverride) {
  const uri = uriOverride || mongodbUri;
  mongoose.set('strictQuery', true);
  // Phase 05B: explicit, configurable server-selection timeout (see
  // env.js) instead of relying silently on Mongoose's own 30s default, and
  // autoIndex tied to environment — on by default in development/test for
  // convenience, off by default in production (indexes are declared
  // explicitly in each model and are expected to already exist; an
  // automatic rebuild at every production process startup is unnecessary
  // load against a live database). Both are overridable — see env.js.
  mongoose.set('autoIndex', mongooseAutoIndex);
  attachConnectionLogging();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: mongoServerSelectionTimeoutMs });
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
