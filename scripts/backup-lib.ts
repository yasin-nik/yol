import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';

export function projectPath(path: string) {
  const full = resolve(path);
  const rel = relative(process.cwd(), full);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path must stay inside project');
  return full;
}

function connection(url: string) {
  const parsed = new URL(url);
  if (!/^yoltick_[a-z0-9_]+$/.test(parsed.pathname.slice(1)))
    throw new Error('Only yoltick_ databases are allowed');
  return parsed;
}

async function pgTool(name: 'pg_dump' | 'pg_restore', url: string, args: string[]) {
  const parsed = connection(url);
  const binary = process.env.PG_BIN
    ? join(process.env.PG_BIN, name + (process.platform === 'win32' ? '.exe' : ''))
    : name;
  // Password stays in the child environment; never in process arguments or logs.
  const env = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: parsed.pathname.slice(1),
    PGCONNECT_TIMEOUT: '5',
  };
  await new Promise<void>((accept, reject) => {
    const child = spawn(binary, args, {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    child.stderr.resume();
    child.on('error', () => reject(new Error(`${name} could not start; check PG_BIN`)));
    child.on('close', (code) =>
      code === 0
        ? accept()
        : reject(
            new Error(
              `${name} failed (${code}); archive/credentials/version must be checked locally`,
            ),
          ),
    );
  });
}

export async function backup(url: string, archive: string, snapshot?: string) {
  connection(url);
  const file = projectPath(archive);
  await mkdir(resolve(file, '..'), { recursive: true });
  // Do not overwrite an existing backup.
  await writeFile(file, '', { flag: 'wx', mode: 0o600 });
  await pgTool('pg_dump', url, [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    ...(snapshot ? [`--snapshot=${snapshot}`] : []),
    '--file',
    file,
  ]);
  const sha256 = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
  await writeFile(file + '.sha256', sha256 + '\n', { flag: 'wx', mode: 0o600 });
  return { archive: file, sha256 };
}

export async function fingerprint(client: PoolClient) {
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const result: Record<string, { count: number; digest: string }> = {};
  for (const { tablename } of tables) {
    const quoted = '"' + String(tablename).replaceAll('"', '""') + '"';
    const row = (
      await client.query(`SELECT count(*)::int count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) digest
      FROM public.${quoted} t`)
    ).rows[0];
    result[tablename] = row;
  }
  return result;
}

async function schemaFingerprint(client: PoolClient) {
  const objects = await client.query(`
    SELECT 'constraint' kind, c.relname || '.' || x.conname name, pg_get_constraintdef(x.oid) definition
      FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'index', indexname, indexdef FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'trigger', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
    UNION ALL SELECT 'function', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
    ORDER BY kind,name,definition`);
  return createHash('sha256').update(JSON.stringify(objects.rows)).digest('hex');
}

export async function restoreDrill(url: string, directory: string) {
  const parsed = connection(url);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    !['/yoltick_test', '/yoltick_dev'].includes(parsed.pathname) ||
    decodeURIComponent(parsed.username) !== 'yoltick_app'
  )
    throw new Error('Restore drill only supports isolated local project databases');
  const pool = new Pool({ connectionString: url });
  const source = await pool.connect();
  const targetName = 'yoltick_restore_' + Date.now();
  let restored: Pool | undefined;
  try {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await source.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
    const before = await fingerprint(source);
    const schemaBefore = await schemaFingerprint(source);
    const saved = await backup(url, join(directory, `${targetName}.dump`), snapshot);
    await source.query('COMMIT');
    // CREATE DATABASE fails safely if a collision occurs; never DROP or --clean.
    await pool.query(`CREATE DATABASE "${targetName}" TEMPLATE template0`);
    parsed.pathname = '/' + targetName;
    const started = performance.now();
    await pgTool('pg_restore', parsed.href, [
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--dbname',
      targetName,
      saved.archive,
    ]);
    restored = new Pool({ connectionString: parsed.href });
    const client = await restored.connect();
    try {
      const after = await fingerprint(client);
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error('Restored data mismatch');
      if (schemaBefore !== (await schemaFingerprint(client)))
        throw new Error('Restored constraints/indexes/triggers/functions mismatch');
      const report = {
        targetName,
        sha256: saved.sha256,
        tables: Object.keys(before).length,
        rows: Object.values(before).reduce((total, t) => total + t.count, 0),
        restoreMs: Math.round(performance.now() - started),
        matched: true,
        schemaMatched: true,
      };
      await writeFile(
        projectPath(join(directory, `${targetName}.json`)),
        JSON.stringify(report, null, 2),
        { flag: 'wx', mode: 0o600 },
      );
      return { ...report, fingerprints: after };
    } finally {
      client.release();
    }
  } finally {
    await source.query('ROLLBACK').catch(() => undefined);
    source.release();
    await pool.end();
    await restored?.end();
  }
}
