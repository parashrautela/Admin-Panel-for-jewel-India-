# staff-accounts

A store owner's staff logins. Creating a login needs the service role, so this runs here and both the app and the website call it.

```
owner ──suggest / create──▶ staff-accounts ──▶ auth user + employees row  (password shown once)
owner ──invite_google─────▶ staff-accounts ──▶ employees row, status 'invited'
staff signs in with Google ──▶ claim_staff_invite() in the database links the row
owner ──reset_password / set_status / cancel_invite / remove──▶ staff-accounts
```

## Requests

All are `POST` with the signed-in owner's Supabase JWT. The caller must own a **verified** `retailers` row; every action checks the employee belongs to that store.

| Body | Returns |
|---|---|
| `{"action":"suggest","full_name":"Priya Sharma"}` | `{ok, username, email, domain}` — a free username, `first.store` |
| `{"action":"create","full_name","username"?,"designation"?,"phone"?}` | `{ok, employee, password}` — **the password is returned once and stored nowhere** |
| `{"action":"invite_google","full_name","email","designation"?,"phone"?}` | `{ok, employee}` with `status: "invited"` |
| `{"action":"reset_password","employee_id"}` | `{ok, employee, password}` |
| `{"action":"set_status","employee_id","status":"active"\|"inactive"}` | `{ok, employee}` — inactive also bans the login, so their session stops within the hour |
| `{"action":"cancel_invite","employee_id"}` | `{ok, removed}` |
| `{"action":"remove","employee_id"}` | `{ok, removed}` — row and login together |

`employee` is `{id, full_name, email, username, invite_email, designation, phone, status, join_method, is_system_generated}`. Errors come back as `{ok:false, error, message}`; `message` is safe to show.

## Usernames

A staff username looks like an email — `priya.pinejewels@jewelindia.shop` — and is only a username. Nothing is ever sent to it, and there is no "forgot password": the owner resets it here. The domain is `STAFF_USERNAME_DOMAIN` (default `jewelindia.shop`). **Only ever use a domain Jewel India owns**, or a password-reset email could reach a stranger.

## What the app cannot do

- Choose which store: it comes from the caller's session.
- Read a password back: it exists only in the `create` / `reset_password` reply.
- Touch the owner's own system-generated row.
- Create a password login any other way: the database refuses direct inserts of `join_method = 'password'` from a user session (`onboarding_three_doors.sql`).

## Deploying

No new secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.

| Secret | Value |
|---|---|
| `STAFF_USERNAME_DOMAIN` | optional; default `jewelindia.shop` |

Deploy **with** JWT verification, which is the default. Never pass `--no-verify-jwt` here.

```bash
supabase functions deploy staff-accounts --use-api --project-ref ljxgwiuvdpuarvdszjts
```

Requires `onboarding_three_doors.sql` to have been applied first (the `join_method`, `invite_email`, `is_system_generated` columns and the `invited` status).

## Tests

```bash
node --experimental-strip-types --test supabase/functions/staff-accounts/*.test.ts
```
