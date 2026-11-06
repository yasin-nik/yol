import { notFound } from 'next/navigation';
import { PageShell } from '@/components/shell';
import { SampleBadge, StatusPill } from '@/components/ui';
import { formatJalaliDate, formatJalaliTime, formatToman } from '@/lib/format';
import { findSampleEvent } from '@/lib/sample-data';
import { SeatMap } from '@/components/seat-map';
import { buildSampleSeatMap } from '@/lib/sample-seat-map';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = findSampleEvent(id);
  if (!event) notFound();
  const canBuy = event.status === 'ON_SALE';
  return (
    <PageShell>
      <SampleBadge />
      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-extrabold">{event.title}</h1>
        <StatusPill status={event.status} />
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">مکان</dt>
          <dd>
            {event.venue}، {event.city}
          </dd>
        </div>
        <div>
          <dt className="text-muted">زمان</dt>
          <dd>
            {formatJalaliDate(event.startsAtUtc)} · {formatJalaliTime(event.startsAtUtc)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">شروع قیمت</dt>
          <dd>{formatToman(event.minPriceRial)}</dd>
        </div>
      </dl>
      <p className="mt-4">{event.description}</p>
      {canBuy ? (
        <div className="mt-6">
          <SeatMap data={buildSampleSeatMap()} maxSeats={6} />
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-center text-muted">
          خرید برای این رویداد در دسترس نیست.
        </p>
      )}
    </PageShell>
  );
}
