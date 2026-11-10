'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PaymentButton({
  orderId,
  authority,
  checkoutUrl,
}: {
  orderId: string;
  authority?: string;
  checkoutUrl?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  return (
    <div className="space-y-3">
      <button
        disabled={busy}
        className="min-h-12 rounded-xl bg-primary px-5 py-3 font-bold text-on-primary disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const r = await fetch('/api/payments', {
              method: authority ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(authority ? { authority } : { orderId }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            if (data.url) router.push(data.url);
            else router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'بررسی پرداخت انجام نشد.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'در حال بررسی…' : authority ? 'استعلام دوباره پرداخت' : 'ادامه به پرداخت آزمایشی'}
      </button>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {authority && checkoutUrl && (
        <a
          className="inline-flex min-h-11 items-center px-3 text-primary underline"
          href={checkoutUrl}
        >
          بازگشت به درگاه آزمایشی
        </a>
      )}
    </div>
  );
}
export function FakePaymentControls({ authority }: { authority: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function simulate(outcome: 'SUCCESS' | 'FAILED' | 'UNKNOWN') {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/payments/fake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authority, outcome }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      router.push('/my-tickets');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'شبیه‌سازی انجام نشد.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        onClick={() => void simulate('SUCCESS')}
        className="min-h-12 w-full rounded-xl bg-primary p-3 font-bold text-on-primary disabled:opacity-50"
      >
        {busy ? 'در حال بررسی…' : 'شبیه‌سازی پرداخت موفق'}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={busy}
          onClick={() => void simulate('FAILED')}
          className="min-h-12 rounded-xl border border-danger/30 p-3 text-danger disabled:opacity-50"
        >
          پرداخت ناموفق
        </button>
        <button
          disabled={busy}
          onClick={() => void simulate('UNKNOWN')}
          className="min-h-12 rounded-xl border border-line p-3 disabled:opacity-50"
        >
          نتیجه نامشخص
        </button>
      </div>
    </div>
  );
}
export function PrintTickets() {
  return (
    <button
      className="min-h-11 rounded-xl border border-line px-5 print:hidden"
      onClick={() => window.print()}
    >
      چاپ یا ذخیره بلیت‌ها
    </button>
  );
}
