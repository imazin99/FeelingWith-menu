// Code review fix #2: src/config/env.js must refuse to start in production
// when JWT_SECRET is missing or still set to the unsafe development
// default. These tests exercise the module-load-time guard directly by
// resetting the module registry and manipulating process.env before each
// require — no database or network needed.
const ORIGINAL_ENV = { ...process.env };

function freshEnv(overrides) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...overrides };
  return require('../../src/config/env');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

describe('env.js — production JWT_SECRET validation (fix #2)', () => {
  test('refuses to load in production when JWT_SECRET is not set at all', () => {
    expect(() =>
      freshEnv({ NODE_ENV: 'production', JWT_SECRET: undefined })
    ).toThrow(/JWT_SECRET/);
  });

  test('refuses to load in production when JWT_SECRET is the unsafe development default', () => {
    expect(() =>
      freshEnv({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-me' })
    ).toThrow(/unsafe development default/);
  });

  test('refuses to load in production when JWT_SECRET is an empty/whitespace string', () => {
    expect(() => freshEnv({ NODE_ENV: 'production', JWT_SECRET: '   ' })).toThrow(/JWT_SECRET/);
  });

  test('loads successfully in production with a real, distinct secret', () => {
    let env;
    expect(() => {
      env = freshEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-long-random-production-secret-value',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/feeling_with_menu',
      });
    }).not.toThrow();
    expect(env.jwtSecret).toBe('a-long-random-production-secret-value');
    expect(env.nodeEnv).toBe('production');
  });

  test('the unsafe default is still allowed as a development-only convenience', () => {
    let env;
    expect(() => {
      env = freshEnv({ NODE_ENV: 'development', JWT_SECRET: undefined });
    }).not.toThrow();
    expect(env.jwtSecret).toBe('dev-secret-change-me');
    expect(env.nodeEnv).toBe('development');
  });

  test('the unsafe default is also allowed under "test" (Jest\'s own default NODE_ENV)', () => {
    let env;
    expect(() => {
      env = freshEnv({ NODE_ENV: 'test', JWT_SECRET: undefined });
    }).not.toThrow();
    expect(env.jwtSecret).toBe('dev-secret-change-me');
  });
});

describe('env.js — production MONGODB_URI validation (Phase 05B)', () => {
  test('refuses to load in production when MONGODB_URI is not set at all', () => {
    expect(() =>
      freshEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-long-random-production-secret-value',
        MONGODB_URI: undefined,
      })
    ).toThrow(/MONGODB_URI/);
  });

  test('refuses to load in production when MONGODB_URI is an empty/whitespace string', () => {
    expect(() =>
      freshEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-long-random-production-secret-value',
        MONGODB_URI: '   ',
      })
    ).toThrow(/MONGODB_URI/);
  });

  test('loads successfully in production with a real MONGODB_URI (e.g. an Atlas SRV string)', () => {
    const env = freshEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-long-random-production-secret-value',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster0.abcde.mongodb.net/feeling_with_menu?retryWrites=true',
    });
    expect(env.mongodbUri).toBe('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/feeling_with_menu?retryWrites=true');
  });

  test('the localhost default is still allowed in development and test', () => {
    const devEnv = freshEnv({ NODE_ENV: 'development', MONGODB_URI: undefined });
    expect(devEnv.mongodbUri).toBe('mongodb://localhost:27017/feeling_with_menu');

    const testEnv = freshEnv({ NODE_ENV: 'test', MONGODB_URI: undefined });
    expect(testEnv.mongodbUri).toBe('mongodb://localhost:27017/feeling_with_menu');
  });
});

describe('env.js — Mongo connection tuning (Phase 05B / Atlas readiness)', () => {
  test('mongoServerSelectionTimeoutMs defaults to 10000ms and is configurable', () => {
    const defaultEnv = freshEnv({ NODE_ENV: 'development', MONGO_SERVER_SELECTION_TIMEOUT_MS: undefined });
    expect(defaultEnv.mongoServerSelectionTimeoutMs).toBe(10000);

    const customEnv = freshEnv({ NODE_ENV: 'development', MONGO_SERVER_SELECTION_TIMEOUT_MS: '5000' });
    expect(customEnv.mongoServerSelectionTimeoutMs).toBe(5000);
  });

  test('mongooseAutoIndex defaults to true outside production and false in production', () => {
    const devEnv = freshEnv({ NODE_ENV: 'development', MONGOOSE_AUTO_INDEX: undefined });
    expect(devEnv.mongooseAutoIndex).toBe(true);

    const prodEnv = freshEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-long-random-production-secret-value',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/feeling_with_menu',
      MONGOOSE_AUTO_INDEX: undefined,
    });
    expect(prodEnv.mongooseAutoIndex).toBe(false);
  });

  test('mongooseAutoIndex is explicitly overridable in either direction', () => {
    const prodWithAutoIndexOn = freshEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-long-random-production-secret-value',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/feeling_with_menu',
      MONGOOSE_AUTO_INDEX: 'true',
    });
    expect(prodWithAutoIndexOn.mongooseAutoIndex).toBe(true);

    const devWithAutoIndexOff = freshEnv({ NODE_ENV: 'development', MONGOOSE_AUTO_INDEX: 'false' });
    expect(devWithAutoIndexOff.mongooseAutoIndex).toBe(false);
  });
});

describe('env.js — storage provider selection (Phase 05B: environment-based default)', () => {
  test('defaults to "local" outside production', () => {
    const env = freshEnv({ NODE_ENV: 'development', STORAGE_PROVIDER: undefined });
    expect(env.storageProvider).toBe('local');
  });

  test('defaults to "cloud" (Cloudinary) in production', () => {
    const env = freshEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-long-random-production-secret-value',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/feeling_with_menu',
      STORAGE_PROVIDER: undefined,
    });
    expect(env.storageProvider).toBe('cloud');
  });

  test('an explicit STORAGE_PROVIDER overrides the environment-based default either way', () => {
    const localInProd = freshEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-long-random-production-secret-value',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/feeling_with_menu',
      STORAGE_PROVIDER: 'local',
    });
    expect(localInProd.storageProvider).toBe('local');

    const cloudInDev = freshEnv({ NODE_ENV: 'development', STORAGE_PROVIDER: 'cloud' });
    expect(cloudInDev.storageProvider).toBe('cloud');
  });
});

describe('env.js — APP_ORIGIN parsing and validation (deployment clarification: reverse proxies)', () => {
  test('defaults to an empty string when unset (falls back to request-derived origin)', () => {
    const env = freshEnv({ NODE_ENV: 'development', APP_ORIGIN: undefined });
    expect(env.appOrigin).toBe('');
  });

  test('accepts a well-formed scheme+host origin', () => {
    const env = freshEnv({ NODE_ENV: 'development', APP_ORIGIN: 'https://menu.feelingwith.com' });
    expect(env.appOrigin).toBe('https://menu.feelingwith.com');
  });

  test('refuses to load when APP_ORIGIN has a trailing slash', () => {
    expect(() => freshEnv({ NODE_ENV: 'development', APP_ORIGIN: 'https://menu.feelingwith.com/' })).toThrow(
      /APP_ORIGIN/
    );
  });

  test('refuses to load when APP_ORIGIN includes a path', () => {
    expect(() => freshEnv({ NODE_ENV: 'development', APP_ORIGIN: 'https://menu.feelingwith.com/admin' })).toThrow(
      /APP_ORIGIN/
    );
  });

  test('refuses to load when APP_ORIGIN has no scheme', () => {
    expect(() => freshEnv({ NODE_ENV: 'development', APP_ORIGIN: 'menu.feelingwith.com' })).toThrow(/APP_ORIGIN/);
  });
});

describe('env.js — ALLOWED_ORIGINS parsing (supports fix #1)', () => {
  test('parses a comma-separated list, trimming whitespace and dropping empties', () => {
    const env = freshEnv({
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com ,,',
    });
    expect(env.allowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  test('defaults to an empty list when unset', () => {
    const env = freshEnv({ NODE_ENV: 'development', ALLOWED_ORIGINS: undefined });
    expect(env.allowedOrigins).toEqual([]);
  });
});
