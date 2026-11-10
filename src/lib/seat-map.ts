export type SeatMapSeat = {
  id: string;
  label: string;
  row: number;
  col: number;
  priceRial: number;
  status: 'AVAILABLE' | 'HELD' | 'SOLD' | 'BLOCKED';
  accessible?: boolean;
};
export type SeatMapRow = { index: number; label: string; seats: SeatMapSeat[] };
export type SeatMapData = { rows: SeatMapRow[]; sectionName: string };

export const W = 44;
export const GAP = 8;

export function seatMapWidth(rows: SeatMapRow[]): number {
  const cols = Math.max(1, ...rows.map((r) => r.seats.length));
  return cols * (W + GAP) + 160;
}

export function seatMapHeight(rows: SeatMapRow[]): number {
  return 60 + rows.length * (W + GAP);
}

export function selectSeat(current: string[], seatId: string, limit: number): string[] {
  if (current.includes(seatId)) return current.filter((id) => id !== seatId);
  if (current.length >= limit) return current;
  return [...current, seatId];
}

export function seatLabel(seat: SeatMapSeat): string {
  return seat.label || `ردیف ${toFa(seat.row)} صندلی ${toFa(seat.col)}`;
}

function toFa(value: number) {
  return String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
