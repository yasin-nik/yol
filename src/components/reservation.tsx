'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InventorySnapshot } from '@/lib/inventory';
import { formatToman, toFaDigits } from '@/lib/format';
import { SeatMap } from './seat-map';
import { Checkout } from './checkout';

export function Reservation({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: InventorySnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState<string[]>(initial.hold?.seatIds ?? []);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  const refreshing = useRef<Promise<void> | null>(null);
  const mutating = useRef(false);

  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/inventory`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const next = data as InventorySnapshot;
        deadline.current =
          performance.now() +
          (next.hold
            ? new Date(next.hold.expiresAt).getTime() - new Date(next.serverTime).getTime()
            : 0);
        setRemaining(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)));
        setSnapshot(next);
        setReady(true);
        setSelected(
          (current) =>
            next.hold?.seatIds ??
            current.filter((id) =>
              next.data.rows.some((row) =>
                row.seats.some((seat) => seat.id === id && seat.status === 'AVAILABLE'),
              ),
            ),
        );
        setRefreshError('');
      } catch (failure) {
        setRefreshError(failure instanceof Error ? failure.message : 'دریافت نقشه انجام نشد.');
      }
    })().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden && !mutating.current) void refresh();
    }, 5000);
    const onFocus = () => {
      if (!mutating.current) void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(
      () => setRemaining(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000))),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  async function mutate(method: 'POST' | 'DELETE') {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError('');
    try {
      await refreshing.current;
      const response = await fetch(`/api/sessions/${sessionId}/holds`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          method === 'POST' ? { seatIds: selected } : { holdId: snapshot.hold?.id },
        ),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (method === 'DELETE') setSelected([]);
      await refresh();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'ثبت درخواست انجام نشد.';
      await refresh();
      setError(message);
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">موجودی سرور هر ۵ ثانیه تازه می‌شود.</p>
        <button
          className="min-h-11 rounded-lg border border-line px-4"
          onClick={() => void refresh()}
        >
          تازه‌سازی نقشه
        </button>
      </div>
      {(error || refreshError) && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-danger">
          {error || refreshError}
        </p>
      )}
      {snapshot.hold && (
        <section className="rounded-2xl border border-success/30 bg-success/10 p-5">
          <h2 className="font-bold text-success">رزرو موقت شما ثبت شده است</h2>
          <p>
            {toFaDigits(snapshot.hold.seatIds.length)} صندلی ·{' '}
            {formatToman(snapshot.hold.totalRial)}
          </p>
          <p className="mt-2">
            زمان باقی‌مانده:{' '}
            <span role="timer" aria-live="off" className="font-bold tabular-nums" dir="ltr">
              {toFaDigits(
                `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`,
              )}
            </span>
          </p>
          {remaining === 0 && (
            <p role="status" className="text-sm">
              زمان رزرو پایان یافته؛ وضعیت سرور در حال بررسی است.
            </p>
          )}
          {snapshot.hold.paymentState !== 'NONE' && (
            <p role="status">رزرو به علت وضعیت پرداخت برای بررسی نگه داشته شده است.</p>
          )}
          <p className="mt-2 text-sm text-muted">
            برای ثبت سفارش با شماره موبایل وارد شوید. زمان رزرو با ورود تمدید نمی‌شود.
          </p>
          <button
            disabled={busy || snapshot.hold.paymentState !== 'NONE'}
            onClick={() => void mutate('DELETE')}
            className="mt-3 min-h-11 rounded-lg border border-danger/30 px-4 text-danger disabled:opacity-50"
          >
            {busy ? 'در حال ثبت…' : 'لغو رزرو و انتخاب دوباره'}
          </button>
          <Checkout sessionId={sessionId} holdId={snapshot.hold.id} disabled={remaining === 0} />
        </section>
      )}
      <SeatMap
        data={snapshot.data}
        maxSeats={snapshot.maxSeats}
        selectedIds={selected}
        onChange={setSelected}
        onSubmit={() => void mutate('POST')}
        busy={busy || !ready}
        disabled={Boolean(snapshot.hold)}
      />
    </div>
  );
}
