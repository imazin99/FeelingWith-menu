// Logs an already-created admin in through a supertest agent (which keeps
// the session + csrfToken cookies across subsequent requests), and returns
// the csrf token value to send back as the X-CSRF-Token header on
// state-changing requests — mirroring exactly what the real dashboard does.
function extractCookieValue(setCookieHeader, name) {
  const header = (setCookieHeader || []).find((c) => c.startsWith(`${name}=`));
  if (!header) return null;
  return header.split(';')[0].split('=')[1];
}

async function loginAsAdmin(agent, { username, password }) {
  const res = await agent.post('/api/auth/login').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`Test login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const csrfToken = extractCookieValue(res.headers['set-cookie'], 'csrfToken');
  return { csrfToken, body: res.body };
}

module.exports = { loginAsAdmin, extractCookieValue };
