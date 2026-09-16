"""employee_store_profile() on a real Postgres with Supabase-shaped auth."""
import pathlib, uuid
import pgserver, psycopg

MIGRATION = pathlib.Path("/Users/parashrautela/Documents/jewel india /Admin-Panel-for-jewel-India-/supabase/migrations/employee_store_profile.sql")
server = pgserver.get_server(str(pathlib.Path(__file__).parent / "pgdata"), cleanup_mode=None)
admin = server.get_uri()
with psycopg.connect(admin, autocommit=True) as c:
    c.execute("DROP DATABASE IF EXISTS storeprofile")
    c.execute("CREATE DATABASE storeprofile")
db = psycopg.connect(psycopg.conninfo.make_conninfo(admin, dbname="storeprofile"), autocommit=True)

db.execute("""
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table public.retailers (
  id uuid primary key default gen_random_uuid(), user_id uuid,
  business_name text, business_logo_url text, selected_theme text,
  aadhaar_front_url text, pan_card_url text
);
create table public.employees (
  id uuid primary key default gen_random_uuid(), auth_user_id uuid,
  retailer_id uuid references public.retailers(id), status text
);
alter table public.retailers enable row level security;
create policy own on public.retailers for select using (user_id = auth.uid());
grant select on public.retailers to authenticated;
""")
db.execute(MIGRATION.read_text())

owner, staff, gone, stranger = (uuid.uuid4() for _ in range(4))
store = db.execute("""insert into retailers (user_id, business_name, business_logo_url, selected_theme, aadhaar_front_url)
                      values (%s,'Parash The Dev','https://logo','maharaja','https://SECRET-aadhaar') returning id""",
                   (owner,)).fetchone()[0]
other = db.execute("insert into retailers (user_id, business_name) values (%s,'Other Store') returning id",
                   (uuid.uuid4(),)).fetchone()[0]
db.execute("insert into employees (auth_user_id, retailer_id, status) values (%s,%s,'active')", (staff, store))
db.execute("insert into employees (auth_user_id, retailer_id, status) values (%s,%s,'inactive')", (gone, store))

def as_user(uid, role="authenticated"):
    with db.transaction():
        db.execute(f"set local role {role}")
        db.execute("select set_config('request.jwt.claims', %s, true)", (f'{{"sub":"{uid}","role":"{role}"}}',))
        try:
            return db.execute("select * from public.employee_store_profile()").fetchall()
        except psycopg.errors.InsufficientPrivilege:
            return "denied"

results = []
def check(name, got, want):
    ok = got == want; results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"   got {got!r}"))

row = (store, "Parash The Dev", "https://logo", "maharaja")
check("the retailer gets their own store", as_user(owner), [row])
check("an active employee gets the store they work for", as_user(staff), [row])
check("an inactive employee gets nothing", as_user(gone), [])
check("an unrelated user gets nothing", as_user(stranger), [])
check("signed-out callers cannot call it at all", as_user(stranger, role="anon"), "denied")

with db.transaction():
    db.execute("set local role authenticated")
    db.execute("select set_config('request.jwt.claims', %s, true)", (f'{{"sub":"{staff}"}}',))
    direct = db.execute("select count(*) from public.retailers").fetchone()[0]
check("the employee still cannot read the retailers table directly", direct, 0)

cols = [d.name for d in db.execute("select * from public.employee_store_profile() limit 0").description]
check("only the four display fields come back — no document links", cols,
      ["retailer_id", "business_name", "business_logo_url", "selected_theme"])

db.execute(MIGRATION.read_text())
check("re-running the migration is safe", as_user(staff), [row])
print(f"\n{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
