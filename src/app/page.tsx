import { PageShell } from '@/components/shell';
import { SampleBadge, StateBox, StatusPill } from '@/components/ui';
import Link from 'next/link';
import { formatJalaliDate, formatJalaliTime, formatToman } from '@/lib/format';
import { SAMPLE_EVENTS } from '@/lib/sample-data';
import { eventFiltersSchema, publicEvents } from '@/server/catalog';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = eventFiltersSchema.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : eventFiltersSchema.parse({});
  const allEvents = await publicEvents();
  const active = Object.values(filters).some(Boolean);
  const events = active ? await publicEvents(filters) : allEvents;
  const cities = [...new Set(allEvents.map((e) => e.city as string))];
  const categories = [...new Set(allEvents.map((e) => e.category as string))];
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
      <form
        action="/"
        method="get"
        aria-label="جست‌وجو و فیلتر رویدادها"
        className="mb-8 grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="form-label">
          جست‌وجوی رویداد
          <input
            className="form-input"
            type="search"
            name="q"
            maxLength={200}
            defaultValue={filters.q}
            placeholder="نام یا توضیح رویداد"
          />
        </label>
        <label className="form-label">
          شهر
          <select className="form-input" name="city" defaultValue={filters.city}>
            <option value="">همه شهرها</option>
            {cities.map((city) => (
              <option key={city}>{city}</option>
            ))}
          </select>
        </label>
        <label className="form-label">
          دسته
          <select className="form-input" name="category" defaultValue={filters.category}>
            <option value="">همه دسته‌ها</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="form-label">
          زمان برگزاری
          <select className="form-input" name="when" defaultValue={filters.when}>
            <option value="">همه زمان‌ها</option>
            <option value="today">امروز به وقت ایران</option>
            <option value="week">۷ روز آینده</option>
            <option value="month">۳۰ روز آینده</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
          <button
            className="min-h-12 rounded-lg bg-primary px-6 font-medium text-on-primary"
            type="submit"
          >
            نمایش رویدادها
          </button>
          {active && (
            <Link href="/" className="inline-flex min-h-11 items-center text-primary underline">
              پاک کردن فیلترها
            </Link>
          )}
          <p className="text-sm text-muted" role="status">
            {events.length.toLocaleString('fa-IR')} نتیجه
          </p>
        </div>
        {!parsed.success && (
          <p role="alert" className="text-sm text-danger sm:col-span-2 lg:col-span-4">
            فیلتر معتبر نیست؛ دوباره انتخاب کنید.
          </p>
        )}
      </form>
      <h2 className="mb-4 text-lg font-bold">رویدادهای منتشرشده</h2>
      {events.length === 0 ? (
        <StateBox
          kind="empty"
          title={active ? 'رویدادی با این فیلترها پیدا نشد' : 'هنوز رویدادی منتشر نشده است'}
        />
      ) : (
        <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li
              key={`${event.id}-${event.city}`}
              className="rounded-xl border border-line bg-surface p-5"
            >
              <p className="text-sm text-muted">
                {event.category} · {event.city}
              </p>
              <h3 className="mt-2 font-bold">
                <Link className="text-primary underline" href={`/events/${event.id}`}>
                  {event.title}
                </Link>
              </h3>
              <p className="mt-3 text-sm">از {formatJalaliDate(event.starts_at)}</p>
              <p className="text-sm">از {formatToman(Number(event.min_price_rial))}</p>
            </li>
          ))}
        </ul>
      )}
      {process.env.NODE_ENV !== 'production' && !active && (
        <>
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
        </>
      )}
    </PageShell>
  );
}
