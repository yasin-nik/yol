'use client';
import { StateBox } from '@/components/ui';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md p-6">
      <StateBox kind="error" title="مشکلی پیش آمد">
        <button
          type="button"
          onClick={reset}
          className="mt-2 min-h-11 rounded-lg border border-line px-4"
        >
          تلاش دوباره
        </button>
      </StateBox>
    </div>
  );
}
