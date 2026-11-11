# TEST-AND-SECURITY

## جمع‌بندی نهایی M8
گزارش جدیدتر `QA-M8.md` معتبر است؛ آمار زیر سوابق همان مراحل‌اند. فقط ۱۰ تست اختصاصی M8 در چهار فایل m8-*.test.ts اجرا شد و همگی موفق بودند؛ مجموعه مراحل قبل طبق دستور مالک دوباره اجرا نشد. بار خرید ۱۰۰۰/۵۰، HTTP ۵۰ خواندن نقشه، INV-12 با dump/restore واقعی، CSP/مبدأ/حجم/گارد تولید/secret، فیلترهای محصول، build/typecheck/lint و audit انجام شد. این نتایج محلی‌اند؛ تأیید متخصص مستقل و تست سرور مقصد باقی است.

| INV | آزمون خودکار دارای شناسه و مکانیزم |
|---|---|
| 01/02 | inventory.test.ts، payments.test.ts؛ M8 بار کامل و رقابت با قفل سانس/قیود DB |
| 03/04/05 | payments.test.ts؛ verify سرور، صدور اتمیک و قیود یکتا؛ بازپخش بار M8 |
| 06 | check-in.test.ts؛ PK(ticket_id)/قفل، بازیابی وضعیت مصرف در M8 |
| 07 | admin/inventory-api/checkout-api/check-in/finance tests؛ policy سمت سرور |
| 08 | config.test.ts و m8-security.test.ts؛ منع Fake/secret و CSP |
| 09 | admin/inventory/customer-orders tests؛ rate-limit پایدار DB |
| 10 | admin/inventory-api/checkout-api و m8-security/m8-catalog tests؛ Zod/مبدأ/حجم |
| 11 | admin/inventory/check-in/finance tests؛ ممیزی فقط‌افزودنی |
| 12 | m8-backup.test.ts؛ dump، snapshot، restore در DB جدا و تطبیق داده/schema |
| 13/14 | finance.test.ts؛ سوابق محافظت‌شده، ریال صحیح و UTC |

اجرای M8 پس از build و با PG_BIN معتبر: `npm.cmd test -- tests/m8-load.test.ts tests/m8-backup.test.ts tests/m8-security.test.ts tests/m8-catalog.test.ts`. فایل secret test، JS کلاینت build را هم می‌خواند. اطلاعات دسترسی/توکن‌ها در گزارش ثبت نمی‌شوند. گزارش بار در `.local/qa/m8-load.json` و `m8-http.json` است؛ گزارش ثابت قابل انتقال در QA-M8.md قرار دارد.

## ردیابی INV ← تست
هدف: هر INV یک تست با شناسه خودش داشته باشد. اجراشده تا M2: ۱۱ تست؛ admin.test.ts پوشش پایه INV-07/09/10/11/14 و format.test.ts تبدیل پول. بقیه شناسه‌ها در میلستون مرتبط تکمیل می‌شوند؛ پاس‌شده محسوب نمی‌شوند.

## انواع تست
Unit · Integration · Database/Concurrency (PostgreSQL واقعی) · API · بررسی دستی Chrome بدون Playwright (دستور مالک) · Responsive · Accessibility · Load · Security · Regression.
سناریوهای منفی الزامی: ورودی نامعتبر، بدون مجوز، قطع درگاه/SMS، callback تکراری و دیرهنگام، انقضای رزرو، دو اسکن هم‌زمان.

## چک‌لیست امنیت (برای M8)
authN/authZ سمت سرور · کنترل دسترسی به داده هر کاربر · اعتبارسنجی ورودی · نشست/کوکی امن · rate-limit OTP/ورود/رزرو · جعل callback درگاه · قابل‌حدس‌نبودن QR · آپلود امن · عدم افشای secret · آسیب‌پذیری وابستگی‌ها · CORS/CSP/HTTPS · بکاپ و بازیابی.

## گزارش QA
بازبینی مستقل پیش از بستن هر میلستون مهم (پرامپت P5/P6 در فایل همراه). گزارش‌ها اینجا اضافه می‌شوند.

### M2 — ۲۰۲۶/۱۱/۱۰
`npm.cmd test`: ۱۱/۱۱ موفق؛ `npm.cmd run lint`، `typecheck` و `build` اجرا و موفق. مهاجرت 0002 روی دیتابیس توسعه اجرا شد. اسکریپت ساخت داده نمایشی اجرا شد؛ ورود حساب نمایشی و صفحه پنل در Chrome موبایل مشاهده شد. ساخت سالن چندبخشی، قیمت و انتشار در تست PostgreSQL بررسی شد. خطای اولیه TypeScript و اجرای top-level await اسکریپت‌ها اصلاح و بررسی مجدد شد. فایل فونت گمشده M1 اضافه شد.
محدودیت: تست پرداخت، OTP، فروش نهایی و کنترل ورود مربوط به M4 به بعد است؛ هیچ ادعای آمادگی انتشار عمومی نداریم.

### M3 — ۲۰۲۶/۱۱/۱۰
آخرین اجرای کامل: ۲۶ تست، ۷ فایل، همه موفق، بدون skip؛ lint/typecheck/build موفق. بررسی بصری و مسیر واقعی رزرو/reload/لغو با Chrome بدون Playwright اجرا شد. next start با Fake واقعاً اجرا و با خطای مورد انتظار متوقف شد. گزارش یافته‌ها، اصلاح‌ها و محدودیت پوشش در `QA-M3.md`.
فایل‌های جدید: inventory.test.ts (INV-01/02/07/09/10/11)، inventory-api.test.ts (INV-07/10)، config.test.ts (guard تولید INV-08). INV-03/04/05/06/12/13 هنوز پوشش اجرایی ندارند؛ INV-01 فروش نهایی و بقیه پوشش‌های کامل در مراحل بعد ادامه دارند.

## نتیجه M4/M5 — ۲۰۲۶/۱۱/۱۱

آخرین اجرای مجموعه: ۴۳/۴۳ تست در ۱۰ فایل، بدون skip؛ lint/typecheck/build موفق. آزمون‌های PostgreSQL شامل پرداخت اتمیک، callback هم‌زمان، پرداخت دیرهنگام/نامشخص، برخورد reference و rollback، مالکیت مشتری، OTP و رد صدور زودهنگام بلیت‌اند. بازبینی Chrome در موبایل/دسکتاپ انجام شد؛ هیچ Playwright اجرا نشد. npm audit کامل و production صفر آسیب‌پذیری گزارش کردند. جزئیات و حدود شواهد در QA-M5.md؛ گزارش‌های M2/M3 سوابق همان مراحل هستند. تکمیل INVهای مراحل بعد، از جمله کنترل ورود و کنترل‌های مالی، همچنان در M6 تا M8 است.
