'use server';

import { revalidatePath } from 'next/cache';
import { adminToken } from '@/server/web-auth';
import { setSeatBlocked } from '@/server/inventory';
import { DomainError } from '@/server/errors';
import type { FormState } from '../../actions';

export async function blockAction(_previous: FormState, form: FormData): Promise<FormState> {
  try {
    await setSeatBlocked(await adminToken(), {
      sessionId: form.get('sessionId'),
      seatId: form.get('seatId'),
      blocked: form.get('blocked') === 'true',
    });
    revalidatePath('/admin');
    return { success: 'وضعیت صندلی ثبت شد.' };
  } catch (error) {
    return {
      error: error instanceof DomainError ? error.message : 'اطلاعات معتبر نیست یا ثبت انجام نشد.',
    };
  }
}
