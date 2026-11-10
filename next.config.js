/** @type {import('next').NextConfig} */
module.exports = (phase) => {
  if (
    phase === 'phase-production-server' &&
    [process.env.PAYMENT_GATEWAY, process.env.SMS_PROVIDER].includes('fake')
  ) {
    throw new Error(
      'Fake payment/SMS adapters cannot start in production. Use development for local previews.',
    );
  }
  return { reactStrictMode: true, distDir: process.env.NEXT_DIST_DIR || '.next' };
};
