import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { Pool } from 'pg';

async function main() {
  const origin = 'http://localhost:3108';
  const test = new URL(process.env.TEST_DATABASE_URL!);
  assert(['localhost', '127.0.0.1'].includes(test.hostname) && test.pathname === '/yoltick_test');
  const pool = new Pool({ connectionString: test.href });
  try {
    const session = (
      await pool.query(`SELECT session_id FROM session_seats GROUP BY session_id
      HAVING count(*)=1000 ORDER BY session_id LIMIT 1`)
    ).rows[0]?.session_id;
    assert(session, 'Run M8 load fixture first');
    const htmlResponse = await fetch(origin);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    const csp = htmlResponse.headers.get('content-security-policy')!;
    assert(csp.includes("frame-ancestors 'none'"));
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    assert(nonce);
    assert(html.includes(`nonce="${nonce}"`), 'HTML scripts must carry middleware nonce');
    assert(!htmlResponse.headers.has('x-powered-by'));
    const readiness = await fetch(origin + '/api/health');
    assert.equal(readiness.status, 200);
    assert.deepEqual(await readiness.json(), { status: 'ok' });
    for (const path of ['/api/customer', '/api/admin/finance/export']) {
      assert.equal((await fetch(origin + path)).status, 401);
    }
    assert.equal(
      (
        await fetch(origin + '/api/orders', {
          method: 'POST',
          headers: {
            Origin: 'https://attacker.example',
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(origin + '/api/orders', {
          method: 'POST',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
          },
          body: 'x'.repeat(16385),
        })
      ).status,
      413,
    );
    // Warm compilation before measuring the development HTTP server.
    assert.equal((await fetch(`${origin}/api/sessions/${session}/inventory`)).status, 200);
    const durations = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const start = performance.now();
        const response = await fetch(`${origin}/api/sessions/${session}/inventory`);
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.data.rows.flatMap((r: { seats: unknown[] }) => r.seats).length, 1000);
        assert(response.headers.get('cache-control')?.includes('no-store'));
        return Math.round(performance.now() - start);
      }),
    );
    durations.sort((a, b) => a - b);
    const report = {
      date: new Date().toISOString(),
      surface: 'Next development HTTP, localhost, isolated test DB',
      requests: 50,
      seatsPerResponse: 1000,
      status200: 50,
      nonceMatched: true,
      securitySmokePassed: true,
      milliseconds: { p50: durations[24], p95: durations[47], max: durations[49] },
    };
    await mkdir('.local/qa', { recursive: true });
    await writeFile('.local/qa/m8-http.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error('M8 HTTP QA failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
