import { restoreDrill } from './backup-lib';

async function main() {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
  const { fingerprints: _, ...report } = await restoreDrill(
    process.env.TEST_DATABASE_URL,
    '.local/backups',
  );
  void _;
  console.log(JSON.stringify(report));
}
main().catch(() => {
  console.error(
    'Restore drill failed; check PG_BIN and project-local CREATEDB permission. Existing databases were not overwritten.',
  );
  process.exitCode = 1;
});
