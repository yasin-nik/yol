import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { DomainError } from './errors';

export const ADMIN_COOKIE = 'yoltick_admin';
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 8 * 60 * 60,
};

export async function adminToken() {
  return (await cookies()).get(ADMIN_COOKIE)?.value;
}

export async function requireAdminPage() {
  const token = await adminToken();
  try {
    await requireAdmin(token);
  } catch (error) {
    if (error instanceof DomainError) redirect('/admin/login');
    throw error;
  }
  return token;
}
