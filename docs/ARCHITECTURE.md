# ARCHITECTURE — پیش‌نویس فاز ۰ (`[PROPOSED]`، نهایی پس از G1)

## سبک
Modular Monolith، بدون microservices. ماژول‌ها: Catalog · Venues&Seats · Inventory/Holds · Orders · Payments · Tickets · Check-in · Admin · Auth · Settlements/Reporting.

## Stack نقطه شروع
Next.js + React + TypeScript + Tailwind (RTL) · PostgreSQL · Prisma (یا معادل) · Zod · Playwright + تست هم‌زمانی روی DB واقعی · Git.
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
