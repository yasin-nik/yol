import { expireHolds } from '../src/server/inventory';
import { closePool } from '../src/server/db/pool';

async function main() {
  try {
    console.log(`expired holds: ${await expireHolds()}`);
  } finally {
    await closePool();
  }
}
main().catch(() => {
  console.error('آزادسازی رزروها انجام نشد.');
  process.exitCode = 1;
});
