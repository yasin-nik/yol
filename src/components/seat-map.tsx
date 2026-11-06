'use client';

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { formatToman } from '@/lib/format';
import { GAP, W, seatLabel, seatMapHeight, seatMapWidth, selectSeat } from '@/lib/seat-map';
import type { SeatMapData, SeatMapSeat } from '@/lib/seat-map';

const COLORS: Record<SeatMapSeat['status'], string> = {
  AVAILABLE: 'fill-emerald-600',
  HELD: 'fill-amber-500',
  SOLD: 'fill-slate-400',
  BLOCKED: 'fill-slate-300',
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
}: {
  data: SeatMapData;
  maxSeats: number;
  onChange?: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const width = seatMapWidth(data.rows);

  function toggle(seat: SeatMapSeat) {
    if (seat.status !== 'AVAILABLE') return;
    const next = selectSeat(selected, seat.id, maxSeats);
    setSelected(next);
    onChange?.(next);
  }

  function onDown(event: ReactPointerEvent<SVGSVGElement>) {
    drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    setPan({
      x: drag.current.px + (event.clientX - drag.current.x),
      y: drag.current.py + (event.clientY - drag.current.y),
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
            onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
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
                className={`inline-block h-3 w-3 rounded-sm ${COLORS[status].replace('fill-', 'bg-')}`}
                aria-hidden="true"
              />
              {LABELS[status]}
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-hidden rounded-xl bg-background">
        <svg
          role="group"
          aria-label={`نقشه صندلی ${data.sectionName}`}
          viewBox={`0 0 ${width} ${seatMapHeight(data.rows)}`}
          className="w-full touch-none select-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <text x={width / 2} y={22} textAnchor="middle" className="fill-slate-500 text-[12px]">
              صحنه
            </text>
            {data.rows.map((row) => (
              <g key={row.index} transform={`translate(20 ${40 + (row.index - 1) * (W + GAP)})`}>
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
                        tabIndex={seat.status === 'AVAILABLE' ? 0 : -1}
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
                        className="pointer-events-none fill-white text-[11px]"
                        aria-hidden="true"
                      >
                        {seat.col.toLocaleString('fa-IR')}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {selected.length === 0
            ? 'صندلی‌ای انتخاب نشده'
            : `${selected.length.toLocaleString('fa-IR')} صندلی`}
          {selected.length > 0 ? ` · ${formatToman(total)}` : ''}
        </span>
        <button
          type="button"
          disabled={selected.length === 0}
          className="min-h-12 rounded-xl bg-primary px-6 font-bold text-on-primary disabled:opacity-50"
        >
          ادامه (به‌زودی)
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        حداکثر {maxSeats.toLocaleString('fa-IR')} صندلی در هر سفارش. با دو انگشت یا دکمه‌ها
        بزرگ‌نمایی کنید.
      </p>
    </div>
  );
}
