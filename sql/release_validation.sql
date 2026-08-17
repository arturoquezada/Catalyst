-- CATALYST RELEASE VALIDATION - READ ONLY
select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'catalyst_add_candidate_to_job',
    'catalyst_move_application_stage',
    'catalyst_schedule_interview',
    'catalyst_set_interview_status',
    'catalyst_save_stage_review',
    'catalyst_create_offer',
    'catalyst_add_offer_version',
    'catalyst_set_offer_status',
    'catalyst_create_hire_from_offer',
    'catalyst_provision_hire_to_impulse',
    'catalyst_mark_hire_started',
    'catalyst_approve_requisition',
    'catalyst_return_requisition',
    'catalyst_reject_requisition'
  )
order by routine_name;

select 'open_jobs' metric,count(*) value from public.jobs where status='open'::public.ats_job_status
union all
select 'active_applications',count(*) from public.applications where status='active'::public.ats_app_status
union all
select 'offers',count(*) from public.offers
union all
select 'hires',count(*) from public.hires;
