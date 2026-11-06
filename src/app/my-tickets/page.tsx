import { PageShell } from '@/components/shell';
import { StateBox } from '@/components/ui';

export default function MyTicketsPage() {
  return (
    <PageShell>
      <h1 className="mb-4 text-2xl font-extrabold">بلیت‌های من</h1>
      <StateBox kind="empty" title="هنوز بلیتی ندارید">
        بعد از خرید، بلیت‌ها با ورود با شماره موبایل اینجا نمایش داده می‌شوند.
      </StateBox>
    </PageShell>
  );
}
