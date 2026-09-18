"""onboarding_three_doors.sql on a real Postgres shaped like the live project.

Run:  <venv with pgserver + psycopg>/bin/python onboarding_three_doors.test.py
"""
import pathlib, uuid, json
import pgserver, psycopg

HERE = pathlib.Path(__file__).parent
MIGRATION = (HERE / "onboarding_three_doors.sql").read_text()
server = pgserver.get_server(str(HERE / ".pgdata-three-doors"), cleanup_mode=None)
admin_uri = server.get_uri()
with psycopg.connect(admin_uri, autocommit=True) as c:
    c.execute("DROP DATABASE IF EXISTS threedoors")
    c.execute("CREATE DATABASE threedoors")
db = psycopg.connect(psycopg.conninfo.make_conninfo(admin_uri, dbname="threedoors"), autocommit=True)

# --- the live shape, as introspected on 18 Sep 2026 ------------------------
db.execute("""
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (
  id uuid primary key, email text, phone text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  provider text, identity_data jsonb
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', 'anon') $$;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, role text not null default 'customer',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  phone_number text,
  constraint profiles_role_check check (role in ('wholesaler','retailer','employee'))
);
create table public.wholesalers (
  id uuid primary key default gen_random_uuid(), user_id uuid unique,
  business_name text, business_logo_url text, verification_status text default 'pending'
);
create table public.retailers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique,
  email text, full_name text, business_name text, state text, city text,
  aadhaar_front_url text, business_logo_url text, referred_by uuid, referral_code text,
  verification_status text default 'pending', rejection_reason text,
  rejected_documents text[] default '{}', admin_notes text, notification_message text,
  notified boolean default false, has_visited_dashboard boolean default false,
  selected_theme varchar default 'indian', created_at timestamptz default now(), updated_at timestamptz default now(),
  constraint retailers_verification_status_check check (verification_status in
    ('pending','verified','rejected','on_hold','resubmission_required','banned'))
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  retailer_id uuid not null references public.retailers(id) on delete cascade,
  full_name text not null, email text not null, password_plain text not null,
  designation text default 'Sales Associate', phone text, status text default 'inactive',
  last_active_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
  personal_email text,
  constraint employees_status_check check (status in ('active','inactive'))
);
create table public.referral_links (
  id uuid primary key default gen_random_uuid(), wholesaler_id uuid not null references public.wholesalers(id),
  code text not null unique, uses_count int default 0, max_uses int default 1, is_active boolean default true,
  created_at timestamptz default now(), expires_at timestamptz default now() + interval '7 days',
  opened_at timestamptz, accepted_at timestamptz, accepted_by uuid, rewarded_at timestamptz,
  source text not null default 'web', updated_at timestamptz not null default now()
);

-- the trigger that was live
create function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, new.phone), coalesce(new.raw_user_meta_data->>'role', 'wholesaler'))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- the retailer guards that were live
create function public.guard_retailer_privileged_columns_on_insert() returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.verification_status := 'pending'; new.admin_notes := null; new.rejection_reason := null;
    new.rejected_documents := '{}'; new.notified := false; new.notification_message := null;
  end if;
  return new;
end $$;
create trigger retailers_guard_privileged_columns_on_insert before insert on public.retailers
  for each row execute function public.guard_retailer_privileged_columns_on_insert();
create function public.guard_retailer_privileged_columns() returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.verification_status := old.verification_status; new.admin_notes := old.admin_notes;
    new.rejection_reason := old.rejection_reason; new.rejected_documents := old.rejected_documents;
    new.notified := old.notified; new.notification_message := old.notification_message;
  end if;
  return new;
end $$;
create trigger retailers_guard_privileged_columns before update on public.retailers
  for each row execute function public.guard_retailer_privileged_columns();

-- the policies that were live
alter table public.profiles enable row level security;
alter table public.retailers enable row level security;
alter table public.employees enable row level security;
alter table public.referral_links enable row level security;
alter table public.wholesalers enable row level security;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can view own retailer record" on public.retailers for select using (auth.uid() = user_id);
create policy "Users can insert own retailer record" on public.retailers for insert with check (auth.uid() = user_id);
create policy "Users can update own retailer record" on public.retailers for update using (auth.uid() = user_id);
create policy "Retailers can view own employees" on public.employees for select using (retailer_id in (select id from public.retailers where user_id = auth.uid()));
create policy "Retailers can insert own employees" on public.employees for insert with check (retailer_id in (select id from public.retailers where user_id = auth.uid()));
create policy "Retailers can update own employees" on public.employees for update using (retailer_id in (select id from public.retailers where user_id = auth.uid()));
create policy "Retailers can delete own employees" on public.employees for delete using (retailer_id in (select id from public.retailers where user_id = auth.uid()));
create policy "Employees can view self" on public.employees for select using (auth_user_id = auth.uid());
create policy "Anyone can validate referral links" on public.referral_links for select using (true);
create policy "Wholesalers can view own referral links" on public.referral_links for select using (wholesaler_id in (select id from public.wholesalers where user_id = auth.uid()));
create policy "Wholesalers own row" on public.wholesalers for select using (user_id = auth.uid());
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
""")

# --- people who existed before the change ----------------------------------
def new_user(email=None, phone=None, meta=None, google=False):
    uid = uuid.uuid4()
    db.execute("insert into auth.users (id, email, phone, email_confirmed_at, raw_user_meta_data) values (%s,%s,%s,now(),%s)",
               (uid, email, phone, json.dumps(meta or {})))
    if google:
        db.execute("insert into auth.identities (user_id, provider, identity_data) values (%s,'google',%s)",
                   (uid, json.dumps({"email": email})))
    return uid

old_wholesaler = new_user("ws@example.com")
old_retailer_pending = new_user("pend@example.com")
old_retailer_verified = new_user("ok@example.com")
old_staff = new_user("priya.pine@pinejewels.com", meta={"role": "employee"})
db.execute("update public.profiles set role='retailer' where id in (%s,%s)", (old_retailer_pending, old_retailer_verified))
# the web only reads metadata, and these three never had it
db.execute("update auth.users set raw_user_meta_data='{}'::jsonb where id in (%s,%s,%s)",
           (old_wholesaler, old_retailer_pending, old_retailer_verified))
ws_id = db.execute("insert into public.wholesalers (user_id, business_name, verification_status) values (%s,'Pine Jewels','verified') returning id",
                   (old_wholesaler,)).fetchone()[0]
ws_unverified = db.execute("insert into public.wholesalers (user_id, business_name, verification_status) values (%s,'Not Yet','pending') returning id",
                           (new_user("nope@example.com"),)).fetchone()[0]
pending_store = db.execute("insert into public.retailers (user_id, business_name) values (%s,'Pending Store') returning id",
                           (old_retailer_pending,)).fetchone()[0]
verified_store = db.execute("insert into public.retailers (user_id, business_name) values (%s,'Old Verified') returning id",
                            (old_retailer_verified,)).fetchone()[0]
# an admin verified them long ago (the old guard pins status for anyone but the service role)
db.execute("alter table public.retailers disable trigger all")
db.execute("update public.retailers set verification_status='verified' where id=%s", (verified_store,))
db.execute("alter table public.retailers enable trigger all")
db.execute("insert into public.employees (auth_user_id, retailer_id, full_name, email, password_plain, status) values (%s,%s,'Priya','priya.pine@pinejewels.com','Pri-Pin-1234!','active')",
           (old_staff, verified_store))

def link(code, wholesaler=None, **cols):
    cols = {"wholesaler_id": wholesaler or ws_id, "code": code, **cols}
    keys = ", ".join(cols); vals = ", ".join(["%s"] * len(cols))
    return db.execute(f"insert into public.referral_links ({keys}) values ({vals}) returning id", tuple(cols.values())).fetchone()[0]

link("PJ-GOOD01"); link("PJ-GOOD02"); link("PJ-GOOD03"); link("PJ-LATE01")
link("PJ-OLD001", expires_at="2020-01-01")
link("PJ-USED01", uses_count=1, accepted_by=uuid.uuid4(), is_active=False)
link("NY-NOTYET", wholesaler=ws_unverified)

# --- apply ------------------------------------------------------------------
db.execute(MIGRATION)

# --- helpers ----------------------------------------------------------------
class Refused(Exception):
    pass

def run(sql, params=(), uid=None, role="authenticated", fetch=True):
    """One statement as one person, in its own transaction — like PostgREST."""
    try:
        with db.transaction():
            db.execute(f"set local role {role}")
            claims = {"role": role}
            if uid: claims["sub"] = str(uid)
            db.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))
            cur = db.execute(sql, params)
            return cur.fetchall() if fetch and cur.description else None
    except psycopg.Error as e:
        msg = (e.diag.message_primary or str(e)).strip()
        raise Refused(msg) from None

def refused(sql, params=(), **kw):
    try:
        run(sql, params, **kw)
    except Refused as e:
        return e.args[0]
    return None

def cell(sql, params=()):
    return db.execute(sql, params).fetchone()[0]

results = []
def check(name, got, want):
    ok = got == want; results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"   got {got!r}, wanted {want!r}"))

def meta_role(uid):
    return cell("select raw_user_meta_data->>'role' from auth.users where id=%s", (uid,))

def profile_role(uid):
    return cell("select role from public.profiles where id=%s", (uid,))

# --- 1. role ----------------------------------------------------------------
print("\n# role")
fresh = new_user(phone="+919876543210")
check("a new account has no role", profile_role(fresh), None)
check("…and none in metadata", meta_role(fresh), None)
staff_made = new_user("a.b@jewelindia.shop", meta={"role": "employee"})
check("'employee' in signup metadata is not taken at face value", profile_role(staff_made), None)
run("insert into public.profiles (id, email, role) values (%s,'a.b@jewelindia.shop','employee') on conflict (id) do update set role='employee'",
    (staff_made,), role="service_role")
check("the staff service sets it afterwards", profile_role(staff_made), "employee")
check("…and metadata agrees", meta_role(staff_made), "employee")
odd = new_user("odd@example.com", meta={"role": "customer"})
check("an unknown role at signup is dropped", profile_role(odd), None)

check("backfill: an old retailer's role reached their metadata", meta_role(old_retailer_pending), "retailer")
check("backfill: an old wholesaler too", meta_role(old_wholesaler), "wholesaler")

check("set_my_role: wholesaler", run("select public.set_my_role('wholesaler')", uid=fresh)[0][0], "wholesaler")
check("…written to profiles", profile_role(fresh), "wholesaler")
check("…and to metadata", meta_role(fresh), "wholesaler")
check("changing door before applying is fine", run("select public.set_my_role('retailer')", uid=fresh)[0][0], "retailer")
check("set_my_role refuses employee", refused("select public.set_my_role('employee')", uid=fresh), "ROLE_NOT_ALLOWED")
check("set_my_role needs a session", refused("select public.set_my_role('retailer')", role="anon") is not None, True)
check("an old wholesaler with an application cannot switch",
      refused("select public.set_my_role('retailer')", uid=old_wholesaler), "ROLE_ALREADY_SET")
check("…but asking for the role they have is fine", run("select public.set_my_role('wholesaler')", uid=old_wholesaler)[0][0], "wholesaler")

run("update public.profiles set role='wholesaler' where id=%s", (fresh,), uid=fresh)
check("a direct role change by the person is pinned", profile_role(fresh), "retailer")
run("update public.profiles set role='employee' where id=%s", (fresh,), uid=fresh)
check("…including to employee", profile_role(fresh), "retailer")
blank = new_user("blank@example.com")
run("update public.profiles set role='wholesaler' where id=%s", (blank,), uid=blank)
check("filling an empty role with wholesaler works (old app builds do this)", profile_role(blank), "wholesaler")
check("…and reaches metadata", meta_role(blank), "wholesaler")
blank2 = new_user("blank2@example.com")
run("update public.profiles set role='employee' where id=%s", (blank2,), uid=blank2)
check("filling an empty role with employee does not", profile_role(blank2), None)
db.execute("delete from public.profiles where id=%s", (blank2,))
run("insert into public.profiles (id, email, role) values (%s,'x','employee')", (blank2,), uid=blank2)
check("nor can a fresh profile row be inserted as employee", profile_role(blank2), None)

db.execute("update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"role\":\"wholesaler\"}' where id=%s", (fresh,))
check("a metadata write outside the functions is pinned", meta_role(fresh), "retailer")
db.execute("update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"name\":\"Fresh\",\"picture\":\"p\"}' where id=%s", (fresh,))
check("a Google refresh of name/picture keeps the role", meta_role(fresh), "retailer")
check("…and keeps the new name", cell("select raw_user_meta_data->>'name' from auth.users where id=%s", (fresh,)), "Fresh")

check("profiles: you see only your own row", run("select count(*) from public.profiles", uid=fresh)[0][0], 1)
check("profiles: signed out sees nothing", run("select count(*) from public.profiles", role="anon")[0][0], 0)

# --- 2. retailers and invitations -------------------------------------------
print("\n# invitations")
def validate(code, **kw):
    return run("select public.validate_referral_code(%s)", (code,), **kw)[0][0]
check("validate: a good code, signed out", validate("PJ-GOOD01", role="anon")["valid"], True)
check("…names the wholesaler", validate("PJ-GOOD01", role="anon")["wholesaler_name"], "Pine Jewels")
check("…any case", validate("pj-good01", role="anon")["valid"], True)
check("validate: unknown", validate("PJ-NOPE00", role="anon")["reason"], "not_found")
check("validate: expired", validate("PJ-OLD001", role="anon")["reason"], "expired")
check("validate: used", validate("PJ-USED01", role="anon")["reason"], "used")
check("validate: from an unverified wholesaler", validate("NY-NOTYET", role="anon")["reason"], "inactive")
check("validate: empty", validate("  ", role="anon")["reason"], "no_code")
check("codes can no longer be listed", run("select count(*) from public.referral_links", uid=fresh)[0][0], 0)

r1 = new_user("r1@example.com")
check("a retailer row needs a code",
      refused("insert into public.retailers (user_id, business_name) values (%s,'No Code')", (r1,), uid=r1), "INVITE_CODE_REQUIRED")
check("…even from the service role",
      refused("insert into public.retailers (user_id, business_name) values (%s,'No Code')", (r1,), role="service_role"), "INVITE_CODE_REQUIRED")
check("a used code is refused",
      refused("insert into public.retailers (user_id, business_name, referral_code) values (%s,'X','PJ-USED01')", (r1,), uid=r1), "INVITE_CODE_USED")
check("an expired code is refused",
      refused("insert into public.retailers (user_id, business_name, referral_code) values (%s,'X','PJ-OLD001')", (r1,), uid=r1), "INVITE_CODE_EXPIRED")
check("an unverified wholesaler's code is refused",
      refused("insert into public.retailers (user_id, business_name, referral_code) values (%s,'X','NY-NOTYET')", (r1,), uid=r1), "INVITE_CODE_INACTIVE")
run("insert into public.retailers (user_id, business_name, referral_code, referred_by, verification_status) values (%s,'R1 Store','pj-good01',%s,'verified')",
    (r1, ws_unverified), uid=r1)
row = db.execute("select referred_by, referral_code, verification_status from public.retailers where user_id=%s", (r1,)).fetchone()
check("a good code creates the row with the real inviter", row[0], ws_id)
check("…code stored normalised", row[1], "PJ-GOOD01")
check("…status forced to pending", row[2], "pending")
lk = db.execute("select is_active, uses_count, accepted_by from public.referral_links where code='PJ-GOOD01'").fetchone()
check("…and the code is spent", (lk[0], lk[1], lk[2]), (False, 1, r1))
r2 = new_user("r2@example.com")
check("the same code cannot be used twice",
      refused("insert into public.retailers (user_id, business_name, referral_code) values (%s,'X','PJ-GOOD01')", (r2,), uid=r2), "INVITE_CODE_USED")
check("resubmitting (upsert) an existing retailer does not need a new code",
      refused("insert into public.retailers (user_id, business_name, city, referral_code) values (%s,'R1 Store','Pune',null) "
              "on conflict (user_id) do update set city = excluded.city, referral_code = excluded.referral_code", (r1,), uid=r1), None)
row = db.execute("select city, referred_by, referral_code from public.retailers where user_id=%s", (r1,)).fetchone()
check("…the edit landed, the inviter and code stayed", row, ("Pune", ws_id, "PJ-GOOD01"))
run("update public.retailers set referred_by=%s, referral_code='PJ-GOOD02' where user_id=%s", (ws_unverified, r1), uid=r1)
check("a retailer cannot rewrite their inviter", db.execute("select referred_by from public.retailers where user_id=%s", (r1,)).fetchone()[0], ws_id)
run("update public.retailers set referred_by=%s where user_id=%s", (ws_unverified, r1), role="service_role")
check("…nor can the service role by a plain update", db.execute("select referred_by from public.retailers where user_id=%s", (r1,)).fetchone()[0], ws_id)

check("no approval without an inviter",
      refused("update public.retailers set verification_status='verified' where id=%s", (pending_store,), role="service_role"), "RETAILER_HAS_NO_INVITER")
check("approval with an inviter",
      refused("update public.retailers set verification_status='verified' where user_id=%s", (r1,), role="service_role"), None)
check("an old verified retailer without inviter is untouched",
      refused("update public.retailers set city='Delhi' where id=%s", (verified_store,), role="service_role"), None)

check("attach: a pending retailer adds a code",
      run("select public.attach_referral_code('pj-good02')", uid=old_retailer_pending)[0][0]["ok"], True)
check("…inviter set", db.execute("select referred_by from public.retailers where id=%s", (pending_store,)).fetchone()[0], ws_id)
check("…code spent", cell("select accepted_by from public.referral_links where code='PJ-GOOD02'"), old_retailer_pending)
check("attach: the same code again is a harmless replay",
      run("select public.attach_referral_code('PJ-GOOD02')", uid=old_retailer_pending)[0][0].get("replayed"), True)
check("attach: a different code is refused",
      refused("select public.attach_referral_code('PJ-GOOD03')", uid=old_retailer_pending), "RETAILER_ALREADY_ATTRIBUTED")
check("attach: an already verified retailer is refused",
      refused("select public.attach_referral_code('PJ-GOOD03')", uid=old_retailer_verified), "RETAILER_ALREADY_VERIFIED")
check("…and now they can be approved",
      refused("update public.retailers set verification_status='verified' where id=%s", (pending_store,), role="service_role"), None)

# --- 3. staff ----------------------------------------------------------------
print("\n# staff")
check("stored passwords were cleared", cell("select count(*) from public.employees where password_plain is not null"), 0)
owner = old_retailer_pending  # now verified, owns pending_store
run("insert into public.employees (retailer_id, full_name, invite_email, join_method, status, auth_user_id, is_system_generated) "
    "values (%s,'Ravi','  Ravi.Kumar@Gmail.com ','google','active',%s,true)", (pending_store, owner), uid=owner)
inv = db.execute("select invite_email, email, status, auth_user_id, is_system_generated, created_by from public.employees where full_name='Ravi'").fetchone()
check("a store invites a Google address", inv[0], "ravi.kumar@gmail.com")
check("…email defaults to it", inv[1], "ravi.kumar@gmail.com")
check("…status is invited, nothing else honoured", (inv[2], inv[3], inv[4], inv[5]), ("invited", None, False, owner))
check("a store cannot create a password login itself",
      refused("insert into public.employees (retailer_id, full_name, email, join_method) values (%s,'X','x@jewelindia.shop','password')", (pending_store,), uid=owner),
      "USE_STAFF_ACCOUNTS_SERVICE")
check("the same address cannot be invited twice",
      refused("insert into public.employees (retailer_id, full_name, invite_email, join_method) values (%s,'Again','RAVI.KUMAR@gmail.com','google')", (verified_store,), uid=old_retailer_verified) is not None, True)
svc_user = new_user("meena.pending@jewelindia.shop", meta={"role": "employee"})
check("the staff service creates a password login",
      refused("insert into public.employees (retailer_id, auth_user_id, full_name, email, join_method, status, created_by) values (%s,%s,'Meena','meena.pending@jewelindia.shop','password','active',%s)",
              (pending_store, svc_user, owner), role="service_role"), None)
run("update public.employees set status='inactive', designation='Manager' where auth_user_id=%s", (svc_user,), uid=owner)
emp = db.execute("select status, designation from public.employees where auth_user_id=%s", (svc_user,)).fetchone()
check("a store can deactivate and edit", emp, ("inactive", "Manager"))
run("update public.employees set auth_user_id=%s, email='hijack@x', join_method='google' where full_name='Meena'", (owner,), uid=owner)
emp = db.execute("select auth_user_id, email, join_method from public.employees where full_name='Meena'").fetchone()
check("…but identity columns are pinned", emp, (svc_user, "meena.pending@jewelindia.shop", "password"))
run("update public.employees set status='active' where full_name='Ravi'", uid=owner)
check("an invitation cannot be marked active by hand", cell("select status from public.employees where full_name='Ravi'"), "invited")

ravi = new_user("ravi.kumar@gmail.com", google=True)
got = run("select * from public.claim_staff_invite()", uid=ravi)
check("claim: the invited Google user becomes staff", (got[0][1], got[0][2]), (pending_store, "Pending Store"))
emp = db.execute("select status, auth_user_id, activated_at is not null from public.employees where full_name='Ravi'").fetchone()
check("…row active and linked", emp, ("active", ravi, True))
check("…profile role employee", profile_role(ravi), "employee")
check("…metadata role employee", meta_role(ravi), "employee")
check("claim again is idempotent", run("select * from public.claim_staff_invite()", uid=ravi)[0][0], got[0][0])
plain = new_user("ravi.kumar@gmail.com".replace("ravi", "someone"))
check("claim: needs a Google identity", refused("select * from public.claim_staff_invite()", uid=plain), "GOOGLE_SIGN_IN_REQUIRED")
stranger = new_user("stranger@gmail.com", google=True)
check("claim: not invited", refused("select * from public.claim_staff_invite()", uid=stranger), "NOT_INVITED")
run("insert into public.employees (retailer_id, full_name, invite_email, join_method) values (%s,'WS Owner','ws@example.com','google')", (pending_store,), uid=owner)
db.execute("insert into auth.identities (user_id, provider, identity_data) values (%s,'google',%s)", (old_wholesaler, json.dumps({"email": "ws@example.com"})))
check("claim: a wholesaler's Google account cannot become staff",
      refused("select * from public.claim_staff_invite()", uid=old_wholesaler), "ACCOUNT_HAS_ANOTHER_ROLE")
check("store profile works for the new employee",
      run("select business_name from public.employee_store_profile()", uid=ravi)[0][0], "Pending Store")

run("insert into public.employees (retailer_id, auth_user_id, full_name, email, designation, is_system_generated, status) values (%s,%s,'Owner','pend@example.com','Admin',true,'active')",
    (pending_store, owner), role="service_role")
check("the owner's own row cannot be deleted by the store",
      refused("delete from public.employees where is_system_generated", uid=owner), "CANNOT_DELETE_STORE_OWNER_ROW")
check("…nor by the service role (the website's delete bug)",
      refused("delete from public.employees where is_system_generated", role="service_role"), "CANNOT_DELETE_STORE_OWNER_ROW")
check("a normal employee can be removed", refused("delete from public.employees where full_name='WS Owner'", uid=owner), None)
db.execute("delete from auth.users where id=%s", (owner,))
check("deleting the account itself still cascades", cell("select count(*) from public.employees where is_system_generated"), 0)

# --- re-run -------------------------------------------------------------------
print("\n# re-run")
db.execute(MIGRATION)
check("re-running the migration is safe", refused("select public.set_my_role('wholesaler')", uid=new_user("again@example.com")), None)
check("the two public read rules are gone",
      cell("select count(*) from pg_policies where policyname in ('Anyone can validate referral links','Public profiles are viewable by everyone')"), 0)

print(f"\n{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
