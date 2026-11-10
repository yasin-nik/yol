import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { PageShell } from '@/components/shell';
import { Reservation } from '@/components/reservation';
import { getInventory } from '@/server/inventory';
import { DomainError } from '@/server/errors';
import { uuid } from '@/server/catalog';
import { formatJalaliDate, formatJalaliTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  let snapshot;
  try {
    snapshot = await getInventory(id, (await cookies()).get('yoltick_buyer')?.value);
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
  return (
    <PageShell>
      <h1 className="text-2xl font-extrabold">{snapshot.title}</h1>
      <p className="mb-6 mt-2 text-sm text-muted">
        {snapshot.venue} · {formatJalaliDate(snapshot.startsAt)} ·{' '}
        {formatJalaliTime(snapshot.startsAt)}
      </p>
      <Reservation sessionId={id} initial={snapshot} />
    </PageShell>
  );
}
