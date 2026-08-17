begin;

-- =========================================================
-- CATALYST RELEASE BACKEND
-- Missing operational RPCs for Recruiting launch candidate.
-- Existing RPCs (requisition approval / hire / provisioning) are reused.
-- =========================================================

-- ---------------------------------------------------------
-- 1. ADD CANDIDATE TO JOB
-- ---------------------------------------------------------
create or replace function public.catalyst_add_candidate_to_job(
  p_job_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_job public.jobs%rowtype;
  v_candidate_id uuid;
  v_application_id uuid;
  v_stage_id uuid;
  v_email text;
  v_phone text;
begin
  if not (public.is_ats_admin() or public.is_ats_ta()) then
    raise exception 'Only Talent Acquisition or Head of People can add candidates.';
  end if;

  v_actor := public.current_empleado_id_by_email();
  if v_actor is null then raise exception 'Catalyst could not resolve your employee identity.'; end if;

  if nullif(trim(coalesce(p_full_name,'')),'') is null then
    raise exception 'Candidate full name is required.';
  end if;

  v_email := lower(nullif(trim(coalesce(p_email,'')),''));
  v_phone := nullif(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'),'');
  if v_email is null and v_phone is null then
    raise exception 'Email or phone is required.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for share;
  if not found then raise exception 'Job does not exist.'; end if;
  if v_job.status not in ('open'::public.ats_job_status,'paused'::public.ats_job_status) then
    raise exception 'Candidates can only be added to open or paused jobs.';
  end if;

  select c.id into v_candidate_id
  from public.candidates c
  where (v_email is not null and lower(c.email)=v_email)
     or (v_phone is not null and regexp_replace(coalesce(c.phone,''),'[^0-9+]','','g')=v_phone)
  order by c.created_at asc
  limit 1;

  if v_candidate_id is null then
    insert into public.candidates(full_name,email,phone,source,created_by)
    values(trim(p_full_name),v_email,v_phone,coalesce(nullif(trim(p_source),''),'manual'),v_actor)
    returning id into v_candidate_id;
  end if;

  select a.id into v_application_id
  from public.applications a
  where a.candidate_id=v_candidate_id and a.job_id=p_job_id and a.status='active'::public.ats_app_status
  limit 1;

  if v_application_id is not null then
    return jsonb_build_object('ok',true,'already_exists',true,'candidate_id',v_candidate_id,'application_id',v_application_id);
  end if;

  select s.id into v_stage_id
  from public.stages s
  where s.pipeline_id=v_job.pipeline_id
  order by s.stage_order asc
  limit 1;

  insert into public.applications(candidate_id,job_id,status,current_stage_id,owner_ta_id)
  values(v_candidate_id,p_job_id,'active'::public.ats_app_status,v_stage_id,v_actor)
  returning id into v_application_id;

  insert into public.application_events(application_id,event_type,from_stage_id,to_stage_id,notes,actor_id)
  values(v_application_id,'application_created',null,v_stage_id,'Candidate added to job in Catalyst.',v_actor);

  return jsonb_build_object('ok',true,'already_exists',false,'candidate_id',v_candidate_id,'application_id',v_application_id,'stage_id',v_stage_id);
end;
$$;

revoke all on function public.catalyst_add_candidate_to_job(uuid,text,text,text,text) from public;
grant execute on function public.catalyst_add_candidate_to_job(uuid,text,text,text,text) to authenticated;

-- ---------------------------------------------------------
-- 2. MOVE APPLICATION BETWEEN STAGES
-- ---------------------------------------------------------
create or replace function public.catalyst_move_application_stage(
  p_application_id uuid,
  p_to_stage_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_app public.applications%rowtype;
  v_job public.jobs%rowtype;
  v_from public.stages%rowtype;
  v_to public.stages%rowtype;
  v_review_ok boolean := true;
begin
  if not (public.is_ats_admin() or public.is_ats_ta()) then raise exception 'Not authorized to move candidates.'; end if;
  v_actor := public.current_empleado_id_by_email();
  if v_actor is null then raise exception 'Catalyst could not resolve your employee identity.'; end if;

  select * into v_app from public.applications where id=p_application_id for update;
  if not found then raise exception 'Application does not exist.'; end if;
  if v_app.status <> 'active'::public.ats_app_status then raise exception 'Only active applications can move stages.'; end if;

  select * into v_job from public.jobs where id=v_app.job_id;
  select * into v_to from public.stages where id=p_to_stage_id;
  if not found then raise exception 'Target stage does not exist.'; end if;
  if v_to.pipeline_id <> v_job.pipeline_id then raise exception 'Target stage does not belong to this job pipeline.'; end if;

  if v_app.current_stage_id = p_to_stage_id then
    return jsonb_build_object('ok',true,'unchanged',true,'application_id',v_app.id,'stage_id',p_to_stage_id);
  end if;

  if v_app.current_stage_id is not null then
    select * into v_from from public.stages where id=v_app.current_stage_id;

    if coalesce(v_from.requires_feedback,false) or coalesce(v_from.requires_notes,false)
       or coalesce(v_from.requires_score,false) or coalesce(v_from.requires_decision,false) then
      select exists(
        select 1 from public.application_stage_reviews r
        where r.application_id=v_app.id and r.stage_id=v_from.id
          and (not coalesce(v_from.requires_notes,false) or nullif(trim(coalesce(r.notes,'')),'') is not null)
          and (not coalesce(v_from.requires_score,false) or r.score is not null)
          and (not coalesce(v_from.requires_decision,false) or nullif(trim(coalesce(r.decision,'')),'') is not null)
      ) into v_review_ok;
      if not v_review_ok then
        raise exception 'Current stage requires feedback before the candidate can move forward.';
      end if;
    end if;

    if coalesce(v_from.requires_documents,false) and not exists(
      select 1 from public.application_documents d where d.application_id=v_app.id and d.file_url is not null
    ) then
      raise exception 'Current stage requires at least one uploaded document before moving forward.';
    end if;
  end if;

  update public.applications set current_stage_id=p_to_stage_id,updated_at=now() where id=v_app.id;
  insert into public.application_events(application_id,event_type,from_stage_id,to_stage_id,notes,actor_id)
  values(v_app.id,'stage_changed',v_app.current_stage_id,p_to_stage_id,nullif(trim(coalesce(p_notes,'')),''),v_actor);

  return jsonb_build_object('ok',true,'application_id',v_app.id,'from_stage_id',v_app.current_stage_id,'to_stage_id',p_to_stage_id);
end;
$$;

revoke all on function public.catalyst_move_application_stage(uuid,uuid,text) from public;
grant execute on function public.catalyst_move_application_stage(uuid,uuid,text) to authenticated;

-- ---------------------------------------------------------
-- 3. SCHEDULE / UPDATE INTERVIEW
-- ---------------------------------------------------------
create or replace function public.catalyst_schedule_interview(
  p_application_id uuid,
  p_stage_id uuid,
  p_interviewer_id uuid,
  p_scheduled_at timestamptz,
  p_interview_type text default 'TA Interview'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_interview_id uuid;
  v_app public.applications%rowtype;
  v_job public.jobs%rowtype;
begin
  if not (public.is_ats_admin() or public.is_ats_ta()) then raise exception 'Not authorized to schedule interviews.'; end if;
  v_actor:=public.current_empleado_id_by_email();
  if v_actor is null then raise exception 'Catalyst could not resolve your employee identity.'; end if;
  if p_scheduled_at is null then raise exception 'Interview date and time are required.'; end if;

  select * into v_app from public.applications where id=p_application_id;
  if not found then raise exception 'Application does not exist.'; end if;
  select * into v_job from public.jobs where id=v_app.job_id;
  if not exists(select 1 from public.stages s where s.id=p_stage_id and s.pipeline_id=v_job.pipeline_id) then
    raise exception 'Stage does not belong to this job pipeline.';
  end if;
  if not exists(select 1 from public.empleados e where e.id=p_interviewer_id) then raise exception 'Interviewer does not exist.'; end if;

  insert into public.interviews(application_id,interview_type,interviewer_id,scheduled_at,status,created_by,stage_id)
  values(v_app.id,coalesce(nullif(trim(p_interview_type),''),'TA Interview'),p_interviewer_id,p_scheduled_at,'scheduled'::public.ats_interview_status,v_actor,p_stage_id)
  on conflict (application_id,stage_id)
  do update set interviewer_id=excluded.interviewer_id,scheduled_at=excluded.scheduled_at,interview_type=excluded.interview_type,status='scheduled'::public.ats_interview_status
  returning id into v_interview_id;

  insert into public.application_stage_assignments(application_id,stage_id,interviewer_id,assigned_by,notes)
  values(v_app.id,p_stage_id,p_interviewer_id,v_actor,'Interview assignment from Catalyst.')
  on conflict (application_id,stage_id)
  do update set interviewer_id=excluded.interviewer_id,assigned_by=excluded.assigned_by,assigned_at=now();

  insert into public.application_events(application_id,event_type,from_stage_id,to_stage_id,notes,actor_id)
  values(v_app.id,'interview_scheduled',v_app.current_stage_id,v_app.current_stage_id,'Interview scheduled from Catalyst.',v_actor);

  return jsonb_build_object('ok',true,'interview_id',v_interview_id);
end;
$$;

revoke all on function public.catalyst_schedule_interview(uuid,uuid,uuid,timestamptz,text) from public;
grant execute on function public.catalyst_schedule_interview(uuid,uuid,uuid,timestamptz,text) to authenticated;

create or replace function public.catalyst_set_interview_status(
  p_interview_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_int public.interviews%rowtype;
begin
  if not (public.is_ats_admin() or public.is_ats_ta()) then raise exception 'Not authorized to update interviews.'; end if;
  if p_status not in ('scheduled','completed','no_show','cancelled') then raise exception 'Invalid interview status.'; end if;
  v_actor:=public.current_empleado_id_by_email();
  select * into v_int from public.interviews where id=p_interview_id for update;
  if not found then raise exception 'Interview does not exist.'; end if;

  update public.interviews set status=p_status::public.ats_interview_status where id=v_int.id;
  insert into public.application_events(application_id,event_type,from_stage_id,to_stage_id,notes,actor_id)
  values(v_int.application_id,'interview_'||p_status,null,null,'Interview status updated to '||p_status||'.',v_actor);
  return jsonb_build_object('ok',true,'interview_id',v_int.id,'status',p_status);
end;
$$;

revoke all on function public.catalyst_set_interview_status(uuid,text) from public;
grant execute on function public.catalyst_set_interview_status(uuid,text) to authenticated;

-- ---------------------------------------------------------
-- 4. SAVE STAGE REVIEW / FEEDBACK
-- ---------------------------------------------------------
create or replace function public.catalyst_save_stage_review(
  p_application_id uuid,
  p_stage_id uuid,
  p_score integer default null,
  p_decision text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_review_id uuid;
begin
  if not (public.is_ats_admin() or public.is_ats_ta()) then raise exception 'Not authorized to save feedback.'; end if;
  v_actor:=public.current_empleado_id_by_email();
  if v_actor is null then raise exception 'Catalyst could not resolve your employee identity.'; end if;
  if not exists(select 1 from public.applications where id=p_application_id) then raise exception 'Application does not exist.'; end if;
  if not exists(select 1 from public.stages where id=p_stage_id) then raise exception 'Stage does not exist.'; end if;

  insert into public.application_stage_reviews(application_id,stage_id,actor_id,score,decision,notes)
  values(p_application_id,p_stage_id,v_actor,p_score,nullif(trim(coalesce(p_decision,'')),''),nullif(trim(coalesce(p_notes,'')),''))
  on conflict (application_id,stage_id,actor_id)
  do update set score=excluded.score,decision=excluded.decision,notes=excluded.notes,created_at=now()
  returning id into v_review_id;

  insert into public.application_events(application_id,event_type,from_stage_id,to_stage_id,notes,actor_id)
  values(p_application_id,'feedback_saved',p_stage_id,p_stage_id,'Stage feedback saved.',v_actor);
  return jsonb_build_object('ok',true,'review_id',v_review_id);
end;
$$;

revoke all on function public.catalyst_save_stage_review(uuid,uuid,integer,text,text) from public;
grant execute on function public.catalyst_save_stage_review(uuid,uuid,integer,text,text) to authenticated;

-- ---------------------------------------------------------
-- 5. CREATE OFFER + FIRST VERSION
-- ---------------------------------------------------------
create or replace function public.catalyst_create_offer(
  p_application_id uuid,
  p_salary numeric,
  p_currency text default 'MXN',
  p_variable_compensation numeric default null,
  p_compensation_notes text default null,
  p_planned_start_date date default null,
  p_expiration_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_offer_id uuid;
  v_version_id uuid;
  v_existing uuid;
begin
  if not (public.is_ats_admin() or public.is_ats_ta()) then raise exception 'Not authorized to create offers.'; end if;
  v_actor:=public.current_empleado_id_by_email();
  if p_salary is null or p_salary < 0 then raise exception 'Salary is required.'; end if;
  if p_planned_start_date is null then raise exception 'Planned start date is required.'; end if;
  if not exists(select 1 from public.applications where id=p_application_id and status='active'::public.ats_app_status) then
    raise exception 'Offer requires an active application.';
  end if;

  select id into v_existing from public.offers where application_id=p_application_id;
  if v_existing is not null then return jsonb_build_object('ok',true,'already_exists',true,'offer_id',v_existing); end if;

  insert into public.offers(application_id,status,created_by)
  values(p_application_id,'draft',v_actor)
  returning id into v_offer_id;

  insert into public.offer_versions(offer_id,version_number,salary,currency,variable_compensation,compensation_notes,planned_start_date,expiration_date,created_by)
  values(v_offer_id,1,p_salary,upper(coalesce(nullif(trim(p_currency),''),'MXN')),p_variable_compensation,nullif(trim(coalesce(p_compensation_notes,'')),''),p_planned_start_date,p_expiration_date,v_actor)
  returning id into v_version_id;

  update public.offers set current_version_id=v_version_id where id=v_offer_id;
  insert into public.application_events(application_id,event_type,from_stage_id,to_stage_id,notes,actor_id)
  select a.id,'offer_created',a.current_stage_id,a.current_stage_id,'Offer created in Catalyst.',v_actor from public.applications a where a.id=p_application_id;

  return jsonb_build_object('ok',true,'already_exists',false,'offer_id',v_offer_id,'version_id',v_version_id);
end;
$$;

revoke all on function public.catalyst_create_offer(uuid,numeric,text,numeric,text,date,date) from public;
grant execute on function public.catalyst_create_offer(uuid,numeric,text,numeric,text,date,date) to authenticated;

create or replace function public.catalyst_add_offer_version(
  p_offer_id uuid,
  p_salary numeric,
  p_currency text default 'MXN',
  p_variable_compensation numeric default null,
  p_compensation_notes text default null,
  p_planned_start_date date default null,
  p_expiration_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_offer public.offers%rowtype;
  v_version integer;
  v_version_id uuid;
begin
  if not (public.is_ats_admin() or public.is_ats_ta()) then raise exception 'Not authorized to revise offers.'; end if;
  v_actor:=public.current_empleado_id_by_email();
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found then raise exception 'Offer does not exist.'; end if;
  if v_offer.status in ('accepted','declined','expired','cancelled') then raise exception 'Terminal offers cannot be revised.'; end if;
  if p_salary is null or p_salary < 0 or p_planned_start_date is null then raise exception 'Salary and planned start date are required.'; end if;

  select coalesce(max(version_number),0)+1 into v_version from public.offer_versions where offer_id=p_offer_id;
  insert into public.offer_versions(offer_id,version_number,salary,currency,variable_compensation,compensation_notes,planned_start_date,expiration_date,created_by)
  values(p_offer_id,v_version,p_salary,upper(coalesce(nullif(trim(p_currency),''),'MXN')),p_variable_compensation,nullif(trim(coalesce(p_compensation_notes,'')),''),p_planned_start_date,p_expiration_date,v_actor)
  returning id into v_version_id;

  update public.offers set current_version_id=v_version_id,status=case when status in ('sent','negotiation') then 'negotiation' else status end where id=p_offer_id;
  return jsonb_build_object('ok',true,'offer_id',p_offer_id,'version_id',v_version_id,'version_number',v_version);
end;
$$;

revoke all on function public.catalyst_add_offer_version(uuid,numeric,text,numeric,text,date,date) from public;
grant execute on function public.catalyst_add_offer_version(uuid,numeric,text,numeric,text,date,date) to authenticated;

-- ---------------------------------------------------------
-- 6. OFFER WORKFLOW; accepted automatically creates Hire.
-- ---------------------------------------------------------
create or replace function public.catalyst_set_offer_status(
  p_offer_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_offer public.offers%rowtype;
  v_hire jsonb := null;
begin
  if not (public.is_ats_admin() or public.is_ats_ta()) then raise exception 'Not authorized to update offers.'; end if;
  if p_status not in ('draft','pending_approval','ready_to_send','sent','negotiation','accepted','declined','expired','cancelled') then raise exception 'Invalid offer status.'; end if;
  v_actor:=public.current_empleado_id_by_email();
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found then raise exception 'Offer does not exist.'; end if;

  if p_status='ready_to_send' and not public.is_ats_admin() then raise exception 'Only Head of People can approve an offer.'; end if;
  if p_status='sent' and v_offer.status not in ('ready_to_send','sent') then raise exception 'Offer must be approved before it can be sent.'; end if;
  if p_status='accepted' and v_offer.status not in ('sent','negotiation','accepted') then raise exception 'Only a sent offer can be accepted.'; end if;
  if p_status='pending_approval' and v_offer.current_version_id is null then raise exception 'Offer has no current version.'; end if;

  update public.offers
  set status=p_status,
      approved_by=case when p_status='ready_to_send' then v_actor else approved_by end,
      approved_at=case when p_status='ready_to_send' then now() else approved_at end,
      sent_at=case when p_status='sent' then coalesce(sent_at,now()) else sent_at end,
      accepted_at=case when p_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,
      declined_at=case when p_status='declined' then coalesce(declined_at,now()) else declined_at end,
      expired_at=case when p_status='expired' then coalesce(expired_at,now()) else expired_at end,
      cancelled_at=case when p_status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,
      decline_reason=case when p_status='declined' then nullif(trim(coalesce(p_reason,'')),'') else decline_reason end,
      cancellation_reason=case when p_status='cancelled' then nullif(trim(coalesce(p_reason,'')),'') else cancellation_reason end,
      updated_at=now()
  where id=p_offer_id;

  insert into public.application_events(application_id,event_type,from_stage_id,to_stage_id,notes,actor_id)
  select a.id,'offer_'||p_status,a.current_stage_id,a.current_stage_id,nullif(trim(coalesce(p_reason,'')),''),v_actor
  from public.applications a where a.id=v_offer.application_id;

  if p_status='accepted' then
    v_hire := public.catalyst_create_hire_from_offer(p_offer_id);
  end if;

  return jsonb_build_object('ok',true,'offer_id',p_offer_id,'status',p_status,'hire',v_hire);
end;
$$;

revoke all on function public.catalyst_set_offer_status(uuid,text,text) from public;
grant execute on function public.catalyst_set_offer_status(uuid,text,text) to authenticated;

-- ---------------------------------------------------------
-- 7. MARK HIRE STARTED + ACTIVATE IMPULSE EMPLOYEE
-- ---------------------------------------------------------
create or replace function public.catalyst_mark_hire_started(
  p_hire_id uuid,
  p_actual_start_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hire public.hires%rowtype;
begin
  if not public.is_ats_admin() then raise exception 'Only Head of People can start a hire.'; end if;
  select * into v_hire from public.hires where id=p_hire_id for update;
  if not found then raise exception 'Hire does not exist.'; end if;
  if v_hire.employee_id is null then raise exception 'Hire must be provisioned to Impulse first.'; end if;
  if v_hire.status='cancelled' then raise exception 'Cancelled hire cannot start.'; end if;

  update public.hires set status='started',actual_start_date=coalesce(p_actual_start_date,current_date),started_at=now(),updated_at=now() where id=v_hire.id;
  update public.employees set status='active',hire_date=coalesce(p_actual_start_date,current_date),updated_at=now() where id=v_hire.employee_id;
  return jsonb_build_object('ok',true,'hire_id',v_hire.id,'employee_id',v_hire.employee_id,'status','started');
end;
$$;

revoke all on function public.catalyst_mark_hire_started(uuid,date) from public;
grant execute on function public.catalyst_mark_hire_started(uuid,date) to authenticated;

commit;
