import { DomainError } from './errors';

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<{ developmentCode?: string }>;
}
export class FakeSmsProvider implements SmsProvider {
  constructor() {
    if (process.env.NODE_ENV === 'production') throw new Error('Fake SMS forbidden in production');
  }
  async sendOtp(_phone: string, code: string) {
    return { developmentCode: code };
  }
}
export function smsProvider(): SmsProvider {
  if (process.env.SMS_PROVIDER !== 'fake')
    throw new DomainError('سرویس پیامک پیکربندی نشده است.', 503);
  return new FakeSmsProvider();
}
