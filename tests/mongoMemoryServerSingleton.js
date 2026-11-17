// globalSetup and globalTeardown both run in Jest's main (parent) process,
// so a module-scope variable here is shared between them.
let instance = null;

module.exports = {
  set(mongod) {
    instance = mongod;
  },
  get() {
    return instance;
  },
};
