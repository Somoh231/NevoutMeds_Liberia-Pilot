-- Phase 3 — document storage.
--
-- The app uploads to a `documents` bucket that no migration ever created, so
-- document upload failed against a fresh project. This creates the bucket
-- (private) and scopes access to the owning pharmacy: every object must live
-- under a `<pharmacy_id>/` prefix, and only owners/admins of that pharmacy may
-- write. Guarded so the migration is a no-op on a plain Postgres database
-- without Supabase Storage (the local test harness).
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documents', 'documents', false, 26214400,
          array['application/pdf','image/png','image/jpeg','image/webp',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$drop policy if exists documents_objects_select on storage.objects$p$;
  execute $p$drop policy if exists documents_objects_insert on storage.objects$p$;
  execute $p$drop policy if exists documents_objects_update on storage.objects$p$;
  execute $p$drop policy if exists documents_objects_delete on storage.objects$p$;

  -- The first path segment is the pharmacy id: "<pharmacy_id>/<file>".
  execute $p$
    create policy documents_objects_select on storage.objects for select to authenticated
    using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select private.pharmacy_id())::text)
  $p$;
  execute $p$
    create policy documents_objects_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'documents'
      and (storage.foldername(name))[1] = (select private.pharmacy_id())::text
      and (select private.is_owner())
    )
  $p$;
  execute $p$
    create policy documents_objects_update on storage.objects for update to authenticated
    using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select private.pharmacy_id())::text and (select private.is_owner()))
    with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select private.pharmacy_id())::text)
  $p$;
  execute $p$
    create policy documents_objects_delete on storage.objects for delete to authenticated
    using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select private.pharmacy_id())::text and (select private.is_owner()))
  $p$;
end $$;
