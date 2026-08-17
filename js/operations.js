let activeApplicationId=null;
let activeCandidateId=null;
let activeOfferId=null;
let activeHireId=null;
let activeJobId=null;
let activeApplicationStageId=null;
let offerEditMode='create';
let offerEditOfferId=null;

async function rpc(name,args={}){
  const {data,error}=await sb.rpc(name,args);
  if(error) throw error;
  return data;
}

function openModal(id){document.getElementById(id)?.classList.add('show')}
function closeModal(id){document.getElementById(id)?.classList.remove('show')}

// ---------------------------------------------------------
// Candidate creation
// ---------------------------------------------------------
async function openAddCandidate(jobId=null){
  if(managerRoles.includes(currentRole)) return;
  const select=document.getElementById('candidateAddJob');
  openModal('candidateAddModal');
  select.innerHTML='<option value="">Loading jobs…</option>';
  const {data,error}=await sb.from('jobs').select('id,title,status').in('status',['open','paused']).order('title');
  if(error){select.innerHTML='<option value="">Could not load jobs</option>';return}
  select.innerHTML='<option value="">Select a job</option>'+data.map(j=>`<option value="${esc(j.id)}">${esc(j.title)}</option>`).join('');
  if(jobId) select.value=jobId;
}
function closeAddCandidate(){closeModal('candidateAddModal')}
async function submitAddCandidate(){
  const job=document.getElementById('candidateAddJob').value;
  const full=document.getElementById('candidateAddName').value.trim();
  const email=document.getElementById('candidateAddEmail').value.trim();
  const phone=document.getElementById('candidateAddPhone').value.trim();
  const source=document.getElementById('candidateAddSource').value.trim()||'manual';
  if(!job||!full||(!email&&!phone)){alert(currentLanguage==='es'?'Vacante, nombre y correo o teléfono son obligatorios.':'Job, name and email or phone are required.');return}
  showLoading(true);
  try{
    const result=await rpc('catalyst_add_candidate_to_job',{p_job_id:job,p_full_name:full,p_email:email||null,p_phone:phone||null,p_source:source});
    closeAddCandidate();
    ['candidateAddName','candidateAddEmail','candidateAddPhone'].forEach(id=>document.getElementById(id).value='');
    await Promise.allSettled([loadCandidates(),loadPipeline(),loadJobs(),loadDashboard()]);
    if(result?.application_id) await openCandidateDetail(result.application_id);
  }catch(e){alert(e.message||'Could not add candidate.')}finally{showLoading(false)}
}

// ---------------------------------------------------------
// Job detail
// ---------------------------------------------------------
async function openJobDetail(jobId){
  activeJobId=jobId;
  openModal('jobDetailModal');
  const body=document.getElementById('jobDetailBody');
  body.className='empty';body.textContent='Loading job…';
  try{
    const {data:job,error}=await sb.from('jobs').select('*').eq('id',jobId).single();
    if(error) throw error;
    const [ownerRes,pipeRes,appsRes,reqRes]=await Promise.all([
      job.recruiter_owner_id?sb.from('empleados').select('id,nombre_completo,nombre').eq('id',job.recruiter_owner_id).maybeSingle():Promise.resolve({data:null}),
      sb.from('pipelines').select('id,name').eq('id',job.pipeline_id).maybeSingle(),
      sb.from('applications').select('id,status,current_stage_id,candidate_id').eq('job_id',jobId),
      job.linked_requisition_id?sb.from('job_requisitions').select('id,status,requested_heads,position_title').eq('id',job.linked_requisition_id).maybeSingle():Promise.resolve({data:null})
    ]);
    const apps=appsRes.data||[];
    const active=apps.filter(a=>a.status==='active').length;
    const hired=apps.filter(a=>a.status==='hired').length;
    document.getElementById('jobDetailTitle').textContent=job.title;
    document.getElementById('jobDetailSub').textContent=`${job.campaign||job.department||'—'} · ${t(job.status)}`;
    body.className='';
    body.innerHTML=`<div class="detail-shell">
      <div class="detail-hero"><div><div class="detail-title">${esc(job.title)}</div><div class="detail-muted">${esc(job.campaign||'—')} · ${esc(job.department||'—')}</div></div><div class="detail-actions">${!managerRoles.includes(currentRole)?`<button class="btn-cyan" onclick="openAddCandidate('${esc(job.id)}')">+ ${t('Add candidate')}</button>`:''}<button class="btn-ghost" onclick="go('pipeline');closeJobDetail();setTimeout(()=>selectPipelineJob('${esc(job.id)}'),50)">${t('Open pipeline')}</button></div></div>
      <div class="meta-grid">
        <div class="meta-box"><span>${t('Status')}</span><strong>${esc(t(job.status))}</strong></div>
        <div class="meta-box"><span>${t('Recruiter owner')}</span><strong>${esc(ownerRes.data?.nombre_completo||ownerRes.data?.nombre||t('Unassigned'))}</strong></div>
        <div class="meta-box"><span>${t('Pipeline')}</span><strong>${esc(pipeRes.data?.name||'—')}</strong></div>
        <div class="meta-box"><span>${t('Headcount')}</span><strong>${esc(job.headcount_requested)}</strong></div>
        <div class="meta-box"><span>${t('Active candidates')}</span><strong>${active}</strong></div>
        <div class="meta-box"><span>${t('Hired')}</span><strong>${hired}</strong></div>
        <div class="meta-box"><span>${t('Target fill')}</span><strong>${fmtDate(job.target_fill_date)}</strong></div>
        <div class="meta-box"><span>${t('Target start')}</span><strong>${fmtDate(job.target_start_date)}</strong></div>
      </div>
      ${reqRes.data?`<div class="detail-section"><h4>${t('Linked requisition')}</h4><div>${esc(reqRes.data.position_title||'—')} · ${esc(t(reqRes.data.status))} · HC ${esc(reqRes.data.requested_heads)}</div></div>`:''}
      <div class="detail-section"><h4>${t('Applications')}</h4><div class="action-row"><span class="pill pc">${active} ${t('active')}</span><span class="pill pg">${hired} ${t('hired')}</span><span class="pill pgr">${apps.length} ${t('total')}</span></div></div>
    </div>`;
  }catch(e){body.className='empty';body.textContent=e.message||'Could not load job.'}
}
function closeJobDetail(){closeModal('jobDetailModal')}
function selectPipelineJob(jobId){const s=document.getElementById('pipelineJobSelect');if(s){s.value=jobId;renderPipelineForJob(jobId)}}

// ---------------------------------------------------------
// Candidate / application detail
// ---------------------------------------------------------
async function openCandidateDetail(applicationId){
  activeApplicationId=applicationId;
  openModal('candidateDetailModal');
  const body=document.getElementById('candidateDetailBody');body.className='empty';body.textContent='Loading candidate…';
  try{
    const {data:app,error}=await sb.from('applications').select('*').eq('id',applicationId).single(); if(error) throw error;
    activeCandidateId=app.candidate_id;activeApplicationStageId=app.current_stage_id;
    const [candRes,jobRes,stageRes,eventRes,intRes,reviewRes,docRes,offerRes]=await Promise.all([
      sb.from('candidates').select('*').eq('id',app.candidate_id).single(),
      sb.from('jobs').select('*').eq('id',app.job_id).single(),
      sb.from('stages').select('*').eq('pipeline_id',(await sb.from('jobs').select('pipeline_id').eq('id',app.job_id).single()).data.pipeline_id).order('stage_order'),
      sb.from('application_events').select('*').eq('application_id',applicationId).order('created_at',{ascending:false}).limit(100),
      sb.from('interviews').select('*').eq('application_id',applicationId).order('scheduled_at',{ascending:false}),
      sb.from('application_stage_reviews').select('*').eq('application_id',applicationId).order('created_at',{ascending:false}),
      sb.from('application_documents').select('*').eq('application_id',applicationId).order('created_at',{ascending:false}),
      sb.from('offers').select('*').eq('application_id',applicationId).maybeSingle()
    ]);
    const c=candRes.data,j=jobRes.data,stages=stageRes.data||[],events=eventRes.data||[],interviews=intRes.data||[],reviews=reviewRes.data||[],docs=docRes.data||[],offer=offerRes.data;
    const currentStage=stages.find(s=>s.id===app.current_stage_id);
    document.getElementById('candidateDetailTitle').textContent=c.full_name;
    document.getElementById('candidateDetailSub').textContent=`${j.title} · ${currentStage?.name||t('No stage')}`;
    body.className='';
    body.innerHTML=`<div class="detail-shell">
      <div class="detail-hero"><div><div class="detail-title">${esc(c.full_name)}</div><div class="detail-muted">${esc(c.email||'—')} · ${esc(c.phone||'—')} · ${esc(c.source||'—')}</div></div>
        <div class="detail-actions">${app.status==='active'&&!managerRoles.includes(currentRole)?`<select class="inline-select" id="detailStageSelect">${stages.map(s=>`<option value="${s.id}" ${s.id===app.current_stage_id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><button class="btn-cyan" onclick="moveFromDetail()">${t('Move stage')}</button><button class="btn-ghost" onclick="openReviewModal()">${t('Feedback')}</button><button class="btn-ghost" onclick="openInterviewModal()">${t('Interview')}</button>${offer?'':`<button class="btn-primary" onclick="openOfferEditModal('create')">${t('Create offer')}</button>`}`:''}</div>
      </div>
      <div class="meta-grid">
        <div class="meta-box"><span>${t('Job')}</span><strong>${esc(j.title)}</strong></div><div class="meta-box"><span>${t('Stage')}</span><strong>${esc(currentStage?.name||'—')}</strong></div><div class="meta-box"><span>${t('Status')}</span><strong>${esc(t(app.status))}</strong></div><div class="meta-box"><span>${t('Source')}</span><strong>${esc(c.source||'—')}</strong></div>
      </div>
      <div class="two-col"><div class="detail-section"><h4>${t('Interviews')}</h4>${interviews.length?interviews.map(i=>`<div class="attention"><div class="att-main"><div class="att-title">${esc(i.interview_type)}</div><div class="att-sub">${esc(i.scheduled_at?new Date(i.scheduled_at).toLocaleString(currentLanguage==='es'?'es-MX':'en-US'):'—')}</div></div><select class="inline-select" onchange="changeInterviewStatus('${i.id}',this.value)"><option value="scheduled" ${i.status==='scheduled'?'selected':''}>scheduled</option><option value="completed" ${i.status==='completed'?'selected':''}>completed</option><option value="no_show" ${i.status==='no_show'?'selected':''}>no_show</option><option value="cancelled" ${i.status==='cancelled'?'selected':''}>cancelled</option></select></div>`).join(''):`<div class="empty">${t('No interviews')}</div>`}</div>
        <div class="detail-section"><h4>${t('Feedback')}</h4>${reviews.length?reviews.map(r=>`<div class="attention"><div class="att-main"><div class="att-title">${esc(r.decision||t('Feedback'))}${r.score!=null?' · '+r.score:''}</div><div class="att-sub">${esc(r.notes||'—')}</div></div></div>`).join(''):`<div class="empty">${t('No feedback')}</div>`}</div></div>
      <div class="detail-section"><h4>${t('Documents')}</h4>${docs.length?docs.map(d=>`<div class="attention"><div class="att-main"><div class="att-title">${esc(d.doc_type)}</div><div class="att-sub">${esc(d.status)}</div></div>${d.file_url?`<a class="btn-ghost" href="${esc(d.file_url)}" target="_blank" rel="noopener">${t('Open')}</a>`:''}</div>`).join(''):`<div class="empty">${t('No documents')}</div>`}</div>
      ${offer?`<div class="detail-section"><h4>${t('Offer')}</h4><div class="action-row"><span class="pill ${pillForStatus(offer.status)}">${esc(t(offer.status))}</span><button class="btn-ghost" onclick="closeCandidateDetail();openOfferDetail('${offer.id}')">${t('Open offer')}</button></div></div>`:''}
      <div class="detail-section"><h4>${t('Timeline')}</h4><div class="timeline">${events.length?events.map(e=>`<div class="timeline-row"><div class="timeline-time">${esc(new Date(e.created_at).toLocaleString(currentLanguage==='es'?'es-MX':'en-US',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}))}</div><div class="timeline-main"><strong>${esc(t(String(e.event_type).replaceAll('_',' ')))}</strong><p>${esc(e.notes||'')}</p></div></div>`).join(''):`<div class="empty">${t('No activity')}</div>`}</div></div>
    </div>`;
  }catch(e){body.className='empty';body.textContent=e.message||'Could not load candidate.'}
}
function closeCandidateDetail(){closeModal('candidateDetailModal')}
async function moveFromDetail(){const to=document.getElementById('detailStageSelect').value;if(to===activeApplicationStageId)return;showLoading(true);try{await rpc('catalyst_move_application_stage',{p_application_id:activeApplicationId,p_to_stage_id:to,p_notes:null});activeApplicationStageId=to;await Promise.allSettled([loadCandidates(),loadPipeline(),loadDashboard(),openCandidateDetail(activeApplicationId)])}catch(e){alert(e.message)}finally{showLoading(false)}}
async function moveApplicationStage(applicationId,toStageId){showLoading(true);try{await rpc('catalyst_move_application_stage',{p_application_id:applicationId,p_to_stage_id:toStageId,p_notes:null});await Promise.allSettled([loadPipeline(),loadCandidates(),loadDashboard()])}catch(e){alert(e.message)}finally{showLoading(false)}}

// ---------------------------------------------------------
// Interview
// ---------------------------------------------------------
async function openInterviewModal(){
  if(!activeApplicationId)return;
  openModal('interviewModal');
  const {data:app}=await sb.from('applications').select('job_id,current_stage_id').eq('id',activeApplicationId).single();
  const {data:job}=await sb.from('jobs').select('pipeline_id').eq('id',app.job_id).single();
  const [stageRes,peopleRes]=await Promise.all([sb.from('stages').select('id,name').eq('pipeline_id',job.pipeline_id).order('stage_order'),sb.from('empleados').select('id,nombre_completo,nombre,role_id,roles(name)').order('nombre')]);
  const staff=(peopleRes.data||[]).filter(e=>['talent','ta_analyst','ta_manager','head_people'].includes(e.roles?.name));
  document.getElementById('interviewStage').innerHTML=(stageRes.data||[]).map(s=>`<option value="${s.id}" ${s.id===app.current_stage_id?'selected':''}>${esc(s.name)}</option>`).join('');
  document.getElementById('interviewOwner').innerHTML=staff.map(e=>`<option value="${e.id}" ${e.id===currentEmpleado.id?'selected':''}>${esc(e.nombre_completo||e.nombre)}</option>`).join('');
}
function closeInterviewModal(){closeModal('interviewModal')}
async function submitInterview(){const stage=document.getElementById('interviewStage').value,owner=document.getElementById('interviewOwner').value,when=document.getElementById('interviewWhen').value,type=document.getElementById('interviewType').value;if(!stage||!owner||!when){alert(t('Complete required fields'));return}showLoading(true);try{await rpc('catalyst_schedule_interview',{p_application_id:activeApplicationId,p_stage_id:stage,p_interviewer_id:owner,p_scheduled_at:new Date(when).toISOString(),p_interview_type:type});closeInterviewModal();await openCandidateDetail(activeApplicationId)}catch(e){alert(e.message)}finally{showLoading(false)}}
async function changeInterviewStatus(id,status){try{await rpc('catalyst_set_interview_status',{p_interview_id:id,p_status:status});await openCandidateDetail(activeApplicationId)}catch(e){alert(e.message)}}

// ---------------------------------------------------------
// Feedback
// ---------------------------------------------------------
function openReviewModal(){if(!activeApplicationId||!activeApplicationStageId)return;openModal('reviewModal')}
function closeReviewModal(){closeModal('reviewModal')}
async function submitStageReview(){const scoreRaw=document.getElementById('reviewScore').value;showLoading(true);try{await rpc('catalyst_save_stage_review',{p_application_id:activeApplicationId,p_stage_id:activeApplicationStageId,p_score:scoreRaw?Number(scoreRaw):null,p_decision:document.getElementById('reviewDecision').value||null,p_notes:document.getElementById('reviewNotes').value||null});closeReviewModal();await openCandidateDetail(activeApplicationId)}catch(e){alert(e.message)}finally{showLoading(false)}}

// ---------------------------------------------------------
// Offer creation/versioning
// ---------------------------------------------------------
function openOfferEditModal(mode='create',offerId=null){offerEditMode=mode;offerEditOfferId=offerId;document.getElementById('offerEditTitle').textContent=mode==='create'?t('Create offer'):t('New offer version');openModal('offerEditModal')}
function closeOfferEditModal(){closeModal('offerEditModal')}
async function submitOfferEdit(){const salary=Number(document.getElementById('offerSalary').value),currency=document.getElementById('offerCurrency').value||'MXN',variable=document.getElementById('offerVariable').value,start=document.getElementById('offerStart').value,expiration=document.getElementById('offerExpiration').value,notes=document.getElementById('offerNotes').value;if(!salary||!start){alert(t('Salary and planned start date are required'));return}showLoading(true);try{let result;if(offerEditMode==='create'){result=await rpc('catalyst_create_offer',{p_application_id:activeApplicationId,p_salary:salary,p_currency:currency,p_variable_compensation:variable?Number(variable):null,p_compensation_notes:notes||null,p_planned_start_date:start,p_expiration_date:expiration||null})}else{result=await rpc('catalyst_add_offer_version',{p_offer_id:offerEditOfferId,p_salary:salary,p_currency:currency,p_variable_compensation:variable?Number(variable):null,p_compensation_notes:notes||null,p_planned_start_date:start,p_expiration_date:expiration||null})}closeOfferEditModal();await Promise.allSettled([loadOffers(),loadDashboard()]);if(result?.offer_id){closeCandidateDetail();await openOfferDetail(result.offer_id)}}catch(e){alert(e.message)}finally{showLoading(false)}}

// ---------------------------------------------------------
// Offer detail / workflow / hire
// ---------------------------------------------------------
async function openOfferDetail(offerId){activeOfferId=offerId;openModal('offerDetailModal');const body=document.getElementById('offerDetailBody');body.className='empty';body.textContent='Loading offer…';try{
  const {data:o,error}=await sb.from('offers').select('*').eq('id',offerId).single();if(error)throw error;
  const [appRes,versRes,hireRes]=await Promise.all([sb.from('applications').select('*').eq('id',o.application_id).single(),sb.from('offer_versions').select('*').eq('offer_id',offerId).order('version_number',{ascending:false}),sb.from('hires').select('*').eq('offer_id',offerId).maybeSingle()]);
  const a=appRes.data;activeApplicationId=a.id;const [candRes,jobRes]=await Promise.all([sb.from('candidates').select('*').eq('id',a.candidate_id).single(),sb.from('jobs').select('*').eq('id',a.job_id).single()]);const c=candRes.data,j=jobRes.data,versions=versRes.data||[],hire=hireRes.data;activeHireId=hire?.id||null;
  document.getElementById('offerDetailTitle').textContent=c.full_name;document.getElementById('offerDetailSub').textContent=j.title;
  const current=versions.find(v=>v.id===o.current_version_id)||versions[0];
  const canHop=hopRoles.includes(currentRole),canStaff=taRoles.includes(currentRole)||canHop;
  const actions=[];
  if(canStaff&&o.status==='draft') actions.push(`<button class="btn-cyan" onclick="setOfferStatus('pending_approval')">${t('Submit for approval')}</button>`);
  if(canHop&&o.status==='pending_approval') actions.push(`<button class="btn-success" onclick="setOfferStatus('ready_to_send')">${t('Approve offer')}</button>`);
  if(canStaff&&o.status==='ready_to_send') actions.push(`<button class="btn-cyan" onclick="setOfferStatus('sent')">${t('Mark sent')}</button>`);
  if(canStaff&&['sent','negotiation'].includes(o.status)){actions.push(`<button class="btn-success" onclick="setOfferStatus('accepted')">${t('Accept offer')}</button>`);actions.push(`<button class="btn-danger" onclick="setOfferStatus('declined',true)">${t('Decline offer')}</button>`);actions.push(`<button class="btn-ghost" onclick="openOfferEditModal('version','${o.id}')">${t('New version')}</button>`)}
  if(hire&&canHop&&!hire.employee_id) actions.push(`<button class="btn-cyan" onclick="openProvisionModal('${hire.id}','${esc(j.title)}')">${t('Provision to Impulse')}</button>`);
  if(hire&&canHop&&hire.employee_id&&hire.status!=='started') actions.push(`<button class="btn-success" onclick="markHireStarted('${hire.id}')">${t('Mark started')}</button>`);
  body.className='';body.innerHTML=`<div class="detail-shell"><div class="detail-hero"><div><div class="detail-title">${esc(c.full_name)}</div><div class="detail-muted">${esc(j.title)}</div></div><div class="detail-actions">${actions.join('')}</div></div>
  <div class="meta-grid"><div class="meta-box"><span>${t('Status')}</span><strong>${esc(t(o.status))}</strong></div><div class="meta-box"><span>${t('Current version')}</span><strong>${current?'V'+current.version_number:'—'}</strong></div><div class="meta-box"><span>${t('Salary')}</span><strong>${current?esc(new Intl.NumberFormat(currentLanguage==='es'?'es-MX':'en-US',{style:'currency',currency:current.currency||'MXN'}).format(current.salary)):'—'}</strong></div><div class="meta-box"><span>${t('Start date')}</span><strong>${current?fmtDate(current.planned_start_date):'—'}</strong></div></div>
  <div class="detail-section"><h4>${t('Offer versions')}</h4>${versions.map(v=>`<div class="attention"><div class="att-main"><div class="att-title">V${v.version_number} · ${esc(new Intl.NumberFormat(currentLanguage==='es'?'es-MX':'en-US',{style:'currency',currency:v.currency||'MXN'}).format(v.salary))}</div><div class="att-sub">${fmtDate(v.planned_start_date)}${v.compensation_notes?' · '+esc(v.compensation_notes):''}</div></div>${v.id===o.current_version_id?'<span class="pill pc">Current</span>':''}</div>`).join('')}</div>
  <div class="detail-section"><h4>${t('Hire')}</h4>${hire?`<div class="meta-grid"><div class="meta-box"><span>${t('Hire status')}</span><strong>${esc(t(hire.status))}</strong></div><div class="meta-box"><span>Impulse ID</span><strong>${esc(hire.employee_id||'—')}</strong></div><div class="meta-box"><span>${t('Planned start')}</span><strong>${fmtDate(hire.planned_start_date)}</strong></div><div class="meta-box"><span>${t('Actual start')}</span><strong>${fmtDate(hire.actual_start_date)}</strong></div></div>`:`<div class="empty">${t('Hire will be created automatically when the offer is accepted.')}</div>`}</div></div>`;
 }catch(e){body.className='empty';body.textContent=e.message||'Could not load offer.'}}
function closeOfferDetail(){closeModal('offerDetailModal')}
async function setOfferStatus(status,askReason=false){let reason=null;if(askReason){reason=prompt(t('Reason'));if(reason===null)return}showLoading(true);try{await rpc('catalyst_set_offer_status',{p_offer_id:activeOfferId,p_status:status,p_reason:reason});await Promise.allSettled([loadOffers(),loadDashboard(),openOfferDetail(activeOfferId)])}catch(e){alert(e.message)}finally{showLoading(false)}}

// ---------------------------------------------------------
// Provisioning / start
// ---------------------------------------------------------
async function openProvisionModal(hireId,position){activeHireId=hireId;openModal('provisionModal');document.getElementById('provisionPosition').value=position||'';const [cRes,rRes,sRes]=await Promise.all([sb.from('campaigns').select('id,name').eq('is_active',true).order('name'),sb.from('system_roles').select('id,label').order('label'),sb.from('employees').select('id,full_name,system_role,status').eq('status','active').in('system_role',['supervisor','manager']).order('full_name')]);document.getElementById('provisionCampaign').innerHTML=(cRes.data||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');document.getElementById('provisionRole').innerHTML=(rRes.data||[]).map(x=>`<option value="${x.id}" ${x.id==='agent'?'selected':''}>${esc(x.label)}</option>`).join('');document.getElementById('provisionSupervisor').innerHTML='<option value="">No supervisor</option>'+(sRes.data||[]).map(x=>`<option value="${x.id}">${esc(x.full_name)} · ${esc(x.id)}</option>`).join('')}
function closeProvisionModal(){closeModal('provisionModal')}
async function submitProvision(){const email=document.getElementById('provisionEmail').value.trim(),campaign=document.getElementById('provisionCampaign').value,role=document.getElementById('provisionRole').value,supervisor=document.getElementById('provisionSupervisor').value||null,position=document.getElementById('provisionPosition').value.trim();if(!email||!campaign||!role){alert(t('Complete required fields'));return}showLoading(true);try{const result=await rpc('catalyst_provision_hire_to_impulse',{p_hire_id:activeHireId,p_corporate_email:email,p_campaign_id:campaign,p_system_role:role,p_supervisor_id:supervisor,p_position_title:position||null});closeProvisionModal();alert(`${t('Provisioned')}: ${result.employee_id}`);await Promise.allSettled([loadOffers(),openOfferDetail(activeOfferId)])}catch(e){alert(e.message)}finally{showLoading(false)}}
async function markHireStarted(hireId){if(!confirm(t('Confirm employee start?')))return;showLoading(true);try{await rpc('catalyst_mark_hire_started',{p_hire_id:hireId,p_actual_start_date:new Date().toISOString().slice(0,10)});await Promise.allSettled([loadOffers(),loadDashboard(),openOfferDetail(activeOfferId)])}catch(e){alert(e.message)}finally{showLoading(false)}}
