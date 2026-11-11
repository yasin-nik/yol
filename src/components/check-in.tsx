'use client';
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { formatJalaliTime } from '@/lib/format';

export function Scanner({
  sessions,
}: {
  sessions: { id: string; label: string; admitted: string }[];
}) {
  const [sessionId, setSession] = useState(sessions[0].id);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [camera, setCamera] = useState(false);
  const [result, setResult] = useState<{
    status?: string;
    label?: string;
    at?: string;
    error?: string;
  }>();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((ticket) => ticket.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
    setCamera(false);
  }
  useEffect(
    () => () => {
      generation.current++;
      stream.current?.getTracks().forEach((ticket) => ticket.stop());
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function scan() {
    stop();
    setResult(undefined);
    const current = generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (generation.current !== current) {
        media.getTracks().forEach((ticket) => ticket.stop());
        return;
      }
      stream.current = media;
      setCamera(true);
      if (!video.current) {
        stop();
        return;
      }
      video.current.srcObject = media;
      await video.current.play();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      function frame() {
        if (generation.current !== current || !video.current || !ctx) return;
        if (video.current.readyState >= 2) {
          canvas.width = Math.min(video.current.videoWidth, 800);
          canvas.height = Math.round(
            (video.current.videoHeight * canvas.width) / video.current.videoWidth,
          );
          ctx.drawImage(video.current, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(image.data, image.width, image.height);
          if (qr) {
            setCode(qr.data);
            stop();
            return;
          }
        }
        timer.current = setTimeout(frame, 180);
      }
      frame();
    } catch {
      stop();
      setResult({
        error:
          'دوربین باز نشد. دسترسی دوربین و HTTPS را بررسی کنید یا از ورود دستی کد استفاده کنید.',
      });
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    stop();
    setPending(true);
    setResult(undefined);
    try {
      const response = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, code: code.trim() }),
      });
      setResult(await response.json());
    } catch {
      setResult({ error: 'پاسخ دریافت نشد؛ دوباره بررسی کنید. تأیید ورود انجام نشده است.' });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <label className="form-label">
        سانس ورودی
        <select
          className="form-input"
          value={sessionId}
          disabled={pending}
          onChange={(event) => {
            stop();
            setSession(event.target.value);
            setCode('');
            setResult(undefined);
          }}
        >
          {sessions.map((entry) => (
            <option value={entry.id} key={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted">
        {sessions.find((entry) => entry.id === sessionId)?.label}
      </p>
      <p className="text-sm text-muted">
        تعداد ورود در زمان باز شدن صفحه:{' '}
        {sessions.find((entry) => entry.id === sessionId)?.admitted}
      </p>
      <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
        <h2 className="font-bold">خواندن بلیت</h2>
        <video
          ref={video}
          muted
          playsInline
          aria-label="تصویر دوربین اسکن بلیت"
          className={camera ? 'aspect-video w-full rounded-xl bg-black object-cover' : 'hidden'}
        />
        <button
          type="button"
          disabled={pending}
          className="min-h-12 rounded-xl border border-line px-5"
          onClick={() => (camera ? stop() : void scan())}
        >
          {camera ? 'بستن دوربین' : 'باز کردن دوربین'}
        </button>
        <p className="text-sm text-muted">
          پس از خواندن QR، دکمه ثبت ورود را بزنید. اسکنر دستی هم می‌تواند کد را در کادر زیر وارد
          کند.
        </p>
        <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
          <label className="form-label">
            کد QR
            <input
              className="form-input font-mono"
              dir="ltr"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              maxLength={64}
              pattern="[a-f0-9]{64}"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            disabled={pending}
            className="min-h-12 w-full rounded-xl bg-primary px-5 font-bold text-on-primary disabled:opacity-50"
          >
            {pending ? 'در حال بررسی…' : 'بررسی و ثبت ورود'}
          </button>
        </form>
      </section>
      {result && (
        <div
          role={result.error ? 'alert' : 'status'}
          className={`rounded-2xl border p-6 ${result.status === 'ACCEPTED' ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger'}`}
        >
          <p className="text-xl font-bold">
            {result.error ??
              {
                ACCEPTED: 'ورود تأیید شد',
                USED: 'قبلاً استفاده شده؛ اجازه ورود ندهید',
                INVALID: 'بلیت نامعتبر یا مربوط به سانس دیگری است',
              }[result.status ?? ''] ??
              'پاسخ نامعتبر؛ دوباره بررسی کنید'}
          </p>
          {result.label && <p className="mt-2">{result.label}</p>}
          {result.at && <p className="mt-2">زمان ثبت: {formatJalaliTime(result.at)}</p>}
        </div>
      )}
    </div>
  );
}
