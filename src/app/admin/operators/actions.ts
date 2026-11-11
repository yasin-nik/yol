'use server';
import { createOperator } from '@/server/check-in';
import { adminToken } from '@/server/web-auth';
import type { FormState } from '../actions';
import { DomainError } from '@/server/errors';
export async function operatorAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await createOperator(await adminToken(), {
      email: form.get('email'),
      password: form.get('password'),
      sessionId: form.get('sessionId'),
    });
    return { success: 'حساب مسئول ورود برای همین سانس ساخته شد.' };
  } catch (event) {
    return {
      error:
        event instanceof DomainError
          ? event.message
          : 'ثبت انجام نشد؛ ایمیل یکتا، رمز حداقل ۱۲ نویسه و سانس معتبر لازم است.',
    };
  }
}
