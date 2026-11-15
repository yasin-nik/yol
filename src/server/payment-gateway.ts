import { z } from 'zod';
import { getPool } from './db/pool';
import { newToken } from './security';
import { DomainError } from './errors';

export const authoritySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);

export const verificationSchema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('VERIFIED'),
      amountRial: z.number().int().nonnegative().max(180000000000000),
      reference: z.string().min(1).max(200),
    })
    .strict(),
  z.object({ state: z.enum(['PENDING', 'UNKNOWN', 'FAILED']) }).strict(),
]);
export type Verification = z.infer<typeof verificationSchema>;
export interface PaymentGateway {
  create(input: {
    requestKey: string;
    amountRial: number;
    expiresAt: Date;
  }): Promise<{ authority: string }>;
  verify(authority: string): Promise<Verification>;
  checkoutUrl(authority: string): string;
}

/** Public preview adapter: the site is reachable, but checkout is disabled. */
export class DisabledPaymentGateway implements PaymentGateway {
  private unavailable(): never {
    throw new DomainError('فروش و پرداخت در این نسخه فعال نیست.', 503);
  }
  create() {
    return Promise.reject(this.unavailable());
  }
  verify() {
    return Promise.reject(this.unavailable());
  }
  checkoutUrl(): string {
    return this.unavailable();
  }
}

export class FakePaymentGateway implements PaymentGateway {
  checkoutUrl(authority: string) {
    return '/payments/fake/' + authoritySchema.parse(authority);
  }
  constructor() {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Fake payment forbidden in production');
  }
  async create(input: { requestKey: string; amountRial: number; expiresAt: Date }) {
    const result = await getPool().query(
      `INSERT INTO fake_gateway_transactions(request_key,authority,amount_rial,reference,expires_at)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT(request_key) DO UPDATE SET request_key=EXCLUDED.request_key RETURNING authority,amount_rial`,
      [input.requestKey, newToken(), input.amountRial, 'FAKE-' + newToken(), input.expiresAt],
    );
    if (Number(result.rows[0].amount_rial) !== input.amountRial)
      throw new Error('Fake request amount mismatch');
    return { authority: result.rows[0].authority as string };
  }
  async verify(authority: string): Promise<Verification> {
    const result = await getPool().query(
      'SELECT * FROM fake_gateway_transactions WHERE authority=$1',
      [authority],
    );
    const item = result.rows[0];
    if (!item) return { state: 'UNKNOWN' };
    if (item.outcome === 'SUCCESS')
      return { state: 'VERIFIED', amountRial: Number(item.amount_rial), reference: item.reference };
    if (item.outcome === 'PENDING' && item.expires_at <= new Date()) return { state: 'FAILED' };
    return { state: item.outcome };
  }
  async setOutcome(authority: string, outcome: 'SUCCESS' | 'FAILED' | 'UNKNOWN') {
    // Only the labelled local simulator calls this; callbacks cannot supply payment status.
    await getPool().query(
      "UPDATE fake_gateway_transactions SET outcome=$2 WHERE authority=$1 AND outcome <> 'SUCCESS'",
      [authority, outcome],
    );
  }
}
export function paymentGateway(): PaymentGateway {
  if (process.env.PAYMENT_GATEWAY === 'disabled') return new DisabledPaymentGateway();
  if (process.env.PAYMENT_GATEWAY !== 'fake')
    throw new DomainError('درگاه پرداخت پیکربندی نشده است.', 503);
  return new FakePaymentGateway();
}
