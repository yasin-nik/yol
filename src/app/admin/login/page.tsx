import { PageShell } from '@/components/shell';
import { LoginForm } from '@/components/admin-forms';

export default function AdminLoginPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-2xl font-extrabold">ورود مدیر</h1>
        <p className="mb-6 text-sm text-muted">
          برای مدیریت سالن‌ها، رویدادها و سانس‌ها وارد شوید.
        </p>
        <LoginForm />
      </div>
    </PageShell>
  );
}
