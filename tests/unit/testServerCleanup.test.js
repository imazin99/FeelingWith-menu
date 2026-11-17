// Round 6 review — Jest open-handle investigation. This proves, with a
// real server and a real deliberately-held-open HTTP/1.1 keep-alive
// connection (no database involved, so this is a genuine DB-free unit
// test), that tests/helpers/testApp.js's listen()/closeServer() pair
// closes promptly and leaves no open socket behind — ruling out lingering
// keep-alive connections as a cause of "Jest did not exit one second
// after the test run has completed" for the integration suite that uses
// this same helper.
const http = require('http');
const { listen, closeServer } = require('../helpers/testApp');

describe('tests/helpers/testApp — listen()/closeServer() socket cleanup', () => {
  test('closeServer() resolves promptly and destroys a still-open keep-alive socket', async () => {
    const { server, origin } = await listen((req, res) => res.end('ok'));
    const { port } = new URL(origin);

    // A keep-alive agent mirrors what a real HTTP/1.1 client (including
    // supertest's `agent(server)`) can leave open: the TCP socket stays
    // connected and idle after the response finishes, rather than
    // closing immediately.
    const keepAliveAgent = new http.Agent({ keepAlive: true });
    await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/', agent: keepAliveAgent }, (res) => {
        res.resume();
        res.on('end', resolve);
        res.on('error', reject);
      });
    });

    expect(server.__openSockets.size).toBeGreaterThan(0); // the keep-alive socket is still open here

    const start = Date.now();
    await closeServer(server);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500); // would otherwise wait out the server's keep-alive timeout
    expect(server.__openSockets.size).toBe(0);

    keepAliveAgent.destroy();
  });
});
