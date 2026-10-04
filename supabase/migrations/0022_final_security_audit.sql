-- Final pre-pilot security audit (2026-10-04). PROPOSED — not applied to production
-- until the owner authorises it (see FINAL_SECURITY_AUDIT_REPORT.md, SA-01..SA-04).
--
-- Additive and behaviour-preserving for the app; four tightenings:
--
--   SA-01 (P1) Customer money fields are server-maintained. credit_balance,
--         total_spend, visit_count and last_visit are written only by the hardened
--         sale RPCs (SECURITY DEFINER). Until now any pharmacy member could PATCH
--         them through PostgREST (e.g. zero a customer's debt with no audit trail).
--         No app screen or import writes these columns.
--   SA-02 (P2) Idempotent RPCs authorise BEFORE a replay returns a stored result,
--         and a key can only replay the same kind of action. Until now a replay
--         answered with the first attempt's result (purchase id, stock level) to
--         any caller presenting that pharmacy id and key, even another tenant, a
--         suspended account or an aal1 session.
--   SA-03 (P2) Pending invitations die with their inviter's authority. When an
--         account is suspended/removed or loses staff.invite, the invitations it
--         issued are revoked (an owner-role invitation could otherwise outlive the
--         owner who issued it).
--   SA-04 (P3) TRUNCATE / TRIGGER / REFERENCES are revoked from authenticated on
--         every public table (0011 did this, but later tables — staff_audit_log,
--         staff_invitations, mutation_receipts, security_events … — got Supabase's
--         default grants back). Not reachable through PostgREST today; hygiene.
--
-- Rollback: roll forward. To undo SA-01 re-grant table-level insert/update on
-- public.customers to authenticated; SA-02 restore 0017's claim_idempotency body;
-- SA-03 drop trigger users_profiles_revoke_invitations. Nothing here drops data.

-- ── SA-01: customer money fields ───────────────────────────────────────────
revoke insert, update on public.customers from authenticated;
grant insert (id, pharmacy_id, phone, first_name, last_name, community, landmark, county,
              credit_limit, notes, created_at, updated_at, alt_phone, alt_name, dob, gender,
              registered_at, conditions, allergies)
  on public.customers to authenticated;
-- pharmacy_id stays updatable because PostgREST upserts (spreadsheet import) SET every
-- payload column; RLS with-check still pins it to the caller's own pharmacy.
grant update (pharmacy_id, phone, first_name, last_name, community, landmark, county,
              credit_limit, notes, updated_at, alt_phone, alt_name, dob, gender,
              registered_at, conditions, allergies)
  on public.customers to authenticated;

-- ── SA-02: authorise before replay; a key replays only its own action ──────
create or replace function private.claim_idempotency(
  p_pharmacy_id uuid, p_user uuid, p_key text, p_type text,
  out is_replay boolean, out previous_result jsonb
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_type text;
begin
  -- The caller must be an active, sufficiently authenticated member of the
  -- pharmacy named in the request — checked before anything is claimed or
  -- returned, so a replay can never answer another tenant, a suspended account
  -- or a session that has not passed two-step verification.
  if p_pharmacy_id is null or private.pharmacy_id() is distinct from p_pharmacy_id then
    raise exception 'pharmacy mismatch' using errcode = '42501';
  end if;

  if p_key is null or length(p_key) < 8 then
    -- No key supplied: the caller accepts at-least-once semantics.
    is_replay := false; previous_result := null; return;
  end if;

  begin
    insert into public.mutation_receipts (pharmacy_id, user_id, idempotency_key, mutation_type)
    values (p_pharmacy_id, p_user, p_key, p_type);
    is_replay := false; previous_result := null;
  exception when unique_violation then
    select r.result, r.mutation_type into previous_result, v_type
    from public.mutation_receipts r
    where r.pharmacy_id = p_pharmacy_id and r.idempotency_key = p_key;
    if v_type is distinct from p_type then
      raise exception 'idempotency key already used for a different action' using errcode = '22023';
    end if;
    is_replay := true;
  end;
end $$;

-- ── SA-03: invitations follow their inviter's authority ────────────────────
create or replace function private.revoke_invitations_of_inactive_inviter()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'active'
     or not exists (select 1 from private.role_capabilities rc
                    where rc.role = new.role and rc.capability = 'staff.invite') then
    update public.staff_invitations
       set revoked_at = now(), revoked_by = coalesce(auth.uid(), new.id)
     where invited_by = new.id and accepted_at is null and revoked_at is null;
  end if;
  return null;
end $$;

drop trigger if exists users_profiles_revoke_invitations on public.users_profiles;
create trigger users_profiles_revoke_invitations
  after update of status, role on public.users_profiles
  for each row
  when (old.status is distinct from new.status or old.role is distinct from new.role)
  execute function private.revoke_invitations_of_inactive_inviter();

-- Invitations already issued by accounts that no longer hold that authority.
update public.staff_invitations i
   set revoked_at = now()
 where i.accepted_at is null and i.revoked_at is null
   and not exists (select 1 from public.users_profiles up
                   join private.role_capabilities rc on rc.role = up.role and rc.capability = 'staff.invite'
                   where up.id = i.invited_by and up.status = 'active');

-- ── SA-04: no TRUNCATE / TRIGGER / REFERENCES for API roles ────────────────
revoke truncate, references, trigger on all tables in schema public from authenticated, anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated, anon;

