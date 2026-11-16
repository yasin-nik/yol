# گزارش اجرای داخلی نسخه معرفی — ۲۰۲۶/۱۱/۱۶

بسته اصلی با تأیید مالک (D-048) روی سرور پارس‌پک اجرا شد. فروش و پیامک خاموش‌اند. بکاپ طبق دستور صریح مالک انجام نشد؛ سرور بکاپ مستقل بعداً آماده می‌شود. انتشار عمومی، DNS و HTTPS انجام نشده‌اند.

## وضعیت نهایی و آزمون‌های واقعی

- مسیر `/opt/yoltick`؛ Node `24.19.0` در `/usr/bin/node`، PostgreSQL 18. نصب وابستگی‌ها و build در مرحله قبلی موفق بود؛ این نوبت build تکرار نشد.
- migrationهای `0001` تا `0009` اجرا شدند؛ اجرای مجدد `up to date` بود. هر ۳۱ جدول public متعلق به `yoltick_app` است.
- حساب سیستم `yoltick_web` با shell برابر nologin، بدون sudo؛ نقش DB با همین نام بدون superuser/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS و بدون رمز ساخته شد. اتصال Unix socket با peer و `current_user=yoltick_web` موفق بود؛ pg_hba تغییر نکرد.
- runtime مالک جدول نیست. بررسی واقعی مجوز CREATE در public، SELECT در schema_migrations و TRUNCATE در users همگی false بود. SQL مالکیت یا عضویت در نقش مالک نمی‌دهد و Fake table را مستثنا می‌کند.
- `.env` با `root:yoltick_web` و `0640` نصب شد؛ فقط `.next/cache` به مالکیت runtime درآمد. فایل secret در مخزن ثبت نشده است.
- واحد `yoltick-preview.service` نصب و `active`/`enabled` شد؛ شنونده فقط `127.0.0.1:3100` است. دسترسی نوشتن سرویس به cache و پوشه موقت خصوصی محدود است.
- `/api/health` برابر ۲۰۰ با `status:ok`، صفحه اصلی ۲۰۰، CSP و هدرهای امنیتی در پاسخ موجود بودند. POST معتبر با Origin دامنه به `/api/customer` و `/api/payments` هر دو ۵۰۳ دادند؛ پیامک یا پرداخت واقعی انجام نشد.
- restart سرویس موفق و health پس از آن دوباره ۲۰۰ بود. این restart آزمون reboot کامل سرور نیست.
- `systemd-analyze verify` خطایی برای واحد برنامه نداد؛ دو هشدار مربوط به گزینه قدیمی CPUAccounting در واحد موجود `systemd-fsck-root.service` و نادیده‌گرفتن آن نمایش داده شد؛ واحد سیستم تغییر نکرد.

## تطبیق فایل‌ها

انتقال بلند در VNC ناقص می‌شد؛ فایل‌های ناقص SQL اجرا نشدند. نسخه فشرده به بخش‌های کوچک منتقل و پس از بازسازی، SHA-256 سرور دقیقاً با نسخه محلی یکسان شد:

| فایل محلی | SHA-256 |
| --- | --- |
| `preview-runtime.sql` | `0bcf8c9700eaae3b81bdbab43a50f0140f46a0f4876db06860bbc667ec17bd6e` |
| `preview.env.example` | `6ae88caf43c855bcc6612b456760643c177e5653a58862eed0e17f9b2e17e6c7` |
| `yoltick-preview.service` | `5e6a97e68af99949dd325933592160c3d01308ae67da19050e4618a409458c4b` |

نسخه SQL تأییدشده روی سرور `deploy/runtime.sql` است. فایل‌های واسط انتقال در `deploy/` سرور حفظ شدند؛ ورودی سرویس فقط `.env` و واحد نصب‌شده است.

## عملیات قابل تکرار

```sh
cd /opt/yoltick
# migration با مالک اختصاصی؛ بدون تغییر نقش postgres
runuser -u postgres -- env DATABASE_URL='postgresql:///yoltick_app?host=/var/run/postgresql' PGOPTIONS='-c role=yoltick_app' /usr/bin/node node_modules/tsx/dist/cli.mjs scripts/migrate.ts
systemctl is-active yoltick-preview
curl -sS http://127.0.0.1:3100/api/health
```

SQL ایجاد نقش دوباره اجرا نشود؛ CREATE ROLE عمداً در صورت وجود نقش خطا می‌دهد. هنگام migration بعدی دسترسی جدول‌های تازه باید جداگانه بازبینی شود؛ default grant عمومی وجود ندارد.

## باقی‌مانده

DNS، Nginx/HTTPS و انتشار عمومی نیازمند مرحله و تأیید خود هستند. بکاپ مستقل، هشدار و آزمون بار روی سرور هنوز انجام نشده‌اند. فروش واقعی و حساب‌های واقعی پرداخت/پیامک همچنان خارج از این اجرای داخلی‌اند. آزمون‌های کامل برنامه در این نوبت تکرار نشدند؛ تغییر کد کاربردی نداشتیم.
