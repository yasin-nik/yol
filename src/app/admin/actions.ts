'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { login, logout } from '@/server/auth';
import { adminToken, ADMIN_COOKIE, cookieOptions } from '@/server/web-auth';
import { createEvent, createSession, createVenue, setPublished } from '@/server/catalog';
import { DomainError } from '@/server/errors';

export type FormState = { error?: string; success?: string };

function message(error: unknown) {
  if (error instanceof DomainError) return error.message;
  if (error instanceof z.ZodError || error instanceof SyntaxError) return 'اطلاعات فرم کامل یا معتبر نیست؛ مقادیر و قالب بخش‌ها را بررسی کنید.';
  return 'عملیات انجام نشد؛ دوباره تلاش کنید.';
}

export async function loginAction(_previous: FormState, form: FormData): Promise<FormState> {
  try {
    const token = await login({ email: form.get('email'), password: form.get('password') });
    (await cookies()).set(ADMIN_COOKIE, token, cookieOptions);
  } catch (error) {
    return { error: message(error) };
  }
  redirect('/admin');
}

export async function logoutAction() {
  await logout(await adminToken());
  (await cookies()).delete(ADMIN_COOKIE);
  redirect('/admin/login');
}

export async function catalogAction(_previous: FormState, form: FormData): Promise<FormState> {
  try {
    const token = await adminToken();
    const action = form.get('action');
    if (action === 'venue') {
      const sections = String(form.get('sections') ?? '').split('\n').filter((line) => line.trim()).map((line) => {
        const [name, rows, seatsPerRow] = line.split('|').map((value) => value.trim());
        return { name, rows, seatsPerRow };
      });
      await createVenue(token, { name: form.get('name'), city: form.get('city'), address: form.get('address'), sections });
    } else if (action === 'event') {
      await createEvent(token, { title: form.get('title'), description: form.get('description'), category: form.get('category'), maxSeats: form.get('maxSeats'), holdMinutes: form.get('holdMinutes') });
    } else if (action === 'session') {
      const prices = Array.from(form.entries()).filter(([key]) => key.startsWith('price:')).map(([key, value]) => ({ sectionId: key.slice(6), priceRial: value }));
      const localTime = String(form.get('startsAt') ?? '');
      await createSession(token, { eventId: form.get('eventId'), venueId: form.get('venueId'), startsAt: new Date(`${localTime}:00+03:30`).toISOString(), prices });
    } else if (action === 'publish') {
      await setPublished(token, { eventId: form.get('eventId'), published: form.get('published') === 'true' });
    } else {
      throw new DomainError('عملیات ناشناخته است.');
    }
    revalidatePath('/admin');
    revalidatePath('/');
    return { success: 'با موفقیت ثبت شد.' };
  } catch (error) {
    return { error: message(error) };
  }
}
