'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminToken } from '@/server/web-auth';
import {
  configureTerms,
  recordSettlement,
  reverseSettlement,
  requestRefund,
  completeRefund,
  supportNote,
  resolveSupport,
} from '@/server/finance';
import { DomainError } from '@/server/errors';
import type { FormState } from '../actions';

function percent(value: FormDataEntryValue | null) {
  const entry = z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/)
    .parse(value);
  const [whole, fraction = ''] = entry.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export async function financeAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const token = await adminToken();
    const action = form.get('operation');
    if (action === 'terms')
      await configureTerms(token, {
        eventId: form.get('eventId'),
        commissionBps: percent(form.get('commissionPercent')),
        fixedRial: form.get('fixedRial'),
        taxBps: percent(form.get('taxPercent')),
        deductionRial: form.get('deductionRial'),
      });
    else if (action === 'settlement')
      await recordSettlement(token, {
        id: form.get('id'),
        eventId: form.get('eventId'),
        amountRial: form.get('amountRial'),
        reference: form.get('reference'),
        recipient: form.get('recipient'),
        note: form.get('note'),
        performed: form.get('performed') === 'on',
      });
    else if (action === 'reverse')
      await reverseSettlement(token, {
        settlementId: form.get('settlementId'),
        reason: form.get('reason'),
      });
    else if (action === 'refund')
      await requestRefund(token, { orderId: form.get('orderId'), reason: form.get('reason') });
    else if (action === 'complete')
      await completeRefund(token, {
        refundId: form.get('refundId'),
        reference: form.get('reference'),
        performed: form.get('performed') === 'on',
      });
    else if (action === 'support')
      await supportNote(token, { orderId: form.get('orderId'), message: form.get('message') });
    else if (action === 'resolve')
      await resolveSupport(token, {
        requestId: form.get('requestId'),
        response: form.get('response'),
      });
    else throw new DomainError('عملیات نامعتبر است.');
    revalidatePath('/admin/finance');
    revalidatePath('/admin');
    revalidatePath('/my-tickets');
    revalidatePath('/check-in');
    return { success: 'ثبت شد؛ گزارش به‌روز است.' };
  } catch (event) {
    return {
      error:
        event instanceof DomainError
          ? event.message
          : event instanceof z.ZodError
            ? 'مقادیر فرم معتبر نیست؛ مبالغ صحیح ریال و درصد تا دو رقم اعشار وارد کنید.'
            : 'ثبت انجام نشد؛ اطلاعات و یکتایی مرجع را بررسی کنید.',
    };
  }
}
