-- Run once in Supabase SQL editor
create table if not exists pipeline_jobs (
  id text primary key,
  booking_id text,
  status text not null default 'intake',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pipeline_jobs_booking_id_idx on pipeline_jobs (booking_id);
create index if not exists pipeline_jobs_status_idx on pipeline_jobs (status);
create index if not exists pipeline_jobs_created_at_idx on pipeline_jobs (created_at desc);
