--------------------------------------------
-- WHOLESALERS TABLE
--------------------------------------------

create table wholesalers (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  aadhaar_number text,
  aadhaar_front_url text,
  aadhaar_back_url text,
  business_name text,
  state text,
  city text,
  business_logo_url text,
  pan_card_url text,
  gst_certificate_url text,
  verification_status text default 'pending' check (verification_status in (
      'pending',
      'verified',
      'rejected',
      'on_hold',
      'resubmission_required',
      'banned'
    )),
  rejection_reason text,
  rejected_documents text[],
  admin_notes text,
  notified boolean default false,
  notification_message text,
  onboarding_step_completed integer default 0, -- Track form progress
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

--------------------------------------------
-- AUTO UPDATE updated_at ON EVERY CHANGE
--------------------------------------------

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger wholesalers_updated_at
  before update on wholesalers
  for each row
  execute function update_updated_at();

--------------------------------------------
-- ROW LEVEL SECURITY
--------------------------------------------

alter table wholesalers enable row level security;

-- Wholesaler can read only their own row
create policy "Wholesalers read own row"
  on wholesalers for select
  using (auth.uid() = id);

-- Wholesaler can insert their own row
create policy "Wholesalers insert own row"
  on wholesalers for insert
  with check (auth.uid() = id);

-- Wholesaler can update their own row (needed for resubmission/onboarding)
create policy "Wholesalers update own row"
  on wholesalers for update
  using (auth.uid() = id);

-- Storage buckets creation commands (optional info, do via UI)
-- Remember to create: aadhaar-documents, pan-documents, gst-documents, business-logos
-- and set RLS: bucket_id = '...' and auth.uid()::text = (storage.foldername(name))[1]
