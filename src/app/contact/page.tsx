import { InfoPage } from '@/components/info-page';

export const metadata = { title: 'تماس با ما | یول‌تیک' };

export default function Page() {
  return (
    <InfoPage title="تماس با ما">
      <p className="text-lg font-bold">با یول‌تیک در ارتباط باشید</p>
      <p>
        برای پیگیری خرید، طرح پرسش درباره یک رویداد یا ارائه پیشنهاد و انتقاد، می‌توانید از راه‌های
        زیر با ما تماس بگیرید:
      </p>
      <p>
        تلفن پشتیبانی:{' '}
        <a
          href="tel:09300474378"
          className="inline-flex min-h-11 items-center text-primary underline"
        >
          <bdi dir="ltr">09300474378</bdi>
        </a>{' '}
        -{' '}
        <a
          href="tel:09362130068"
          className="inline-flex min-h-11 items-center text-primary underline"
        >
          <bdi dir="ltr">09362130068</bdi>
        </a>
      </p>
      <h2 className="pt-4 text-lg font-bold">پیگیری خرید بلیت</h2>
      <p>
        برای اینکه بتوانیم درخواست شما را سریع‌تر بررسی کنیم، هنگام تماس این اطلاعات را آماده داشته
        باشید:
      </p>
      <ul className="list-disc space-y-2 ps-6">
        <li>نام رویداد</li>
        <li>شماره موبایلی که با آن خرید کرده‌اید</li>
        <li>شماره سفارش یا اطلاعات پرداخت، در صورت دسترسی</li>
        <li>شرح کوتاهی از مشکل یا درخواست</li>
      </ul>
      <p>
        برای حفظ امنیت، کد ورود، رمز کارت و اطلاعات محرمانه بانکی خود را در اختیار دیگران قرار
        ندهید. پشتیبانی یول‌تیک برای پیگیری خرید به این اطلاعات نیاز ندارد.
      </p>
      <h2 className="pt-4 text-lg font-bold">ارتباط برگزارکنندگان</h2>
      <p>
        اگر برگزارکننده رویداد هستید و تمایل دارید درباره عرضه بلیت رویداد خود در یول‌تیک گفت‌وگو
        کنید، از طریق{' '}
        <a
          href="tel:09171001654"
          className="inline-flex min-h-11 items-center text-primary underline"
        >
          <bdi dir="ltr">09171001654</bdi>
        </a>{' '}
        با ما در ارتباط باشید.
      </p>
    </InfoPage>
  );
}
