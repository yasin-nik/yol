# یول‌تیک (Yoltic) — پلتفرم فروش بلیت رویداد

**وضعیت:** M0 تا M8 از نظر ساخت و QA محلی تکمیل‌اند؛ توقف در تگ m8. حالت انتشار عمومیِ بدون فروش آماده است؛ فروش واقعی و اتصال درگاه/پیامک واقعی هنوز فعال نیست. مستندات: `AGENTS.md` · `docs/HANDOFF.md` · `docs/QA-M8.md` · `docs/DEPLOYMENT.md`.

## اجرا از محیط تمیز
1. Node.js 24.19.0 و PostgreSQL ۱۸ نصب باشد.
2. `npm install`
3. `copy .env.example .env` و مقدارها را پر کنید.
4. دیتابیس محلی پروژه (داخل `.local/`، پورت ۵۴۳۳): ساخت یک‌باره با `initdb`، سپس `powershell scripts/db-start.ps1`. کاربر/دیتابیس‌ها: `yoltick_app` / `yoltick_dev` / `yoltick_test`.
5. `npm.cmd run migrate` · `npm.cmd run dev -- --hostname 127.0.0.1 -p 3100`

## دستورها
`npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run payments:reconcile`

عملیات M8: `npm run backup`، `npm run backup:drill` (نیازمند PG_BIN ابزار موجود PostgreSQL؛ بدون نصب global). تست فقط M8 پس از build: `npm.cmd test -- tests/m8-load.test.ts tests/m8-backup.test.ts tests/m8-security.test.ts tests/m8-catalog.test.ts`. اجرای HTTP اختصاصی روی localhost:3108 با دیتابیس yoltick_test در HANDOFF توضیح داده شده است.

## مدیریت محلی
- نشانی `/admin`؛ بدون ورود به `/admin/login` هدایت می‌شود.
- ساخت اولین مدیر: `ADMIN_EMAIL` و `ADMIN_PASSWORD` (حداقل ۱۲ نویسه) را موقتاً در `.env` قرار دهید؛ `npm.cmd run admin:create`؛ سپس رمز را از `.env` بردارید. رمز در خروجی نوشته نمی‌شود.
- داده نمایشی اختیاری، فقط development: `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/seed-demo.ts`. اطلاعات ورود تولیدشده فقط داخل `.local/demo-access.json` است و وارد Git نمی‌شود.
- پنل: سالن/شهر و بخش‌ها → رویداد → سانس و قیمت ریالی هر بخش → انتشار. تاریخ ورودی با تقویم مرورگر میلادی و ساعت تهران است؛ نمایش تاریخ شمسی است.
- تست‌ها فقط `yoltick_test` محلی را می‌پذیرند؛ دیتابیس توسعه یا سوابق قبلی را حذف نمی‌کنند.

## رزرو و پیش‌نمایش
- از صفحه رویداد منتشرشده، سانس و صندلی را انتخاب کنید. رزرو در DB ثبت می‌شود؛ بازپخش همان درخواست زمان را تمدید نمی‌کند. تازه‌سازی صفحه رزرو همان مرورگر را بازیابی می‌کند.
- انقضا هنگام خواندن/تغییر موجودی اجرا می‌شود. `npm.cmd run holds:expire` برای پاک‌سازی رزروهای منقضی نیز آماده است؛ روی محیط عملیاتی باید دوره‌ای اجرا شود. وضعیت پرداخت در انتظار/نامشخص آزاد نمی‌شود.
- ورود با موبایل و OTP آزمایشی، ثبت سفارش، درگاه Fake، استعلام پرداخت و بلیت QR خصوصی/چاپ فعال‌اند. کد توسعه در فرم با برچسب آزمایشی نمایش داده می‌شود؛ پیامک یا پول واقعی در کار نیست.
- `npm.cmd run build` قابل اجرا است. برای انتشار عمومی بدون فروش، در `.env` مقدارهای `NODE_ENV=production`، `PAYMENT_GATEWAY=disabled`، `SMS_PROVIDER=disabled`، `REAL_SALES_ENABLED=false` و `APP_ORIGIN=https://دامنه` را تنظیم کنید و سپس `npm.cmd run start:public-preview` را پشت Nginx اجرا کنید. هر مسیر پرداخت/OTP در این حالت عمداً غیرفعال است.
- پیش‌نمایش جدا از build در PowerShell: `$env:NEXT_DIST_DIR='.next-review'` سپس `npm.cmd run dev -- --hostname 127.0.0.1 -p 3100`.

## پرداخت محلی
«بلیت‌های من» سفارش همان حساب را نشان می‌دهد. درگاه آزمایشی نتیجه موفق/ناموفق/نامشخص را شبیه‌سازی می‌کند؛ نتیجه فقط با verify سرور پذیرفته می‌شود. پرداخت نامشخص با استعلام دوباره یا `npm.cmd run payments:reconcile` بررسی می‌شود. پرداخت تأییدشده با صندلی غیرقابل تخصیص، نیازمند رسیدگی مدیر است و بلیت ندارد.

## کنترل ورود و مالی
- `/check-in`: انتخاب سانس، خواندن QR با دوربین یا اسکنر/کد دستی و ثبت ورود آنلاین. `/admin/operators`: حساب مسئول با رمز حداقل ۱۲ نویسه و دسترسی همان سانس؛ از `/admin/login` وارد می‌شود.
- `/admin/finance`: تنظیم نسخه محاسبات، گزارش و CSV، ثبت تسویه پس از برگزاری، ثبت معکوس، استرداد کل سفارش و پیگیری پشتیبانی. این ابزارها پول منتقل نمی‌کنند؛ نرخ‌ها و مراجع را مدیر وارد می‌کند. درخواست استرداد QR را نامعتبر می‌کند و صندلی را آزاد نمی‌کند.
- برای بررسی همین مراحل: `npm.cmd test -- tests/check-in.test.ts tests/finance.test.ts`؛ تست‌های قبلی در نشست M6/M7 دوباره اجرا نشدند.
- حساب محلی مالک با `LOCAL_ADMIN_EMAIL` و `LOCAL_ADMIN_PASSWORD` در `.env` و فرمان `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/local-admin.ts` آماده می‌شود. فقط yoltick_dev محلی را می‌پذیرد؛ این حساب در production با نشست قبلی هم رد می‌شود. رمز را در مخزن قرار ندهید.
