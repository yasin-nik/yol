const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toFaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}

export function rialToToman(rial: number): number {
  if (!Number.isInteger(rial)) throw new Error('rial must be an integer');
  return Math.floor(rial / 10);
}

export function formatToman(rial: number): string {
  const toman = rialToToman(rial);
  return `${toFaDigits(toman.toLocaleString('en-US'))} تومان`;
}

export function formatJalaliDate(isoUtc: string): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'full',
    timeZone: 'Asia/Tehran',
  }).format(new Date(isoUtc));
}

export function formatJalaliTime(isoUtc: string): string {
  return new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tehran',
  }).format(new Date(isoUtc));
}
