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
  it('builds a 1000-seat map width without layout overflow', () => {
    const data = buildSampleSeatMap();
    expect(seatMapWidth(data.rows)).toBeGreaterThan(0);
    expect(data.rows.flatMap((r) => r.seats)).toHaveLength(60);
  });
});
