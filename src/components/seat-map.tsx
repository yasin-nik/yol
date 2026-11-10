'use client';

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { formatToman } from '@/lib/format';
import { GAP, W, seatLabel, seatMapHeight, seatMapWidth, selectSeat } from '@/lib/seat-map';
import type { SeatMapData, SeatMapSeat } from '@/lib/seat-map';

const COLORS: Record<SeatMapSeat['status'], string> = {
  AVAILABLE: 'fill-emerald-700',
  HELD: 'fill-amber-500',
  SOLD: 'fill-slate-400',
  BLOCKED: 'fill-slate-300',
};

const SWATCH: Record<SeatMapSeat['status'], string> = {
  AVAILABLE: 'bg-emerald-700',
  HELD: 'bg-amber-500',
  SOLD: 'bg-slate-400',
  BLOCKED: 'bg-slate-300',
};

const LABELS: Record<SeatMapSeat['status'], string> = {
  AVAILABLE: 'آزاد',
  HELD: 'در حال خرید',
  SOLD: 'فروخته‌شده',
  BLOCKED: 'مسدود',
};

export function SeatMap({
  data,
  maxSeats,
  onChange,
  selectedIds,
  onSubmit,
  busy = false,
  disabled = false,
}: {
  data: SeatMapData;
  maxSeats: number;
  onChange?: (ids: string[]) => void;
  selectedIds?: string[];
  onSubmit?: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const [internalSelected, setSelected] = useState<string[]>([]);
  const selected = selectedIds ?? internalSelected;
  const [notice, setNotice] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const width = seatMapWidth(data.rows);

  function toggle(seat: SeatMapSeat) {
    if (disabled || busy || seat.status !== 'AVAILABLE') return;
    const next = selectSeat(selected, seat.id, maxSeats);
    setNotice(next === selected ? 'به سقف انتخاب صندلی رسیده‌اید.' : '');
    setSelected(next);
    onChange?.(next);
  }

  function onDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (
      event.pointerType !== 'mouse' ||
      (event.target as Element).getAttribute('role') === 'button'
    )
      return;
    drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    setPan({
      x:
        drag.current.px +
        ((event.clientX - drag.current.x) * width) /
          event.currentTarget.getBoundingClientRect().width,
      y:
        drag.current.py +
        ((event.clientY - drag.current.y) * width) /
          event.currentTarget.getBoundingClientRect().width,
    });
  }
  function onUp() {
    drag.current = null;
  }

  const total = selected.reduce((sum, id) => {
    const seat = data.rows.flatMap((r) => r.seats).find((s) => s.id === id);
    return sum + (seat?.priceRial ?? 0);
  }, 0);

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}
            className="min-h-11 rounded-lg border border-line px-3"
            aria-label="بزرگ‌نمایی نقشه"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
            className="min-h-11 rounded-lg border border-line px-3"
            aria-label="کوچک‌نمایی نقشه"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="min-h-11 rounded-lg border border-line px-3"
          >
            بازنشانی
          </button>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs">
          {(Object.keys(LABELS) as SeatMapSeat['status'][]).map((status) => (
            <li key={status} className="flex items-center gap-1">
              <span
                className={`inline-block h-3 w-3 rounded-sm ${SWATCH[status]}`}
                aria-hidden="true"
              />
              {LABELS[status]}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="max-h-[60vh] overflow-auto rounded-xl bg-background"
        dir="ltr"
        tabIndex={0}
        role="region"
        aria-label="ناحیه نقشه؛ برای دیدن همه صندلی‌ها پیمایش کنید"
      >
        <svg
          role="group"
          aria-label={`نقشه صندلی ${data.sectionName}`}
          viewBox={`0 0 ${width} ${seatMapHeight(data.rows)}`}
          className="w-full select-none"
          style={{ minWidth: width * zoom }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <g transform={`translate(${pan.x} ${pan.y})`}>
            <text x={width / 2} y={22} textAnchor="middle" className="fill-slate-500 text-[12px]">
              صحنه
            </text>
            {data.rows.map((row) => (
              <g key={row.index} transform={`translate(140 ${40 + (row.index - 1) * (W + GAP)})`}>
                <text
                  x={-12}
                  y={W / 2 + 4}
                  textAnchor="end"
                  className="fill-foreground text-[11px]"
                >
                  {row.label.length > 20 ? `${row.label.slice(0, 18)}…` : row.label}
                </text>
                {row.seats.map((seat) => {
                  const isSelected = selected.includes(seat.id);
                  return (
                    <g key={seat.id}>
                      <rect
                        x={(seat.col - 1) * (W + GAP)}
                        width={W}
                        height={W}
                        rx={6}
                        role="button"
                        tabIndex={seat.status === 'AVAILABLE' && !disabled ? 0 : -1}
                        aria-disabled={disabled || busy || seat.status !== 'AVAILABLE'}
                        aria-label={`${seatLabel(seat)}، ${LABELS[seat.status]}، ${formatToman(seat.priceRial)}`}
                        aria-pressed={isSelected}
                        className={`${isSelected ? 'fill-primary' : COLORS[seat.status]} cursor-pointer outline-none focus-visible:stroke-slate-900 focus-visible:stroke-2`}
                        onClick={() => toggle(seat)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggle(seat);
                          }
                        }}
                      />
                      <text
                        x={(seat.col - 1) * (W + GAP) + W / 2}
                        y={W / 2 + 4}
                        textAnchor="middle"
                        className={`pointer-events-none text-[11px] font-bold ${isSelected || seat.status === 'AVAILABLE' ? 'fill-white' : 'fill-slate-900'}`}
                        aria-hidden="true"
                      >
                        {isSelected
                          ? '✓'
                          : seat.status === 'SOLD'
                            ? '×'
                            : seat.status === 'BLOCKED'
                              ? '−'
                              : seat.status === 'HELD'
                                ? '…'
                                : seat.col.toLocaleString('fa-IR')}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))}
          </g>
        </svg>
      </div>

      {selected.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="صندلی‌های انتخاب‌شده">
          {data.rows
            .flatMap((row) => row.seats)
            .filter((seat) => selected.includes(seat.id))
            .map((seat) => (
              <li key={seat.id} className="rounded-lg bg-primary/10 px-3 py-2 text-primary">
                ✓ {seatLabel(seat)}
              </li>
            ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {selected.length === 0
            ? 'صندلی‌ای انتخاب نشده'
            : `${selected.length.toLocaleString('fa-IR')} صندلی`}
          {selected.length > 0 ? ` · ${formatToman(total)}` : ''}
        </span>
        <button
          type="button"
          disabled={selected.length === 0 || !onSubmit || disabled || busy}
          onClick={onSubmit}
          className="min-h-12 rounded-xl bg-primary px-6 font-bold text-on-primary disabled:opacity-50"
        >
          {busy ? 'در حال ثبت…' : onSubmit ? 'رزرو موقت صندلی‌ها' : 'نقشه نمایشی'}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        حداکثر {maxSeats.toLocaleString('fa-IR')} صندلی در هر سفارش. با دکمه‌ها بزرگ‌نمایی و درون
        نقشه پیمایش کنید. انتخاب تا ثبت رزرو تضمین نمی‌شود.
      </p>
      <p role="status" className="text-sm text-warning">
        {notice}
      </p>
    </div>
  );
}
