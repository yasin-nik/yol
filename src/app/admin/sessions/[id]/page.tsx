import { notFound } from 'next/navigation';
import { PageShell } from '@/components/shell';
import { AdminForm } from '@/components/admin-forms';
import { requireAdminPage } from '@/server/web-auth';
import { getInventory } from '@/server/inventory';
import { uuid } from '@/server/catalog';
import { DomainError } from '@/server/errors';
import { blockAction } from './actions';
import { formatToman } from '@/lib/format';

export default async function AdminSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await requireAdminPage();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  let snapshot;
  try {
    snapshot = await getInventory(id, undefined, token);
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
  const editable = snapshot.data.rows
    .flatMap((row) => row.seats)
    .filter((seat) => seat.status === 'AVAILABLE' || seat.status === 'BLOCKED');
  return (
    <PageShell>
      <h1 className="text-2xl font-bold">مدیریت صندلی — {snapshot.title}</h1>
      <p className="my-4 text-sm text-muted">
        فقط صندلی آزاد یا مسدود قابل تغییر است. رزرو فعال و فروش قابل تغییر نیستند؛ هر تغییر ثبت
        می‌شود.
      </p>
      <div className="max-w-xl">
        <AdminForm action={blockAction} submit="ثبت وضعیت صندلی">
          <input type="hidden" name="sessionId" value={id} />
          <label className="form-label">
            صندلی
            <select name="seatId" className="form-input" required>
              {editable.map((seat) => (
                <option key={seat.id} value={seat.id}>
                  {seat.label} · {formatToman(seat.priceRial)} ·{' '}
                  {seat.status === 'AVAILABLE' ? 'آزاد' : 'مسدود'}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            وضعیت جدید
            <select className="form-input" name="blocked">
              <option value="true">مسدود</option>
              <option value="false">آزاد</option>
            </select>
          </label>
        </AdminForm>
      </div>
    </PageShell>
  );
}
