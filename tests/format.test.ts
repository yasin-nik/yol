import { describe, expect, it } from 'vitest';
import { formatToman, rialToToman, toFaDigits } from '../src/lib/format';

describe('INV-14 money and formatting', () => {
  it('INV-14 converts integer rial to toman without floats', () => {
    expect(rialToToman(3500000)).toBe(350000);
    expect(() => rialToToman(10.5)).toThrow();
  });
  it('INV-14 shows toman with Persian digits', () => {
    expect(formatToman(3500000)).toBe('۳۵۰,۰۰۰ تومان');
    expect(toFaDigits('12:30')).toBe('۱۲:۳۰');
  });
});
