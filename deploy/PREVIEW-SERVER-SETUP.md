# ادامه راه‌اندازی نسخه معرفی — ۲۰۲۶/۱۱/۱۶

این بسته آماده بررسی است و هنوز روی سرور اعمال نشده است. فروش و پیامک خاموش می‌مانند.
ایجاد کاربر/دسترسی سرور، انتقال فایل و نصب سرویس فقط پس از تأیید مالک انجام می‌شود.
انتشار عمومی، DNS، تنظیم Nginx و HTTPS در این مرحله انجام نمی‌شود.

## وضعیت مشاهده‌شده در کنسول پارس‌پک

- مسیر `/opt/yoltick`، Node `v24.19.0` در `/usr/bin/node`؛ خروجی build قبلی موفق روی صفحه دیده شد، build در این نوبت دوباره اجرا نشد.
- PostgreSQL و Nginx فعال؛ PostgreSQL فقط `127.0.0.1:5432`؛ شنونده‌ای روی ۳۱۰۰ نبود.
- نقش و دیتابیس `yoltick_app` موجود؛ نقش superuser/CREATEDB نیست؛ تعداد جدول‌های public صفر.
- `.env` موجود نیست؛ هیچ واحد systemd با نام `yoltick*` وجود ندارد.
- کاربر موجود `yoltick` عضو sudo است؛ کاربر پیشنهادی `yoltick_web` موجود نیست.
- قوانین local پایگاه داده از peer استفاده می‌کنند؛ تغییر pg_hba یا ذخیره رمز لازم نیست.

## فایل‌های آماده

- `preview.env.example`: تنظیمات نسخه معرفی، اتصال Unix socket با peer و دامنه `yoltic.ir`؛ فایل واقعی فقط روی سرور ساخته می‌شود.
- `preview-runtime.sql`: نقش مستقل runtime، فاقد مالکیت جدول یا امکان مدیریت DB؛ جدول migration و Fake دسترسی نمی‌گیرند.
- `yoltick-preview.service`: کاربر غیرمدیر، bind روی loopback، دسترسی نوشتن فقط به cache برنامه و پوشه موقت خصوصی.

## ترتیب اجرا پس از تأیید

۱. پیش‌نیازها دوباره بررسی شوند؛ اگر `.env`، نقش/کاربر `yoltick_web`، جدول یا سرویس تازه‌ای دیده شد، وضعیت موجود بررسی شود و چیزی بازنویسی نشود. از DB قبل از migration بکاپ custom گرفته و checksum ثبت شود؛ فایل محدود به postgres و داخل `/opt/yoltick/.local/backups` بماند. این بکاپ جایگزین بکاپ مستقل نیست.

۲. migration با نقش مالک موجود اجرا شود، بدون رمز و بدون تغییر نقش postgres:

```sh
cd /opt/yoltick
runuser -u postgres -- env DATABASE_URL='postgresql:///yoltick_app?host=/var/run/postgresql' PGOPTIONS='-c role=yoltick_app' /usr/bin/node node_modules/tsx/dist/cli.mjs scripts/migrate.ts
```

۳. چهار فایل این بسته به `/opt/yoltick/deploy` منتقل شوند؛ SQL با `psql -X -v ON_ERROR_STOP=1 -d yoltick_app` تحت کاربر postgres اجرا شود. نقش runtime باید فقط به همین DB و جدول‌های متعلق به `yoltick_app` دسترسی داشته باشد. کاربر سیستم `yoltick_web` با `--system --user-group --no-create-home --shell /usr/sbin/nologin` ایجاد شود؛ عضو sudo نباشد.

۴. فایل `.env` از نمونه با مالکیت `root:yoltick_web` و سطح ۰۶۴۰ ساخته شود. source، migration و build در مالکیت مدیر بمانند. فقط `.next/cache` متعلق به کاربر سرویس شود. با `runuser -u yoltick_web` اتصال peer و `SELECT current_user` بررسی شود؛ مالکیت جدول‌ها و نداشتن مجوز CREATE/TRUNCATE و دسترسی به schema_migrations کنترل شود.

۵. فایل سرویس به `/etc/systemd/system/yoltick-preview.service` منتقل و با `systemd-analyze verify` بررسی شود؛ سپس daemon-reload و enable/start. هیچ پورت عمومی یا تنظیم امنیتی موجود تغییر نکند.

۶. واقعاً آزمایش شود: migration مجدد باید up to date باشد؛ سرویس فعال و شنونده فقط `127.0.0.1:3100`؛ health و صفحه اصلی ۲۰۰ با CSP؛ درخواست OTP و پرداخت ۵۰۳؛ restart سرویس و پاسخ مجدد؛ نقش runtime اجازه تغییر ساختار و غیرفعال‌کردن triggerها نداشته باشد. خروجی‌ها بدون secret در گزارش ثبت شوند.

اگر آزمون شکست خورد، سرویس متوقف و عیب بررسی شود؛ DB، کاربر، فایل و migration حذف یا معکوس نشوند. فایل `.env` و لاگ کامل در مخزن ثبت نشوند.

## تأیید موردنیاز

فقط انتقال همین فایل‌ها، بکاپ و migration دیتابیس اختصاصی، ایجاد حساب محدود و نصب/اجرای سرویس محلی. انتشار عمومی، تغییر DNS/فایروال، حساب مدیر سایت و فروش واقعی شامل این تأیید نیستند. کنترل‌کننده Chrome برای ایجاد دسترسی حساس، تأیید هنگام اقدام می‌خواهد؛ AGENTS.md نیز این کار را L2 می‌داند.

## اعتبارسنجی این نوبت

بررسی سرور فقط خواندنی بود. فایل‌ها با کد اتصال pg، migrationها، گاردهای production و نسخه/مسیر واقعی Node تطبیق داده شدند. نمونه env واقعاً با گارد production و parser اتصال pg آزمایش شد: adapterهای disabled، فروش خاموش، مسیر socket، نام DB و کاربر صحیح بودند. `git diff --check` هم موفق بود. SQL، نصب سرویس و smoke سرور هنوز اجرا نشده‌اند؛ آزمایش موفق برای آن‌ها ادعا نمی‌شود.
