# Family Money 💰

Personal finance tracker for a two-person household: income, expenses (cash / UPI / wallet / credit card), investments (stocks, mutual funds, FD, gold), chitty, loans, net worth, charts and smart savings suggestions. Mobile-first; install it with **Add to Home Screen**.

- Frontend: plain HTML/CSS/JS + Chart.js, hosted on GitHub Pages
- Backend: Supabase (Postgres + Auth + Row Level Security)
- Notifications: [ntfy.sh](https://ntfy.sh) (free push), triggered from the database; daily 9 PM IST reminder via `pg_cron`
- Export: Excel (.xlsx), CSV, JSON backup

## Setup
1. Run `schema.sql`, then `notifications.sql`, in the Supabase SQL editor.
2. Create the login user in Supabase Auth and add its id to `public.app_users`.
3. Put the project URL and publishable/anon key in `config.js`.

## How savings are calculated
- **Total saved** = income − expenses − loan interest
- **Indirect saving** = investments + chitty installments + loan principal repaid − redemptions − chitty payouts
- **Direct saving** = total saved − indirect (cash left in bank/hand)
- Credit card bill payments are not counted as spending (the swipes already were).
