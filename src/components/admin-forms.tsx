'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';
import { catalogAction, loginAction } from '@/app/admin/actions';
import type { FormState } from '@/app/admin/actions';

export function AdminForm({ children, action = catalogAction, submit = 'ثبت اطلاعات' }: { children: ReactNode; action?: (state: FormState, form: FormData) => Promise<FormState>; submit?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-line bg-surface p-5" aria-busy={pending}>
      {children}
      {state.error && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-success">{state.success}</p>}
      <button disabled={pending} className="min-h-12 rounded-xl bg-primary px-5 font-bold text-on-primary disabled:opacity-50">{pending ? 'در حال ثبت…' : submit}</button>
    </form>
  );
}

export function LoginForm() {
  return <AdminForm action={loginAction} submit="ورود به مدیریت">
    <label className="form-label">ایمیل مدیر<input className="form-input" type="email" name="email" autoComplete="username" dir="ltr" required maxLength={254} /></label>
    <label className="form-label">رمز عبور<input className="form-input" type="password" name="password" autoComplete="current-password" dir="ltr" required maxLength={128} /></label>
  </AdminForm>;
}

type Option = { id: string; name: string };
export function SessionForm({ venues, sections, events }: { venues: Option[]; sections: (Option & { venue_id: string })[]; events: { id: string; title: string }[] }) {
  const [venueId, setVenueId] = useState(venues[0]?.id ?? '');
  if (!venues.length || !events.length) return <p className="rounded-xl border border-dashed border-line p-5 text-muted">ابتدا سالن و رویداد بسازید.</p>;
  return <AdminForm submit="ساخت سانس و موجودی صندلی‌ها">
    <input type="hidden" name="action" value="session" />
    <label className="form-label">رویداد<select className="form-input" name="eventId" required>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
    <label className="form-label">سالن<select className="form-input" name="venueId" value={venueId} onChange={(event) => setVenueId(event.target.value)} required>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
    <label className="form-label">تاریخ و ساعت به وقت تهران<input className="form-input" type="datetime-local" name="startsAt" dir="ltr" required /><span className="text-xs text-muted">ورودی تقویم مرورگر میلادی است؛ زمان ثبت‌شده در فهرست به شمسی نمایش داده می‌شود.</span></label>
    {sections.filter((section) => section.venue_id === venueId).map((section) => <label className="form-label" key={section.id}>قیمت بخش {section.name} (ریال)<input className="form-input" type="number" min="0" max="9000000000000" step="1" name={`price:${section.id}`} required /></label>)}
  </AdminForm>;
}
