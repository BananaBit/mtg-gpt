-- Migration: 001_collection_schema.sql
-- Create collection_imports and owned_cards tables with Row Level Security.

create table if not exists public.collection_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  filename text,
  file_hash text,
  status text not null
    check (
      status in (
        'processing',
        'completed',
        'failed',
        'rejected',
        'unchanged'
      )
    ),
  initiated_by text not null default 'gpt_action',
  source_rows integer not null default 0,
  normalized_entries integer not null default 0,
  total_copies integer not null default 0,
  inserted_entries integer not null default 0,
  updated_entries integer not null default 0,
  unchanged_entries integer not null default 0,
  archived_entries integer not null default 0,
  warning_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.owned_cards (
  id uuid primary key default gen_random_uuid(),
  ownership_key text not null,
  scryfall_id uuid,
  oracle_id uuid,
  name text not null,
  set_code text,
  collector_number text,
  quantity integer not null
    check (quantity > 0),
  finish text not null default 'nonfoil'
    check (
      finish in (
        'nonfoil',
        'foil',
        'etched'
      )
    ),
  language text not null default 'en',
  condition text,
  location text not null default 'Unassigned',
  first_seen_import_id uuid
    references public.collection_imports(id),
  last_seen_import_id uuid not null
    references public.collection_imports(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.collection_imports enable row level security;
alter table public.owned_cards enable row level security;
