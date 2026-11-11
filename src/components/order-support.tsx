'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function OrderSupport({ orderId }: { orderId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const router = useRouter();
  return (
    <details className="rounded-xl border border-line p-3">
      <summary className="min-h-11 cursor-pointer">درخواست پشتیبانی این سفارش</summary>
      <form
        className="space-y-3"
        aria-busy={pending}
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          setPending(true);
          setResult({});
          try {
            const result = await fetch('/api/support', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId, message }),
            });
            const data = await result.json();
            if (!result.ok) setResult({ error: data.error });
            else {
              setResult({ success: 'درخواست ثبت شد؛ پاسخ را در همین صفحه ببینید.' });
              setMessage('');
              router.refresh();
            }
          } catch {
            setResult({ error: 'ارتباط برقرار نشد؛ دوباره تلاش کنید.' });
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="form-label">
          شرح درخواست
          <textarea
            className="form-input"
            required
            minLength={3}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        {result.error && (
          <p role="alert" className="text-danger">
            {result.error}
          </p>
        )}
        {result.success && (
          <p role="status" className="text-success">
            {result.success}
          </p>
        )}
        <button
          disabled={pending}
          className="min-h-12 rounded-xl bg-primary px-5 font-bold text-on-primary disabled:opacity-50"
        >
          {pending ? 'در حال ثبت…' : 'ثبت درخواست'}
        </button>
      </form>
    </details>
  );
}
