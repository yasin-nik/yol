/** @type {import('next').NextConfig} */
module.exports = (phase) => {
  if (
    phase === 'phase-production-server' &&
    (!process.env.PAYMENT_GATEWAY ||
      !process.env.SMS_PROVIDER ||
      [process.env.PAYMENT_GATEWAY, process.env.SMS_PROVIDER].includes('fake'))
  ) {
    throw new Error(
      'Fake payment/SMS adapters cannot start in production. Use development for local previews.',
    );
  }
  if (phase === 'phase-production-server') {
    const origin = new URL(process.env.APP_ORIGIN || 'http://invalid');
    if (origin.protocol !== 'https:' || origin.origin !== process.env.APP_ORIGIN)
      throw new Error('Production APP_ORIGIN must be a canonical HTTPS origin');
    // No real adapters exist in this release: reject invented names at startup too.
    throw new Error('Production payment/SMS adapters are not implemented in this release');
  }
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    distDir: process.env.NEXT_DIST_DIR || '.next',
  };
};
