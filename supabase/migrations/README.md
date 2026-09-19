# Database migrations

## Dollar purchases

Apply [202609190001_dollar_purchases.sql](202609190001_dollar_purchases.sql) to the application's Supabase project through its SQL editor or your migration runner **before releasing the dollar-tracking UI**. This repository does not automatically apply migrations during a Next.js build or deploy. Do not rerun the full `schema.sql` against an existing database: older policy statements in that file are not all idempotent.

The standalone migration is transactional and safe to reapply. It creates `public.dollar_purchases`, a user/date index, authenticated CRUD grants and an owner-only RLS policy. Anonymous users cannot access the table. Purchases cascade on auth-user deletion. Existing account balances, transactions, investment positions and policies are unchanged.

After applying it, use a test account to record, reload, edit and delete a purchase from the main tab. Confirm that a second account cannot see or change it. A missing migration leaves the card unavailable with a retry action; the UI does not substitute browser-only storage.

Purchase cost is the actual amount paid including fees/taxes, stored in BRL or EUR. USD received is recorded separately. The dashboard groups the original cost currencies and values each group with a dated reference exchange rate. This is a purchase tracker: it does not import Nomad data, track stock returns or withdrawals, or debit existing bank accounts. Current holdings therefore assume the recorded dollars remain held.

Quotes come from the fixed [Frankfurter USD rate endpoint](https://frankfurter.dev/) through `/api/exchange-rates`. The server caches provider responses for one hour and applies an eight-second timeout. No additional API key is required. Reference rates are not executable Nomad quotes. An unavailable rate hides estimated value/gain while keeping recorded purchase costs visible.
