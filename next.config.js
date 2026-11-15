/** @type {import('next').NextConfig} */
module.exports = (phase) => {
  if (
    phase === 'phase-production-server' &&
    (!process.env.PAYMENT_GATEWAY || !process.env.SMS_PROVIDER)
  ) {
    throw new Error('Production payment and SMS adapters must be explicitly configured.');
  }
  if (phase === 'phase-production-server') {
    const origin = new URL(process.env.APP_ORIGIN || 'http://invalid');
    if (origin.protocol !== 'https:' || origin.origin !== process.env.APP_ORIGIN)
      throw new Error('Production APP_ORIGIN must be a canonical HTTPS origin');
    if (process.env.REAL_SALES_ENABLED === 'true')
      throw new Error('Real sales are blocked until verified payment and SMS adapters are installed.');
    const previewAdapters = [process.env.PAYMENT_GATEWAY, process.env.SMS_PROVIDER];
    if (previewAdapters.some((adapter) => adapter !== 'disabled'))
      throw new Error('Public preview requires PAYMENT_GATEWAY=disabled and SMS_PROVIDER=disabled.');
  }
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    distDir: process.env.NEXT_DIST_DIR || '.next',
  };
};
