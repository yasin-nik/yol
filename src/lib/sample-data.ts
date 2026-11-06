export const SAMPLE_NOTICE = 'داده نمونه — نمایشی است و رویداد واقعی نیست';

export type SampleEvent = {
  id: string;
  title: string;
  category: string;
  city: string;
  venue: string;
  startsAtUtc: string;
  minPriceRial: number;
  status: 'ON_SALE' | 'SOLD_OUT' | 'UPCOMING';
  description: string;
};

export const SAMPLE_EVENTS: SampleEvent[] = [
  {
    id: 'sample-1',
    title: 'کنسرت نمونه: شب موسیقی سنتی',
    category: 'کنسرت',
    city: 'تهران',
    venue: 'تالار نمونه ۱',
    startsAtUtc: '2026-12-18T15:30:00Z',
    minPriceRial: 3500000,
    status: 'ON_SALE',
    description: 'متن توضیح نمونه برای نمایش چیدمان صفحه رویداد.',
  },
  {
    id: 'sample-2',
    title: 'تئاتر نمونه: روایت یک شب',
    category: 'تئاتر',
    city: 'شیراز',
    venue: 'سالن نمونه ۲',
    startsAtUtc: '2026-12-25T14:00:00Z',
    minPriceRial: 2000000,
    status: 'SOLD_OUT',
    description: 'متن توضیح نمونه برای رویداد تمام‌شده.',
  },
  {
    id: 'sample-3',
    title: 'استندآپ نمونه: خنده در شب',
    category: 'استندآپ',
    city: 'اصفهان',
    venue: 'سالن نمونه ۳',
    startsAtUtc: '2027-01-08T16:00:00Z',
    minPriceRial: 1500000,
    status: 'UPCOMING',
    description: 'متن توضیح نمونه برای رویداد در آستانه فروش.',
  },
];

export function findSampleEvent(id: string): SampleEvent | undefined {
  return SAMPLE_EVENTS.find((event) => event.id === id);
}
