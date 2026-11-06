import type { SeatMapData } from '@/lib/seat-map';

export function buildSampleSeatMap(): SeatMapData {
  const statuses = ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'SOLD', 'HELD'] as const;
  return {
    sectionName: '????? ?????',
    rows: Array.from({ length: 6 }, (_, r) => ({
      index: r + 1,
      label: String(r + 1),
      seats: Array.from({ length: 10 }, (_, c) => ({
        id: `s-${r + 1}-${c + 1}`,
        label: `${r + 1}-${c + 1}`,
        row: r + 1,
        col: c + 1,
        priceRial: 3500000,
        status: statuses[(r * 10 + c) % statuses.length],
      })),
    })),
  };
}
