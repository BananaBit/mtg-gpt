-- Migration: 002_collection_indexes.sql
-- Create necessary performance and uniqueness indexes.

create index if not exists collection_imports_file_hash_idx
on public.collection_imports (file_hash)
where status = 'completed';

create unique index if not exists owned_cards_ownership_key_idx
on public.owned_cards (ownership_key);

create index if not exists owned_cards_name_idx
on public.owned_cards (lower(name))
where archived_at is null;

create index if not exists owned_cards_scryfall_id_idx
on public.owned_cards (scryfall_id)
where archived_at is null;

create index if not exists owned_cards_location_idx
on public.owned_cards (location)
where archived_at is null;
