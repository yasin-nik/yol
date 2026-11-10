'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CustomerLogin } from './customer-login';
export function Checkout({
  sessionId,
  holdId,
  disabled,
}: {
  sessionId: string;
  holdId: string;
  disabled: boolean;
}) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    fetch('/api/customer')
      .then((r) => {
        if (!r.ok && r.status !== 401) throw new Error('Authentication unavailable');
        setAuthenticated(r.ok);
      })
      .catch(() => setError('بررسی ورود انجام نشد؛ صفحه را تازه کنید.'));
  }, []);
  if (authenticated === false)
    return (
      <div className="my-5">
        <CustomerLogin onSuccess={() => setAuthenticated(true)} />
      </div>
    );
  return (
    <div className="mt-4 space-y-3">
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        disabled={disabled || busy || !authenticated}
        className="min-h-12 rounded-xl bg-primary px-6 py-3 font-bold text-on-primary disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const response = await fetch('/api/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, holdId }),
            });
            const data = await response.json();
            if (!response.ok) {
              if (response.status === 401) setAuthenticated(false);
              throw new Error(data.error);
            }
            router.push('/my-tickets#order-' + data.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'ثبت سفارش انجام نشد.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? 'در حال ثبت سفارش…'
          : authenticated === null
            ? 'در حال بررسی ورود…'
            : 'ادامه و ثبت سفارش'}
      </button>
    </div>
  );
}
