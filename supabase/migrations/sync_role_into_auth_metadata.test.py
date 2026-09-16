"""Prove the role-sync trigger on a real Postgres, against a Supabase-shaped auth schema."""
import pathlib, uuid
import pgserver, psycopg

HERE = pathlib.Path(__file__).parent
MIGRATION = pathlib.Path("/Users/parashrautela/Documents/jewel india /Admin-Panel-for-jewel-India-/supabase/migrations/sync_role_into_auth_metadata.sql")

server = pgserver.get_server(str(HERE / "pgdata"), cleanup_mode=None)
admin = server.get_uri()
with psycopg.connect(admin, autocommit=True) as c:
    c.execute("DROP DATABASE IF EXISTS roletest")
    c.execute("CREATE DATABASE roletest")
db = psycopg.connect(psycopg.conninfo.make_conninfo(admin, dbname="roletest"), autocommit=True)

# Supabase-shaped bits this touches.
db.execute("""
create schema if not exists auth;
create table auth.users (
  id uuid primary key,
  email text, phone text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz default now()
);
create table public.profiles (
  id uuid primary key,
  email text,
  role text,
  created_at timestamptz default now()
);
-- the trigger as it exists in production today
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, COALESCE(NEW.email, NEW.phone),
          COALESCE(NEW.raw_user_meta_data->>'role', 'wholesaler'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
""")

def signup(meta=None, provider="google"):
    uid = uuid.uuid4()
    db.execute(
        "insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values (%s,%s,%s,%s)",
        (uid, f"{uid}@x.com", psycopg.types.json.Jsonb(meta) if meta is not None else None,
         psycopg.types.json.Jsonb({"provider": provider})),
    )
    return uid

def state(uid):
    row = db.execute("""select u.raw_user_meta_data->>'role', p.role
                          from auth.users u left join public.profiles p on p.id=u.id
                         where u.id=%s""", (uid,)).fetchone()
    return {"meta": row[0], "profile": row[1]}

results = []
def check(name, got, want):
    ok = got == want
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + (f"   got {got}, want {want}" if not ok else ""))

# --- today's behaviour, before the fix ---------------------------------
before = state(signup(meta={"name": "Parash", "picture": "http://x"}))
check("BEFORE fix: a Google signup has a role in profiles but not in metadata",
      before, {"meta": None, "profile": "wholesaler"})

# --- apply the fix -----------------------------------------------------
db.execute(MIGRATION.read_text())

# 1. Google signup: no role claim at all
check("Google signup now gets the role in both places",
      state(signup(meta={"name": "Parash", "picture": "http://x"})),
      {"meta": "wholesaler", "profile": "wholesaler"})

# 2. Signup carrying a role (invited retailer, email signup)
check("a signup that declares retailer stays retailer",
      state(signup(meta={"role": "retailer"}, provider="email")),
      {"meta": "retailer", "profile": "retailer"})

# 3. No metadata at all (phone OTP)
check("a signup with no metadata at all still gets a role",
      state(signup(meta=None, provider="phone")),
      {"meta": "wholesaler", "profile": "wholesaler"})

# 4. Google's own claims must survive
uid = signup(meta={"name": "Parash", "picture": "http://x", "email_verified": True})
meta = db.execute("select raw_user_meta_data from auth.users where id=%s", (uid,)).fetchone()[0]
check("Google's name/picture claims are kept, not overwritten",
      {k: meta.get(k) for k in ("name", "picture", "role")},
      {"name": "Parash", "picture": "http://x", "role": "wholesaler"})

# 5. Changing the role later (an admin fixing a mis-signup) syncs across
uid = signup(meta={"name": "Someone"})
db.execute("update public.profiles set role='retailer' where id=%s", (uid,))
check("changing profiles.role carries into auth metadata",
      state(uid), {"meta": "retailer", "profile": "retailer"})

# 6. Unrelated profile edits don't touch metadata
uid = signup(meta={"role": "retailer"})
db.execute("update public.profiles set email='new@x.com' where id=%s", (uid,))
check("editing something else on the profile leaves the role alone",
      state(uid), {"meta": "retailer", "profile": "retailer"})

# 7. Re-running the migration is safe
db.execute(MIGRATION.read_text())
check("re-running the migration still behaves",
      state(signup(meta={"name": "Again"})),
      {"meta": "wholesaler", "profile": "wholesaler"})

# 8. Nobody ends up out of step
out = db.execute("""select count(*) from auth.users u join public.profiles p on p.id=u.id
                     where coalesce(u.raw_user_meta_data->>'role','') is distinct from coalesce(p.role,'')""").fetchone()[0]
check("no user is left with the two out of step (except the pre-fix one)", out, 1)

print()
print(f"{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
