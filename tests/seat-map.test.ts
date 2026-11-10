import { describe, expect, it } from 'vitest';
import { seatMapWidth, selectSeat } from '../src/lib/seat-map';
import { buildSampleSeatMap } from '../src/lib/sample-seat-map';

describe('seat map selection rules', () => {
  it('selects and deselects a seat', () => {
    expect(selectSeat([], 'a', 6)).toEqual(['a']);
    expect(selectSeat(['a', 'b'], 'a', 6)).toEqual(['b']);
  });
  it('D-004 caps selection at the configured limit', () => {
    expect(selectSeat(['a', 'b', 'c', 'd', 'e', 'f'], 'g', 6)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });
  it('preserves the existing M1 sample map with 60 seats', () => {
    const data = buildSampleSeatMap();
    expect(seatMapWidth(data.rows)).toBeGreaterThan(0);
    expect(data.rows.flatMap((r) => r.seats)).toHaveLength(60);
  });
  it('keeps physical targets at least 44px for a 1000-seat venue', () => {
    const rows = Array.from({ length: 20 }, (_, rowIndex) => ({
      index: rowIndex + 1,
      label: String(rowIndex + 1),
      seats: Array.from({ length: 50 }, (_, colIndex) => ({
        id: `${rowIndex}-${colIndex}`,
        label: 'صندلی',
        row: rowIndex + 1,
        col: colIndex + 1,
        priceRial: 1000,
        status: 'AVAILABLE' as const,
      })),
    }));
    expect(rows.flatMap((row) => row.seats)).toHaveLength(1000);
    expect(seatMapWidth(rows)).toBe(2760);
  });
});
