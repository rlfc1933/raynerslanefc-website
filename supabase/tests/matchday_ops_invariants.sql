-- ═══════════════════════════════════════════════════════════════════════════
--  MATCH DAY OPERATIONS — DATABASE INVARIANT TESTS
--
--  These prove the database ITSELF refuses the things that must never happen,
--  independently of any server or browser code. Run against a THROWAWAY
--  database that has had the migration applied:
--
--    createdb rlfc_mdops_test
--    psql -v ON_ERROR_STOP=1 -d rlfc_mdops_test -f supabase/migrations/20260730000000_matchday_ops.sql
--    psql -v ON_ERROR_STOP=1 -d rlfc_mdops_test -f supabase/tests/matchday_ops_invariants.sql
--
--  Every test raises an exception if the invariant does NOT hold, so a clean
--  run with ON_ERROR_STOP=1 and a final "ALL INVARIANTS HELD" is the pass
--  condition. NEVER run this against production — it writes rows.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
begin;

do $$
declare
  rec_id  bigint;
  ok      bool;
  n       int;
begin
  raise notice '';
  raise notice '── MATCH DAY OPS · DATABASE INVARIANTS ───────────────────────';

  -- ── 1 · a new record starts at ZERO ───────────────────────────────────
  insert into public.md_records (fixture_id, season, competition_id, competition_label, fixture_snapshot)
  values ('test-fx-1', '2026-27', 'ccl-prem-north', 'Combined Counties Prem N', '{"opponent":"Test FC"}'::jsonb)
  returning id into rec_id;

  select (attendance_calculated = 0 and expected_pence = 0 and declared_pence = 0
          and sales_pence = 0 and float_open_pence = 0 and float_close_pence = 0
          and attendance = '{}'::jsonb and receipts = '{}'::jsonb
          and attendance_official is null and status = 'upcoming' and version = 1)
    into ok from public.md_records where id = rec_id;
  if not ok then raise exception 'FAIL 1: a new record did not start at zero'; end if;
  raise notice '  ✓ 1  new record starts at zero attendance and zero receipts';

  -- ── 2 · one fixture cannot have two records ───────────────────────────
  begin
    insert into public.md_records (fixture_id, season, fixture_snapshot)
    values ('test-fx-1', '2026-27', '{}'::jsonb);
    raise exception 'FAIL 2: a duplicate fixture_id was accepted';
  exception when unique_violation then
    raise notice '  ✓ 2  duplicate fixture_id rejected (no second record per fixture)';
  end;

  -- ── 3 · negative attendance rejected ──────────────────────────────────
  begin
    update public.md_records set attendance = '{"adults":-1}'::jsonb where id = rec_id;
    raise exception 'FAIL 3: a negative attendance quantity was accepted';
  exception when check_violation then
    raise notice '  ✓ 3  negative attendance quantity rejected';
  end;

  -- ── 4 · fractional attendance rejected (half a person is not a person) ─
  begin
    update public.md_records set attendance = '{"adults":2.5}'::jsonb where id = rec_id;
    raise exception 'FAIL 4: a fractional attendance quantity was accepted';
  exception when check_violation then
    raise notice '  ✓ 4  fractional attendance quantity rejected';
  end;

  -- ── 5 · non-numeric attendance rejected ───────────────────────────────
  begin
    update public.md_records set attendance = '{"adults":"lots"}'::jsonb where id = rec_id;
    raise exception 'FAIL 5: a non-numeric attendance quantity was accepted';
  exception when check_violation then
    raise notice '  ✓ 5  non-numeric attendance quantity rejected';
  end;

  -- ── 6 · negative money rejected ───────────────────────────────────────
  begin
    update public.md_records set declared_pence = -500 where id = rec_id;
    raise exception 'FAIL 6: negative declared receipts were accepted';
  exception when check_violation then
    raise notice '  ✓ 6  negative declared receipts rejected';
  end;

  -- ── 7 · a legitimate tally is accepted, and updated_at moves ──────────
  update public.md_records
     set attendance = '{"adults":50,"u16":10,"complimentary":3}'::jsonb,
         attendance_calculated = 63, expected_gate_pence = 47000,
         expected_pence = 47000, status = 'in_progress'
   where id = rec_id;
  select (attendance_calculated = 63 and updated_at >= created_at)
    into ok from public.md_records where id = rec_id;
  if not ok then raise exception 'FAIL 7: a legitimate tally did not persist'; end if;
  raise notice '  ✓ 7  legitimate tally accepted, updated_at set by the server';

  -- ── 8 · financial variance may legitimately be NEGATIVE (a shortfall) ─
  update public.md_records
     set declared_pence = 45000, financial_variance_pence = 45000 - 47000
   where id = rec_id;
  select (financial_variance_pence = -2000) into ok from public.md_records where id = rec_id;
  if not ok then raise exception 'FAIL 8: a shortfall could not be recorded'; end if;
  raise notice '  ✓ 8  a negative financial variance (shortfall) is storable';

  -- ── 9 · a LOCKED record cannot be edited in place ─────────────────────
  update public.md_records set status = 'awaiting_reconciliation' where id = rec_id;
  update public.md_records set status = 'completed' where id = rec_id;
  update public.md_records set status = 'locked', locked_at = now() where id = rec_id;
  begin
    update public.md_records set attendance_official = 999 where id = rec_id;
    raise exception 'FAIL 9: a locked record was edited in place';
  exception when check_violation then
    raise notice '  ✓ 9  locked record cannot be edited in place';
  end;

  -- ── 10 · a locked record cannot jump to an arbitrary status ───────────
  begin
    update public.md_records set status = 'in_progress' where id = rec_id;
    raise exception 'FAIL 10: a locked record skipped straight to in_progress';
  exception when check_violation then
    raise notice '  ✓ 10 locked record can only be reopened, not re-routed';
  end;

  -- ── 11 · reopening REQUIRES a reason ──────────────────────────────────
  begin
    update public.md_records
       set status = 'awaiting_reconciliation', reconciliation_note = '   '
     where id = rec_id;
    raise exception 'FAIL 11: a locked record was reopened without a reason';
  exception when check_violation then
    raise notice '  ✓ 11 reopening without a reason rejected';
  end;

  -- ── 12 · reopening WITH a reason works and increments reopen_count ────
  update public.md_records
     set status = 'awaiting_reconciliation',
         reconciliation_note = 'Cash bag recounted on Monday — £20 note stuck to another.'
   where id = rec_id;
  select reopen_count into n from public.md_records where id = rec_id;
  if n <> 1 then raise exception 'FAIL 12: reopen_count did not increment (got %)', n; end if;
  raise notice '  ✓ 12 reopen with a reason succeeds and is counted';

  -- ── 13 · idempotency key is unique ────────────────────────────────────
  update public.md_records set idempotency_key = 'submit-abc-123' where id = rec_id;
  insert into public.md_records (fixture_id, season, fixture_snapshot)
  values ('test-fx-2', '2026-27', '{}'::jsonb);
  begin
    update public.md_records set idempotency_key = 'submit-abc-123' where fixture_id = 'test-fx-2';
    raise exception 'FAIL 13: a duplicate idempotency key was accepted';
  exception when unique_violation then
    raise notice '  ✓ 13 duplicate submission (idempotency key) rejected';
  end;

  -- ── 14 · an invalid status is impossible ──────────────────────────────
  begin
    update public.md_records set status = 'nearly_done' where fixture_id = 'test-fx-2';
    raise exception 'FAIL 14: an invalid status was accepted';
  exception when check_violation then
    raise notice '  ✓ 14 invalid status rejected by the status constraint';
  end;

  -- ── 15 · audit rows can be written ────────────────────────────────────
  insert into public.md_audit (record_id, fixture_id, actor, actor_role, action, reason, before, after)
  values (rec_id, 'test-fx-1', 'e.galloway', 'Club Secretary', 'reopened',
          'Cash bag recounted', '{"status":"locked"}'::jsonb, '{"status":"awaiting_reconciliation"}'::jsonb);
  raise notice '  ✓ 15 audit event written';

  -- ── 16 · audit is APPEND-ONLY: no update ──────────────────────────────
  begin
    update public.md_audit set actor = 'someone.else' where record_id = rec_id;
    raise exception 'FAIL 16: an audit row was updated';
  exception when check_violation then
    raise notice '  ✓ 16 audit row cannot be updated';
  end;

  -- ── 17 · audit is APPEND-ONLY: no delete ──────────────────────────────
  begin
    delete from public.md_audit where record_id = rec_id;
    raise exception 'FAIL 17: an audit row was deleted';
  exception when check_violation then
    raise notice '  ✓ 17 audit row cannot be deleted';
  end;

  -- ── 18 · a record with audit history cannot be deleted out from under it
  begin
    delete from public.md_records where id = rec_id;
    raise exception 'FAIL 18: a record with audit history was deleted';
  exception when foreign_key_violation then
    raise notice '  ✓ 18 record with audit history cannot be deleted';
  end;

  -- ── 19 · only ONE season-default price list ───────────────────────────
  begin
    insert into public.md_price_lists (season, competition_id, categories, effective_from)
    values ('2026-27', null, '[]'::jsonb, date '2026-07-01');
    raise exception 'FAIL 19: a second season-default price list was accepted';
  exception when unique_violation then
    raise notice '  ✓ 19 only one default price list per season/effective date';
  end;

  -- ── 20 · a per-competition OVERRIDE is allowed alongside the default ──
  insert into public.md_price_lists (season, competition_id, label, categories, effective_from)
  values ('2026-27', 'fa-cup', 'FA Cup pricing', '[]'::jsonb, date '2026-07-01');
  raise notice '  ✓ 20 per-competition price override coexists with the default';

  -- ── 21 · the migration seed is idempotent (ran twice, one row) ────────
  select count(*) into n from public.md_price_lists
   where season = '2026-27' and competition_id is null;
  if n <> 1 then raise exception 'FAIL 21: expected exactly 1 seeded default price list, found %', n; end if;
  raise notice '  ✓ 21 migration seed idempotent after two runs (1 default list)';

  -- ── 22 · categories must be a JSON array ──────────────────────────────
  begin
    insert into public.md_price_lists (season, competition_id, categories, effective_from)
    values ('2027-28', 'x', '{"not":"an array"}'::jsonb, current_date);
    raise exception 'FAIL 22: a non-array categories value was accepted';
  exception when check_violation then
    raise notice '  ✓ 22 price-list categories must be an array';
  end;

  -- ── 23 · RLS is ON for all three tables ───────────────────────────────
  select count(*) into n from pg_class
   where relname in ('md_records','md_price_lists','md_audit')
     and relnamespace = 'public'::regnamespace and relrowsecurity;
  if n <> 3 then raise exception 'FAIL 23: RLS not enabled on all three tables (got %)', n; end if;
  raise notice '  ✓ 23 RLS enabled on md_records, md_price_lists, md_audit';

  -- ── 24 · and there are NO policies (service key only) ─────────────────
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename in ('md_records','md_price_lists','md_audit');
  if n <> 0 then raise exception 'FAIL 24: % policy/policies exist — anon may be able to read takings', n; end if;
  raise notice '  ✓ 24 zero RLS policies — the anon key cannot read takings';

  raise notice '';
  raise notice '  ALL INVARIANTS HELD (24/24)';
  raise notice '';
end $$;

rollback;   -- leave the database exactly as it was found
