# یول‌تیک (Yoltic) — پلتفرم فروش بلیت رویداد

**وضعیت:** M2 انجام شد؛ M3 در حال اجرا. مستندات: `AGENTS.md` · `docs/`.

## اجرا از محیط تمیز
1. Node.js ۲۰ تا ۲۴ و PostgreSQL ۱۸ نصب باشد.
2. `npm install`
3. `copy .env.example .env` و مقدارها را پر کنید.
4. دیتابیس محلی پروژه (داخل `.local/`، پورت ۵۴۳۳): ساخت یک‌باره با `initdb`، سپس `powershell scripts/db-start.ps1`. کاربر/دیتابیس‌ها: `yoltick_app` / `yoltick_dev` / `yoltick_test`.
5. `npm run migrate` · `npm run dev`

## دستورها
`npm run lint` · `npm run typecheck` · `npm test` · `npm run build`

## مدیریت محلی
- نشانی `/admin`؛ بدون ورود به `/admin/login` هدایت می‌شود.
- ساخت اولین مدیر: `ADMIN_EMAIL` و `ADMIN_PASSWORD` (حداقل ۱۲ نویسه) را موقتاً در `.env` قرار دهید؛ `npm.cmd run admin:create`؛ سپس رمز را از `.env` بردارید. رمز در خروجی نوشته نمی‌شود.
- داده نمایشی اختیاری، فقط development: `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/seed-demo.ts`. اطلاعات ورود تولیدشده فقط داخل `.local/demo-access.json` است و وارد Git نمی‌شود.
- پنل: سالن/شهر و بخش‌ها → رویداد → سانس و قیمت ریالی هر بخش → انتشار. تاریخ ورودی با تقویم مرورگر میلادی و ساعت تهران است؛ نمایش تاریخ شمسی است.
- تست‌ها فقط `yoltick_test` محلی را می‌پذیرند؛ دیتابیس توسعه یا سوابق قبلی را حذف نمی‌کنند.
