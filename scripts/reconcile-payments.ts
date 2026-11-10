import { reconcilePayments } from '../src/server/payments';
import { closePool } from '../src/server/db/pool';
async function main() {
  try {
    const result = await reconcilePayments();
    console.log(result);
    if (result.errors) process.exitCode = 1;
  } finally {
    await closePool();
  }
}
main().catch(() => {
  console.error('Payment reconciliation failed');
  process.exitCode = 1;
});
