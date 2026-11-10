import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageShell } from '@/components/shell';
import { SampleBadge, StatusPill } from '@/components/ui';
import { formatJalaliDate, formatJalaliTime, formatToman } from '@/lib/format';
import { findSampleEvent } from '@/lib/sample-data';
import { SeatMap } from '@/components/seat-map';
import { buildSampleSeatMap } from '@/lib/sample-seat-map';
import { publicEvent } from '@/server/catalog';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const real = await publicEvent(id);
  if (real)
    return (
      <PageShell>
        <h1 className="text-2xl font-extrabold">{real.title}</h1>
        <p className="mt-2 text-sm text-muted">{real.category}</p>
        <p className="mt-4 whitespace-pre-line">{real.description}</p>
        <h2 className="mb-4 mt-8 text-lg font-bold">سانس‌ها</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {real.sessions.map((session) => (
            <li key={session.id} className="rounded-xl border border-line bg-surface p-5">
              <h3 className="font-bold">
                {session.venue}، {session.city}
              </h3>
              <p>
                {formatJalaliDate(session.starts_at)} · {formatJalaliTime(session.starts_at)}
              </p>
              <p className="mt-2 text-sm text-muted">{session.address}</p>
              <Link
                href={`/sessions/${session.id}`}
                className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-primary px-5 text-on-primary"
              >
                انتخاب صندلی
              </Link>
            </li>
          ))}
        </ul>
      </PageShell>
    );
  const event = process.env.NODE_ENV === 'production' ? null : findSampleEvent(id);
  if (!event) notFound();
  const canBuy = event.status === 'ON_SALE';
  return (
    <PageShell>
      <SampleBadge />
      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-extrabold">{event.title}</h1>
        <StatusPill status={event.status} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
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
