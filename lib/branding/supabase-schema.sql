-- Separate from pipeline_jobs (Make.com flow). Run once in Supabase SQL editor.
create table if not exists branding_jobs (
  id text primary key,
  status text not null default 'pending',
  city text not null default '',
  street text not null default '',
  agency_id text not null default '',
  agent_id text not null default '',
  title text,
  property_type text,
  notes text,
  created_by text,
  originals jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  error text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists branding_jobs_status_idx on branding_jobs (status);
create index if not exists branding_jobs_created_at_idx on branding_jobs (created_at desc);
create index if not exists branding_jobs_agent_id_idx on branding_jobs (agent_id);
