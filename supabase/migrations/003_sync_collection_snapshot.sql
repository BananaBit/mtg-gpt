-- Migration: 003_sync_collection_snapshot.sql
-- Create sync_collection_snapshot RPC function for atomic snapshot synchronization.

create or replace function public.sync_collection_snapshot(
  p_import_id uuid,
  p_entries jsonb
) returns jsonb as $$
declare
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_archived integer := 0;
  v_total_copies integer := 0;
  v_normalized_entries integer := 0;
  entry record;
  v_existing_id uuid;
  v_existing_qty integer;
  v_existing_last_import uuid;
  v_existing_archived_at timestamptz;
begin
  -- Loop through each entry in p_entries JSONB array
  for entry in 
    select 
      (val->>'ownership_key')::text as ownership_key,
      nullif(val->>'scryfall_id', '')::uuid as scryfall_id,
      nullif(val->>'oracle_id', '')::uuid as oracle_id,
      (val->>'name')::text as name,
      (val->>'set_code')::text as set_code,
      (val->>'collector_number')::text as collector_number,
      (val->>'quantity')::integer as quantity,
      (val->>'finish')::text as finish,
      (val->>'language')::text as language,
      (val->>'condition')::text as condition,
      (val->>'location')::text as location
    from jsonb_array_elements(p_entries) as val
  loop
    v_normalized_entries := v_normalized_entries + 1;
    v_total_copies := v_total_copies + entry.quantity;

    -- Lookup existing active or archived card with this ownership key
    select id, quantity, last_seen_import_id, archived_at
    into v_existing_id, v_existing_qty, v_existing_last_import, v_existing_archived_at
    from public.owned_cards
    where ownership_key = entry.ownership_key
    limit 1;

    if v_existing_id is null then
      -- Insert a new ownership entry
      insert into public.owned_cards (
        ownership_key,
        scryfall_id,
        oracle_id,
        name,
        set_code,
        collector_number,
        quantity,
        finish,
        language,
        condition,
        location,
        first_seen_import_id,
        last_seen_import_id
      ) values (
        entry.ownership_key,
        entry.scryfall_id,
        entry.oracle_id,
        entry.name,
        entry.set_code,
        entry.collector_number,
        entry.quantity,
        entry.finish,
        entry.language,
        entry.condition,
        entry.location,
        p_import_id,
        p_import_id
      );
      v_inserted := v_inserted + 1;
    else
      -- Check if quantity or archive status changed
      if v_existing_qty = entry.quantity and v_existing_archived_at is null then
        -- Unchanged except last_seen_import_id
        update public.owned_cards
        set scryfall_id = entry.scryfall_id,
            oracle_id = entry.oracle_id,
            name = entry.name,
            set_code = entry.set_code,
            collector_number = entry.collector_number,
            finish = entry.finish,
            language = entry.language,
            condition = entry.condition,
            location = entry.location,
            last_seen_import_id = p_import_id,
            updated_at = now()
        where id = v_existing_id;
        v_unchanged := v_unchanged + 1;
      else
        -- Updated quantity or unarchived
        update public.owned_cards
        set quantity = entry.quantity,
            scryfall_id = entry.scryfall_id,
            oracle_id = entry.oracle_id,
            name = entry.name,
            set_code = entry.set_code,
            collector_number = entry.collector_number,
            finish = entry.finish,
            language = entry.language,
            condition = entry.condition,
            location = entry.location,
            last_seen_import_id = p_import_id,
            archived_at = null,
            updated_at = now()
        where id = v_existing_id;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  -- Archive active entries not present in this import snapshot
  update public.owned_cards
  set archived_at = now(),
      updated_at = now()
  where archived_at is null
    and last_seen_import_id <> p_import_id;
  
  get diagnostics v_archived = row_count;

  -- Update collection_imports record status to completed
  update public.collection_imports
  set status = 'completed',
      normalized_entries = v_normalized_entries,
      total_copies = v_total_copies,
      inserted_entries = v_inserted,
      updated_entries = v_updated,
      unchanged_entries = v_unchanged,
      archived_entries = v_archived,
      completed_at = now()
  where id = p_import_id;

  return jsonb_build_object(
    'success', true,
    'status', 'completed',
    'import_id', p_import_id,
    'source_rows', v_normalized_entries, -- will be mapped in service if needed
    'normalized_entries', v_normalized_entries,
    'total_copies', v_total_copies,
    'inserted_entries', v_inserted,
    'updated_entries', v_updated,
    'unchanged_entries', v_unchanged,
    'archived_entries', v_archived
  );
end;
$$ language plpgsql;
