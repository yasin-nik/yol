# یول‌تیک (Yoltic) — پلتفرم فروش بلیت رویداد

**وضعیت:** M0 انجام شد. مستندات: `AGENTS.md` · `docs/`.

## اجرا از محیط تمیز
1. Node.js ۲۰ تا ۲۴ و PostgreSQL ۱۸ نصب باشد.
2. `npm install`
3. `copy .env.example .env` و مقدارها را پر کنید.
4. دیتابیس محلی پروژه (داخل `.local/`، پورت ۵۴۳۳): ساخت یک‌باره با `initdb`، سپس `powershell scripts/db-start.ps1`. کاربر/دیتابیس‌ها: `yoltick_app` / `yoltick_dev` / `yoltick_test`.
5. `npm run migrate` · `npm run dev`

## دستورها
`npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
