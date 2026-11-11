import { backup } from './backup-lib';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const saved = await backup(
    process.env.DATABASE_URL,
    `.local/backups/yoltick_${new Date().toISOString().replaceAll(/[:.]/g, '-')}.dump`,
  );
  console.log(JSON.stringify(saved));
}
main().catch(() => {
  console.error('Backup failed; check local configuration and PG_BIN.');
  process.exitCode = 1;
});
