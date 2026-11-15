// The site's public address, used in QR codes and secure cookies.
// PUBLIC_BASE_URL wins (set it to your domain); on Vercel we fall back to the project's own address.
export function publicBaseUrl() {
  const set = (process.env.PUBLIC_BASE_URL || '').trim();
  if (set) return set.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3001}`;
}
export const onVercel = () => !!process.env.VERCEL;
