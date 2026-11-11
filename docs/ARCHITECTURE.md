# ARCHITECTURE — پیش‌نویس فاز ۰ (`[PROPOSED]`، نهایی پس از G1)

## سبک
Modular Monolith، بدون microservices. ماژول‌ها: Catalog · Venues&Seats · Inventory/Holds · Orders · Payments · Tickets · Check-in · Admin · Auth · Settlements/Reporting.

## Stack نقطه شروع
Next.js 15 + React + TypeScript + Tailwind 3 (RTL) · PostgreSQL 18 با pg و SQL نسخه‌بندی‌شده · Zod · Vitest و تست هم‌زمانی DB واقعی · بازبینی بصری Chrome بدون Playwright · Git. Node 24.19.0 پین شده است (D-016/D-024).
دلیل: یک پروژه واحد، هزینه پایین، اکوسیستم بزرگ. ریسک: وابستگی به بسته‌ها از ایران (بخش D3) — در M0 بررسی می‌شود.

## میزبانی (توصیه اولیه)
**سرور مجازی داخل ایران** (به نام مالک) برای: دسترس‌پذیری callback درگاه‌های ایرانی، تأخیر کم کاربر، سازگاری با الزامات نگهداری داده، و عدم وابستگی به سرویس‌های ابری که ممکن است از ایران در دسترس نباشند. Redis فقط در صورت اثبات نیاز.
جایگزین: سرور خارج + proxy — پیچیده‌تر و پرریسک‌تر برای callback. تصمیم نهایی در G2.

## لایه‌های انتزاعی
`PaymentGateway` (adapter: Fake برای توسعه، یک PSP واقعی) · `SmsProvider` (Fake/واقعی). Fake در production با شکست راه‌اندازی ممنوع می‌شود (F2.2).

## مدل داده (خلاصه)
seats (فیزیکی) جدا از session_seats (وضعیت فروش در سانس). users/roles · cities/venues/sections/rows/seats · events/event_sessions/ticket_types · session_seats/seat_holds · orders/order_items/payments · tickets/check_ins · refunds/commissions/settlements · support_requests · audit_logs. پول: عدد صحیح (پیشنهاد: ریال)، زمان: UTC.

## جریان پرداخت
hold → order(PENDING) → ایجاد تراکنش در PSP → ریدایرکت → callback → **verify سرور** → تراکنش واحد: payment=VERIFIED، seats=SOLD، صدور tickets (idempotent). نامشخص/timeout → job استعلام.

## اجراشده تا M3
`src/server/auth.ts`: نقش مدیر، نشست هش‌شده و محدودیت ورود. `catalog.ts`: سالن/بخش/ردیف/صندلی، رویداد و سانس با قیمت مستقل؛ عملیات حساس همراه Audit در همان تراکنش. trigger از UPDATE/DELETE/TRUNCATE جدول audit جلوگیری می‌کند (دسترسی ابرکاربر خارج از این تضمین است).
`inventory.ts`: قفل سانس → انقضای امن → قفل موجودی به ترتیب seat_id → رزرو یا مسدودی شرطی. رزرو ACTIVE با payment_state غیر NONE آزاد نمی‌شود. قید مرکب مانع اتصال hold به سانس دیگر است. قیمت از DB محاسبه می‌شود، نه درخواست کاربر.
API موجودی no-store/private است؛ mutation نیازمند مبدأ همان سایت و ورودی محدود/معتبر است. نگاشت localhost داخلی Next با Host واقعی تطبیق داده می‌شود؛ در استقرار پشت پراکسی APP_ORIGIN صریح تنظیم شود.
M4/M5 اجرا شدند: OTP → اتصال user_id به hold با کنترل قابلیت مرورگر → سفارش یکتای hold و snapshot قیمت/صندلی. PaymentGateway.create و verify خارج تراکنش و قفل موجودی اجرا می‌شوند؛ پس از create، hold زیر قفل دوباره اعتبارسنجی می‌شود و سپس آدرس درگاه برمی‌گردد. درخواست ایجاد درگاه با کلید سفارش idempotent است.
verify معتبر با مبلغ دقیق → قفل سانس → payments=VERIFIED، orders=PAID، seats=SOLD و tickets در یک تراکنش. قید یکتای مرجع/سفارش/آیتم/صندلی و trigger صدور بلیت اِعمال می‌شوند. پاسخ نامعتبر/timeout → UNKNOWN؛ PENDING/UNKNOWN آزاد نمی‌شوند. شکست قطعی → آزادسازی؛ موفقیت دیرهنگام فقط با تخصیص همه صندلی‌ها، در غیر این صورت REVIEW بدون بلیت. فرمان payments:reconcile وضعیت‌های در انتظار را بازاستعلام می‌کند؛ زمان‌بندی سیستم ایجاد نشده است.
بلیت و QR فقط برای حساب مالک، با no-store/private؛ QR فقط توکن تصادفی ۲۵۶بیتی است. چاپ از مرورگر، بدون سرویس بیرونی. SmsProvider و PaymentGateway فعلاً Fake هستند و در production هم در راه‌اندازی و هم در سازنده رد می‌شوند.

## M6/M7
check-in: نقش ADMIN یا CHECK_IN با تخصیص سانس، قفل سانس مستقل از بازبودن فروش، INSERT یکتای ticket_id و Audit اتمیک؛ ورود مجدد رد می‌شود. QR با jsQR محلی از دوربین خوانده و سپس به سرور ارسال می‌شود؛ حالت آفلاین تأیید نمی‌کند.

مالی: financial_terms نسخه‌دار؛ trigger پرداخت VERIFIED، snapshot فقط‌افزودنی order_financials را با numeric دقیق می‌سازد. snapshot قبلی تغییر نمی‌کند؛ تنظیم مدیر فروش‌های فاقد محاسبه را تکمیل می‌کند. گزارش REPEATABLE READ، جمع‌های bigint و نمایش دقیق ریال است. عملیات مالی ابتدا رویداد سپس سانس‌ها را به‌ترتیب قفل می‌کند؛ مسیر پرداخت و ورود فقط سانس را قفل می‌کنند.

refund_requests یکتای سفارش، QR را در خواندن خصوصی و check-in نامعتبر می‌کند؛ refund_completions مرجع انجام دستی است، بدون ارتباط بانکی. تسویه و ثبت معکوس فقط‌افزودنی با محدودیت مانده و یکتایی مرجع/درخواست هستند. trigger مانع حذف سوابق اصلی مالی و بازنویسی پرداخت/سفارش تأییدشده می‌شود. support_requests برای مشتری مالک با rate-limit؛ یادداشت داخلی جدا از موارد قابل نمایش به مشتری است.
