# استقرار و بازگشت — بسته M8

## وضعیت واقعی
Build موفق است؛ این نسخه فقط با Fake در محیط محلی اجرا می‌شود. `next start` عمداً با Fake، provider خالی یا نام ساختگی متوقف می‌شود. **این بسته آماده production و فروش واقعی نیست.** M9 در برنامه تعریف نشده؛ کار بعدی آماده‌سازی انتشار و عبور G2/G3 است، با درخواست جداگانه مالک. تعارض ترتیب اتصال واقعی/اولین انتشار در D-040 باز است.

## پیش‌نیازهای انتشار آینده (اکنون اجرا نشده)
1. سرور داخل ایران و حساب‌ها به نام مالک؛ تأیید G2 برای هزینه/حساب. Node طبق `.nvmrc` و PostgreSQL ۱۸؛ نصب پیش‌نیاز یا تغییر سیستم نیازمند مجوز مالک است.
2. دامنه، HTTPS و پراکسی. نمونه `deploy/nginx.conf.example` فقط الگوست؛ DOMAIN و مسیر گواهی جایگزین و `nginx -t` روی سرور اجرا شود. Node فقط loopback:3100؛ PostgreSQL فقط شبکه خصوصی/loopback. پورت DB یا dev server عمومی نشود. هیچ فایل سیستم در این نشست تغییر نکرد.
3. DB/user اختصاصی با پیشوند yoltick_؛ دسترسی حداقلی در زمان اجرا، مالک مهاجرت جدا. dev/test/demo/حساب local_only به تولید منتقل نشوند. نقش اجرای برنامه نباید امکان غیرفعال‌کردن triggerهای ممیزی/مالی داشته باشد.
4. پیاده‌سازی و آزمون adapter واقعی PaymentGateway و SmsProvider با حساب‌های مالک، callback HTTPS و verify سمت سرور؛ سپس به‌روزکردن صریح startup validator. صرفاً عوض‌کردن env، adapter ایجاد نمی‌کند. این کار در M8 انجام نشده است.
5. `.env` خارج Git، دسترسی فقط کاربر سرویس؛ DATABASE_URL واقعی، APP_ORIGIN دقیق HTTPS بدون اسلش آخر، providerهای پیاده‌شده، NODE_ENV=production و REAL_SALES_ENABLED=false. رمز حساب‌های محلی استفاده نشود. G3 و تأیید مالک پیش‌نیاز true کردن پرچم فروش است.
6. عملیات انسانی OWNER-ACTIONS، بازبینی متخصص مستقل امنیت/پرداخت، شرایط واقعی درگاه، دوربین/چاپ/صف ورود و تست بار روی سرور مقصد.

## روش انتشار بعد از رفع پیش‌نیازها
- checkout نسخه برچسب‌خورده در پوشه release تازه؛ `npm ci`، `npm run build`؛ اسرار داخل پوشه پروژه و git-ignored باقی بمانند. تست‌های همان تغییر طبق برنامه QA اجرا شوند.
- فروش/نوشتن را در پنجره نگهداری متوقف و از DB بکاپ بگیرید؛ کپی checksumدار روی محل مستقلِ مورد تأیید مالک. `npm run migrate` افزایشی است؛ هیچ DROP/TRUNCATE اجرا نشود.
- سرویس تحت supervisor با کاربر غیرمدیر و bind روی loopback راه‌اندازی؛ پراکسی به release جدید هدایت شود. هیچ cron/systemd/سرویسی در M8 نصب نشده است.
- زمان‌بندی روی میزبان: `holds:expire` و `payments:reconcile` هر دقیقه با قفل جلوگیری از اجرای هم‌پوشان؛ کد خروج ناموفق هشدار بدهد. بکاپ روزانه و drill ماهانه روی DB جدا. این‌ها دستور عملیات آینده‌اند، زمان‌بندی واقعی نیستند.
- smoke: `/api/health` از خود سرور 200؛ صفحات عمومی، ورود، عدم دسترسی بدون مجوز، کوکی HttpOnly/Secure/SameSite، CSP، callback و خرید/اسکن تست مجاز. شماره/توکن/authority/query callback در access log ذخیره نشود. پراکسی نمونه cache ندارد.
- health با 503، خطای job، خطای HTTP_UNEXPECTED_ERROR/DB_IDLE_CONNECTION_ERROR، فضای دیسک و سن بکاپ پایش و به مسئول تعیین‌شده هشدار داده شود. مانیتور/هشدار واقعی هنوز تنظیم نشده است.

## بازگشت بدون حذف داده
اگر smoke شکست خورد، فروش خاموش بماند و ترافیک به release قبلیِ سازگار با schema برگردد. migration خودکار معکوس، حذف جدول و بازگردانی DB روی DB فعال ممنوع است. وضعیت پرداخت‌های معلق باید reconcile شود؛ پرداخت موفق را با backup قدیمی از بین نبرید.

در خرابی DB: سرویس نوشتن متوقف، archive معتبر با checksum روی DB تازه yoltick_restore_ با pg_restore بازیابی، شمارش/هش جداول و قیود/triggerها مقایسه و پرداخت‌های بعد از زمان بکاپ با درگاه تطبیق داده شود؛ تغییر اتصال و بازگشایی فقط پس از بررسی و تأیید مسئول. DB اصلی برای بررسی حفظ شود. اجرای بازیابی واقعی روی سرور و تعویض اتصال جزو این نشست نیست.

## بکاپ محلی قابل تکرار
`PG_BIN` را به پوشه ابزار موجود PostgreSQL اشاره دهید؛ نصب جهانی نیاز نیست. `npm run backup` از DATABASE_URL بکاپ custom جدید در `.local/backups` می‌گیرد و `.sha256` می‌سازد؛ فایل قبلی را بازنویسی نمی‌کند. خروجی رمز ندارد. `npm run backup:drill` فقط TEST_DATABASE_URL با yoltick_app روی yoltick_test محلی را به DB تازه بازیابی می‌کند؛ CREATEDB فقط برای نقش آزمایش محلی لازم است، نه کاربر runtime تولید. هیچ DB پاک نمی‌شود. archive حاوی داده حساس است؛ در میزبان واقعی باید دسترسی محدود و انتقال رمزگذاری‌شده داشته باشد.

در این نشست بکاپ توسعه و drill آزمایش واقعاً اجرا شدند؛ انتقال خارج ماشین، زمان‌بندی، TLS و nginx روی سرور هنوز آزموده نشده‌اند. RPO پیشنهادی تا ۲۴ ساعت با بکاپ روزانه است؛ RTO سرور هنوز سنجیده نشده، زمان drill محلی تضمین آن نیست.

مراجع فنی: مستندات رسمی Next.js /docs/app/guides/content-security-policy، PostgreSQL 18 /docs/18/app-pgdump.html و /app-pgrestore.html، Nginx /en/docs/http/ngx_http_proxy_module.html. نسخه نمونه باید روی میزبان آینده اعتبارسنجی شود.

## Public no-sales preview

For the current licensing and presentation phase, deploy with a separate server `.env` (never commit it):

```env
NODE_ENV=production
PAYMENT_GATEWAY=disabled
SMS_PROVIDER=disabled
REAL_SALES_ENABLED=false
APP_ORIGIN=https://YOUR_DOMAIN
```

Run `npm ci`, `npm run build`, then `npm run start:public-preview`. Keep the app on `127.0.0.1:3100` behind Nginx and HTTPS. `/api/health` must return `200` from the server. Public pages are available; customer OTP, checkout, and payment intentionally return `503` until real adapters and G3 approval are complete.
