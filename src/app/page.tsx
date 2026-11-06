import { PageShell } from '@/components/shell';
import { SampleBadge, StateBox, StatusPill } from '@/components/ui';
import Link from 'next/link';
import { formatJalaliDate, formatJalaliTime, formatToman } from '@/lib/format';
import { SAMPLE_EVENTS } from '@/lib/sample-data';

export default function HomePage() {
  return (
    <PageShell>
      <section className="mb-8 rounded-2xl bg-primary p-6 text-on-primary sm:p-10">
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          بلیت رویداد را با انتخاب صندلی بخرید
        </h1>
        <p className="mt-2 text-sm opacity-90">
          کنسرت، تئاتر و استندآپ؛ نقشه سالن، انتخاب صندلی و بلیت QR.
        </p>
      </section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">رویدادها</h2>
        <SampleBadge />
      </div>
      {SAMPLE_EVENTS.length === 0 ? (
        <StateBox kind="empty" title="فعلاً رویدادی وجود ندارد" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_EVENTS.map((event) => (
            <li key={event.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">
                  {event.category} · {event.city}
                </span>
                <StatusPill status={event.status} />
              </div>
              <h3 className="mt-2 font-bold">
                <Link href={`/events/${event.id}`} className="hover:underline">
                  {event.title}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-muted">{event.venue}</p>
              <p className="text-sm">
                {formatJalaliDate(event.startsAtUtc)} · {formatJalaliTime(event.startsAtUtc)}
              </p>
              <p className="mt-2 text-sm font-medium">از {formatToman(event.minPriceRial)}</p>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
