// Phase 05B: graceful shutdown. Calls the returned handler function
// directly — never sends a real OS signal to the Jest process — and
// injects a mock `exit` so a "successful" shutdown never actually
// terminates the test run.
const { createGracefulShutdown, DEFAULT_TIMEOUT_MS } = require('../../src/shutdown');

function makeServer({ closeDelayMs = 0, closeError = null } = {}) {
  return {
    close: jest.fn((cb) => {
      if (closeDelayMs > 0) {
        setTimeout(() => cb(closeError), closeDelayMs);
      } else {
        cb(closeError);
      }
    }),
  };
}

describe('createGracefulShutdown', () => {
  test('closes the HTTP server and the DB connection, then exits 0', async () => {
    const server = makeServer();
    const disconnectDB = jest.fn().mockResolvedValue();
    const exit = jest.fn();
    const log = { log: jest.fn(), error: jest.fn() };

    const shutdown = createGracefulShutdown({ server, disconnectDB, log, exit });
    await shutdown('SIGTERM');

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(disconnectDB).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('closes the server before closing the DB connection (order matters: stop accepting work first)', async () => {
    const callOrder = [];
    const server = {
      close: jest.fn((cb) => {
        callOrder.push('server.close');
        cb(null);
      }),
    };
    const disconnectDB = jest.fn(async () => {
      callOrder.push('disconnectDB');
    });
    const exit = jest.fn();

    const shutdown = createGracefulShutdown({ server, disconnectDB, log: { log: jest.fn(), error: jest.fn() }, exit });
    await shutdown('SIGTERM');

    expect(callOrder).toEqual(['server.close', 'disconnectDB']);
  });

  test('repeated shutdown signals only execute the shutdown sequence once', async () => {
    const server = makeServer();
    const disconnectDB = jest.fn().mockResolvedValue();
    const exit = jest.fn();

    const shutdown = createGracefulShutdown({ server, disconnectDB, log: { log: jest.fn(), error: jest.fn() }, exit });

    // Simulate SIGTERM immediately followed by SIGINT, as a process
    // manager escalating might send.
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    await shutdown('SIGTERM'); // a third, later signal too

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(disconnectDB).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  test('still closes the DB connection and exits 0 even if server.close() reports an error', async () => {
    const server = makeServer({ closeError: new Error('already closing') });
    const disconnectDB = jest.fn().mockResolvedValue();
    const exit = jest.fn();
    const log = { log: jest.fn(), error: jest.fn() };

    const shutdown = createGracefulShutdown({ server, disconnectDB, log, exit });
    await shutdown('SIGTERM');

    expect(log.error).toHaveBeenCalledWith('Error while closing HTTP server:', 'already closing');
    expect(disconnectDB).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('still exits 0 even if disconnectDB() rejects', async () => {
    const server = makeServer();
    const disconnectDB = jest.fn().mockRejectedValue(new Error('mongo already gone'));
    const exit = jest.fn();
    const log = { log: jest.fn(), error: jest.fn() };

    const shutdown = createGracefulShutdown({ server, disconnectDB, log, exit });
    await shutdown('SIGTERM');

    expect(log.error).toHaveBeenCalledWith('Error while closing MongoDB connection:', 'mongo already gone');
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('forces exit(1) if shutdown does not complete within the timeout', async () => {
    jest.useFakeTimers();
    try {
      // server.close() never calls its callback — simulates a genuinely
      // hung shutdown (e.g. a request handler that never resolves).
      const server = { close: jest.fn() };
      const disconnectDB = jest.fn().mockResolvedValue();
      const exit = jest.fn();
      const log = { log: jest.fn(), error: jest.fn() };

      const shutdown = createGracefulShutdown({ server, disconnectDB, log, exit, timeoutMs: 5000 });
      shutdown('SIGTERM'); // deliberately not awaited — it never resolves on its own here

      expect(exit).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5000);

      expect(exit).toHaveBeenCalledWith(1);
      expect(log.error).toHaveBeenCalledWith(
        `Graceful shutdown did not complete within ${5000}ms — forcing exit.`
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('exports a sensible default timeout', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });

  test('a second signal arriving mid-shutdown (before the first resolves) is also a no-op', async () => {
    const server = makeServer({ closeDelayMs: 20 });
    const disconnectDB = jest.fn().mockResolvedValue();
    const exit = jest.fn();

    const shutdown = createGracefulShutdown({ server, disconnectDB, log: { log: jest.fn(), error: jest.fn() }, exit });

    const first = shutdown('SIGTERM');
    const second = shutdown('SIGTERM'); // fires while the first is still in server.close()'s delay
    await Promise.all([first, second]);

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(disconnectDB).toHaveBeenCalledTimes(1);
  });
});
