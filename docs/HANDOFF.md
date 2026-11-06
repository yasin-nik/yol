# HANDOFF - وضعیت برای ادامه کار در نشست بعدی

تاریخ: 1405/08/15. آخرین tag: `m0`. M0 کامل (DONE). M1 در حال انجام (IN_PROGRESS).

## انجام‌شده در M1 (commit شده، هنوز tag ندارد)
- طراحی با skill ui-ux-pro-max: tokens رنگ (CSS variables + Tailwind)، فونت Vazirmatn (محلی در public/fonts)، RTL، ارقام فارسی، تومان از ریال (INV-14)، تاریخ شمسی.
- صفحات: صفحه اصلی، رویداد (داده نمونه علامت‌دار)، بلیت‌های من، قوانین، حریم خصوصی، تماس، 404، خطا.
- کامپوننت نقشه صندلی لمسی (SVG، zoom/pan، کیبورد، aria) در src/components/seat-map.tsx.
- واقعاً اجرا شد و پاس شد: typecheck، lint، build، 6 تست vitest.

## باقی‌مانده برای بستن M1
1. بازبینی ظاهری موبایل/دسکتاپ با اسکرین‌شات. دانلود مرورگر Playwright از ایران مسدود است (403)؛ باید با Chrome نصب‌شده اجرا شود: `chromium.launch({ channel: 'chrome' })`. سرور: `npm run build` سپس `next start -p 3100`. این بازبینی هنوز اجرا نشده است.
2. بررسی نبود اسکرول افقی، فوکوس کیبورد، کنتراست.
3. به‌روزرسانی PLAN (M1 -> DONE)، commit، `git tag m1`، گزارش فارسی.

## محیط
- PostgreSQL محلی: `powershell scripts/db-start.ps1` (پورت 5433). دیتابیس‌ها yoltick_dev و yoltick_test، کاربر yoltick_app. رمز در .env (ایگنور شده).
- npm در PowerShell باید `npm.cmd` اجرا شود (سیاست اسکریپت).
- `npm audit`: هشدار postcss داخل Next؛ در M8 بررسی شود.

## بعدی
M2: احراز هویت مدیر، سالن/رویداد/سانس، Audit Log. M3 (نقشه و رزرو اتمیک) با بازبینی مستقل و skill طراحی.