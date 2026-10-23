-- Home Hire: homeowner capture flow (Phase 1, browser-based)
-- Multi-contractor from day one. Comfort Air is contractor #1.

create extension if not exists "pgcrypto";

-- Contractors using the platform
create table public.contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  license_number text,
  home_zip text,                      -- e.g. 95112, used for far-zone trip charge
  created_at timestamptz not null default now()
);

-- People who run a contractor's account (Tommy, office staff)
create table public.contractor_users (
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'estimator')),
  primary key (contractor_id, user_id)
);

-- One job = one homeowner request for a quote
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id),
  status text not null default 'capturing'
    check (status in ('capturing', 'submitted', 'in_review', 'quoted', 'signed', 'declined')),
  job_type text check (job_type in ('ducted_heat_pump', 'ductless', 'heat_pump_water_heater')),
  -- homeowner contact
  first_name text,
  last_name text,
  phone text,
  email text,
  street text,
  city text,
  zip text,
  -- quick answers from the guided flow
  stories int,
  square_feet int,
  year_built int,
  indoor_location text check (indoor_location in
    ('garage', 'closet', 'attic_easy', 'attic_tight', 'crawlspace', 'basement', 'rooftop', 'other')),
  outdoor_location text check (outdoor_location in
    ('side_yard_left', 'side_yard_right', 'backyard', 'front_yard', 'roof', 'none', 'other')),
  steps_condenser_to_indoor int,      -- homeowner counts steps while filming
  steps_indoor_to_panel int,
  supply_register_count int,
  return_count int,
  service_lines text check (service_lines in ('overhead', 'underground', 'unsure')),
  notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Every photo or video the homeowner uploads
create table public.job_media (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  step text not null check (step in (
    'outdoor_unit', 'outdoor_data_plate', 'line_set_route',
    'indoor_unit', 'indoor_data_plate', 'hatch_or_closet_measurement',
    'panel_video', 'panel', 'panel_label', 'service_lines', 'return_grille',
    'walkthrough', 'water_heater', 'other')),
  kind text not null check (kind in ('photo', 'video')),
  storage_path text not null,         -- path in the job-media bucket
  ai_status text not null default 'pending'
    check (ai_status in ('pending', 'ok', 'retake_needed', 'unreadable')),
  ai_extracted jsonb,                 -- e.g. { brand, model, serial, tonnage, panel_amps }
  created_at timestamptz not null default now()
);

create index on public.jobs (contractor_id, status);
create index on public.job_media (job_id);

-- Row level security: homeowners can create and add to a job but never read
-- anyone's data back. Contractor staff can read and update only their own jobs.
alter table public.contractors enable row level security;
alter table public.contractor_users enable row level security;
alter table public.jobs enable row level security;
alter table public.job_media enable row level security;

create policy "staff read own contractor" on public.contractors
  for select to authenticated
  using (id in (select contractor_id from public.contractor_users where user_id = auth.uid()));

create policy "staff read own membership" on public.contractor_users
  for select to authenticated
  using (user_id = auth.uid());

create policy "homeowner creates job" on public.jobs
  for insert to anon
  with check (status = 'capturing');

create policy "staff read own jobs" on public.jobs
  for select to authenticated
  using (contractor_id in (select contractor_id from public.contractor_users where user_id = auth.uid()));

create policy "staff update own jobs" on public.jobs
  for update to authenticated
  using (contractor_id in (select contractor_id from public.contractor_users where user_id = auth.uid()));

create policy "homeowner adds media" on public.job_media
  for insert to anon
  with check (true);

create policy "staff read own media" on public.job_media
  for select to authenticated
  using (job_id in (
    select j.id from public.jobs j
    join public.contractor_users cu on cu.contractor_id = j.contractor_id
    where cu.user_id = auth.uid()));

-- Homeowner updates (answers, final submit) go through this function so the
-- homeowner never needs read access to the jobs table.
create or replace function public.update_job_answers(p_job_id uuid, p_answers jsonb, p_submit boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs set
    job_type                  = coalesce(p_answers->>'job_type', job_type),
    first_name                = coalesce(p_answers->>'first_name', first_name),
    last_name                 = coalesce(p_answers->>'last_name', last_name),
    phone                     = coalesce(p_answers->>'phone', phone),
    email                     = coalesce(p_answers->>'email', email),
    street                    = coalesce(p_answers->>'street', street),
    city                      = coalesce(p_answers->>'city', city),
    zip                       = coalesce(p_answers->>'zip', zip),
    stories                   = coalesce(nullif(p_answers->>'stories', '')::int, stories),
    square_feet               = coalesce(nullif(p_answers->>'square_feet', '')::int, square_feet),
    year_built                = coalesce(nullif(p_answers->>'year_built', '')::int, year_built),
    indoor_location           = coalesce(p_answers->>'indoor_location', indoor_location),
    outdoor_location          = coalesce(p_answers->>'outdoor_location', outdoor_location),
    steps_condenser_to_indoor = coalesce(nullif(p_answers->>'steps_condenser_to_indoor', '')::int, steps_condenser_to_indoor),
    steps_indoor_to_panel     = coalesce(nullif(p_answers->>'steps_indoor_to_panel', '')::int, steps_indoor_to_panel),
    supply_register_count     = coalesce(nullif(p_answers->>'supply_register_count', '')::int, supply_register_count),
    return_count              = coalesce(nullif(p_answers->>'return_count', '')::int, return_count),
    service_lines             = coalesce(p_answers->>'service_lines', service_lines),
    notes                     = coalesce(p_answers->>'notes', notes),
    status       = case when p_submit then 'submitted' else status end,
    submitted_at = case when p_submit then now() else submitted_at end
  where id = p_job_id and status = 'capturing';
end;
$$;

grant execute on function public.update_job_answers(uuid, jsonb, boolean) to anon;

-- Private storage bucket for photos and videos (50 MB per file, the free-plan limit; keep clips under ~30 seconds)
insert into storage.buckets (id, name, public, file_size_limit)
values ('job-media', 'job-media', false, 52428800);

create policy "homeowner uploads to job folder" on storage.objects
  for insert to anon
  with check (bucket_id = 'job-media' and (storage.foldername(name))[1] = 'jobs');

create policy "staff view own job media files" on storage.objects
  for select to authenticated
  using (bucket_id = 'job-media' and (storage.foldername(name))[2] in (
    select j.id::text from public.jobs j
    join public.contractor_users cu on cu.contractor_id = j.contractor_id
    where cu.user_id = auth.uid()));

-- Contractor #1
insert into public.contractors (name, home_zip) values ('Comfort Air Heating & Air Conditioning', '95112');

-- Added later (applied as migrations): panel video step, door opening measurements.
-- alter table public.jobs add column door_width_in numeric, add column door_height_in numeric;
-- job_media.step also allows 'panel_video' and 'door_width_measurement'.
