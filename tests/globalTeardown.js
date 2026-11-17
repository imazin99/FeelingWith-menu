const singleton = require('./mongoMemoryServerSingleton');

module.exports = async function globalTeardown() {
  const mongod = singleton.get();
  if (mongod) await mongod.stop();
};
