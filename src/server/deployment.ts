import { DomainError } from './errors';

export function requireSalesEnabled() {
  if (process.env.NODE_ENV === 'production' && process.env.REAL_SALES_ENABLED !== 'true')
    throw new DomainError('فروش هنوز فعال نشده است.', 503);
}
