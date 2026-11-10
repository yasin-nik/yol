'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function CustomerLogin({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [demo, setDemo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/customer', {
        method: challenge ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(challenge ? { challengeId: challenge, code } : { phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (challenge) {
        onSuccess?.();
        router.refresh();
      } else {
        setChallenge(data.challengeId);
        setDemo(data.developmentCode ?? '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ورود انجام نشد.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-md space-y-5 rounded-2xl border border-line bg-surface p-6"
    >
      <div>
        <h2 className="text-xl font-bold">ورود با شماره موبایل</h2>
        <p className="mt-2 text-sm text-muted">
          بلیت‌ها و سفارش‌ها با همین شماره در دسترس شما هستند.
        </p>
      </div>
      {!challenge ? (
        <label className="form-label">
          شماره موبایل
          <input
            className="form-input"
            dir="ltr"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="۰۹۱۲۱۲۳۴۵۶۷"
            required
            maxLength={11}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
      ) : (
        <>
          <p className="text-sm">
            کد ورود برای <b dir="ltr">{phone}</b> · اعتبار کد ۲ دقیقه
          </p>
          <label className="form-label">
            کد شش‌رقمی
            <input
              className="form-input tracking-widest"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {demo && (
            <p role="note" className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
              پیامک آزمایشی است؛ پیامی ارسال نمی‌شود. کد توسعه: <b dir="ltr">{demo}</b>
            </p>
          )}
          <button
            type="button"
            className="min-h-11 text-primary underline"
            onClick={() => {
              setChallenge('');
              setCode('');
              setError('');
            }}
          >
            تغییر شماره یا دریافت کد تازه
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="min-h-12 w-full rounded-xl bg-primary px-5 py-3 font-bold text-on-primary disabled:opacity-50"
      >
        {busy ? 'در حال بررسی…' : challenge ? 'تأیید و ورود' : 'دریافت کد ورود'}
      </button>
    </form>
  );
}
export function CustomerLogout() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        disabled={busy}
        className="min-h-11 rounded-lg border border-line px-4 disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const r = await fetch('/api/customer', { method: 'DELETE' });
            if (!r.ok) throw new Error();
            router.refresh();
          } catch {
            setError('خروج انجام نشد؛ دوباره تلاش کنید.');
          } finally {
            setBusy(false);
          }
        }}
      >
        خروج از حساب
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
