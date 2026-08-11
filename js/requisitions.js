let currentRequisitionDetail=null;
let currentRequisitionRequester='—';
let approvalOptionsLoaded=false;

async function loadRequisitions(){
  if(!currentEmpleado) return;

  const tbody=document.getElementById('reqTableBody');
  const box=document.getElementById('reqDataError');
  box.style.display='none';
  tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:#94A3B8;padding:24px">${t('Loading requisitions…')}</td></tr>`;

  try{
    const {data,error}=await sb
      .from('job_requisitions')
      .select('id,position_title,campaign,lob,requested_heads,priority,requisition_type,start_date,status,created_by,created_at,job_id,returned_notes,rejected_notes,approval_notes')
      .order('created_at',{ascending:false})
      .limit(200);

    if(error) throw error;
    requisitions=data||[];

    const ids=[...new Set(requisitions.map(r=>r.created_by).filter(Boolean))];
    const creators={};

    if(ids.length){
      const {data:emps,error:empError}=await sb.from('empleados').select('id,nombre_completo,nombre').in('id',ids);
      if(empError) console.warn('[Catalyst requisition creators]',empError);
      (emps||[]).forEach(e=>creators[e.id]=e.nombre_completo||e.nombre||'—');
    }

    if(requisitions.length){
      tbody.innerHTML=requisitions.map(r=>{
        const priority=String(r.priority||'medium').toLowerCase();
        const status=String(r.status||'').replaceAll('_',' ');
        return `<tr class="req-row" onclick="openRequisitionDetail('${r.id}')">
          <td><div class="tn">${esc(r.position_title||t('Untitled requisition'))}</div><div class="tm">${esc(r.id.slice(0,8).toUpperCase())}</div></td>
          <td>${esc(r.campaign||'—')} · ${esc(r.lob||'—')}</td>
          <td>${esc(r.requested_heads)}</td>
          <td><span class="pill ${priority==='high'?'pr':priority==='medium'?'pa':'pgr'}">${esc(t(priority))}</span></td>
          <td>${esc(creators[r.created_by]||'—')}</td>
          <td>${fmtDate(r.start_date)}</td>
          <td><span class="pill ${pillForStatus(r.status)}">${esc(t(status))}</span></td>
        </tr>`;
      }).join('');
    }else{
      tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:#94A3B8;padding:28px">${t('No requisitions yet.')}</td></tr>`;
    }

    document.getElementById('reqPending').textContent=requisitions.filter(r=>['submitted','pending'].includes(r.status)).length;
    document.getElementById('reqApproved').textContent=requisitions.filter(r=>r.status==='approved').length;
    document.getElementById('reqChanges').textContent=requisitions.filter(r=>['returned','changes_requested'].includes(r.status)).length;
    document.getElementById('reqHeadcount').textContent=requisitions.filter(r=>r.status!=='rejected').reduce((sum,r)=>sum+(Number(r.requested_heads)||0),0);

    translateRoot(tbody);
  }catch(e){
    console.error('[Catalyst requisitions]',e);
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:#B91C1C;padding:24px">${t('Could not load requisitions.')}</td></tr>`;
    box.textContent=e.message||t('Could not load requisitions.');
    box.style.display='block';
  }
}

async function openRequisitionDetail(id){
  const modal=document.getElementById('reqDetailModal');
  const loading=document.getElementById('reqDetailLoading');
  const content=document.getElementById('reqDetailContent');
  modal.classList.add('show');
  loading.style.display='block';
  content.style.display='none';
  currentRequisitionDetail=null;

  try{
    const {data:req,error}=await sb.from('job_requisitions').select('*').eq('id',id).single();
    if(error) throw error;

    let requester='—';
    if(req.created_by){
      const {data:emp}=await sb.from('empleados').select('nombre_completo,nombre').eq('id',req.created_by).maybeSingle();
      requester=emp?.nombre_completo||emp?.nombre||'—';
    }

    currentRequisitionDetail=req;
    currentRequisitionRequester=requester;
    renderRequisitionDetail();

    if(hopRoles.includes(currentRole) && req.status==='submitted'){
      await loadApprovalOptions();
      setApprovalDefaults(req);
      document.getElementById('approvalPanel').style.display='block';
    }

    loading.style.display='none';
    content.style.display='block';
    translateRoot(content);
  }catch(e){
    console.error('[Catalyst requisition detail]',e);
    loading.innerHTML=`<div style="color:#B91C1C">${esc(e.message||'Could not load requisition.')}</div>`;
  }
}

function renderRequisitionDetail(){
  const r=currentRequisitionDetail;
  if(!r) return;

  document.getElementById('reqDetailTitle').textContent=r.position_title||t('Untitled requisition');
  document.getElementById('reqDetailSubtitle').innerHTML=`<span class="pill ${pillForStatus(r.status)}">${esc(t(String(r.status||'').replaceAll('_',' ')))}</span> · ${esc(r.id.slice(0,8).toUpperCase())}`;
  document.getElementById('rdCampaign').textContent=r.campaign||'—';
  document.getElementById('rdLob').textContent=r.lob||'—';
  document.getElementById('rdHeads').textContent=r.requested_heads ?? '—';
  document.getElementById('rdPriority').textContent=t(String(r.priority||'medium').toLowerCase());
  document.getElementById('rdType').textContent=t(String(r.requisition_type||'other').replaceAll('_',' '));
  document.getElementById('rdStart').textContent=fmtDate(r.start_date);
  document.getElementById('rdSchedule').textContent=r.schedule_text||'—';
  document.getElementById('rdRequester').textContent=currentRequisitionRequester;
  document.getElementById('rdReason').textContent=r.reason||'—';
  document.getElementById('approvalPanel').style.display='none';

  const noteWrap=document.getElementById('rdDecisionNoteWrap');
  let note=null,label='Decision notes';
  if(r.status==='returned'){note=r.returned_notes;label='Return notes'}
  else if(r.status==='rejected'){note=r.rejected_notes;label='Rejection reason'}
  else if(r.status==='approved'){note=r.approval_notes;label='Approval notes'}
  noteWrap.style.display=note?'block':'none';
  document.getElementById('rdDecisionNoteLabel').textContent=label;
  document.getElementById('rdDecisionNote').textContent=note||'—';

  const linked=document.getElementById('linkedJobPanel');
  linked.style.display=r.job_id?'block':'none';
  document.getElementById('linkedJobId').textContent=r.job_id?r.job_id.slice(0,8).toUpperCase():'—';
}

async function loadApprovalOptions(){
  if(approvalOptionsLoaded) return;

  const [{data:employees,error:empError},{data:pipelines,error:pipeError}]=await Promise.all([
    sb.from('empleados').select('id,nombre_completo,nombre,role_id,roles(name)').order('nombre_completo'),
    sb.from('pipelines').select('id,name,is_active').eq('is_active',true).order('name')
  ]);
  if(empError) throw empError;
  if(pipeError) throw pipeError;

  const recruiters=(employees||[]).filter(e=>['talent','ta_analyst','ta_manager'].includes(e.roles?.name));
  const rec=document.getElementById('approveRecruiter');
  rec.innerHTML='<option value="">Select recruiter…</option>'+recruiters.map(e=>`<option value="${e.id}">${esc(e.nombre_completo||e.nombre||'TA')}</option>`).join('');

  const pipe=document.getElementById('approvePipeline');
  pipe.innerHTML=(pipelines||[]).map(p=>`<option value="${p.id}" ${p.name==='Catalyst Standard'?'selected':''}>${esc(p.name)}</option>`).join('');
  approvalOptionsLoaded=true;
}

function setApprovalDefaults(req){
  document.getElementById('approvePriority').value=req.priority||'medium';
  document.getElementById('approveNotes').value='';
  const target=document.getElementById('approveTargetFill');
  if(!target.value){
    const d=new Date();
    d.setDate(d.getDate()+30);
    target.value=d.toISOString().slice(0,10);
  }
}

async function approveCurrentRequisition(){
  const r=currentRequisitionDetail;
  if(!r) return;
  const recruiter=document.getElementById('approveRecruiter').value;
  const pipeline=document.getElementById('approvePipeline').value;
  const target=document.getElementById('approveTargetFill').value;
  const priority=document.getElementById('approvePriority').value;
  const notes=document.getElementById('approveNotes').value.trim()||null;

  if(!recruiter){alert(currentLanguage==='es'?'Selecciona un recruiter.':'Select a recruiter.');return}
  if(!pipeline){alert(currentLanguage==='es'?'Selecciona un pipeline.':'Select a pipeline.');return}
  if(!target){alert(currentLanguage==='es'?'Selecciona la fecha objetivo para cubrir.':'Select a target fill date.');return}

  if(!confirm(currentLanguage==='es'?'¿Aprobar esta requisición y crear la vacante?':'Approve this requisition and create the job?')) return;
  showLoading(true);
  try{
    const {data,error}=await sb.rpc('catalyst_approve_requisition',{
      p_requisition_id:r.id,
      p_pipeline_id:pipeline,
      p_recruiter_owner_id:recruiter,
      p_target_fill_date:target,
      p_priority:priority,
      p_notes:notes
    });
    if(error) throw error;
    await refreshAfterRequisitionDecision();
    alert(currentLanguage==='es'?'Requisición aprobada y vacante creada.':'Requisition approved and job created.');
  }catch(e){
    console.error('[Catalyst approve requisition]',e);
    alert(e.message||'Could not approve requisition.');
  }finally{showLoading(false)}
}

async function returnCurrentRequisition(){
  const r=currentRequisitionDetail;
  if(!r) return;
  const notes=document.getElementById('approveNotes').value.trim();
  if(!notes){alert(currentLanguage==='es'?'Escribe qué debe corregir el manager.':'Add the changes the manager needs to make.');return}
  if(!confirm(currentLanguage==='es'?'¿Regresar esta requisición para cambios?':'Return this requisition for changes?')) return;
  showLoading(true);
  try{
    const {error}=await sb.rpc('catalyst_return_requisition',{p_requisition_id:r.id,p_notes:notes});
    if(error) throw error;
    await refreshAfterRequisitionDecision();
  }catch(e){console.error(e);alert(e.message||'Could not return requisition.')}finally{showLoading(false)}
}

async function rejectCurrentRequisition(){
  const r=currentRequisitionDetail;
  if(!r) return;
  const notes=document.getElementById('approveNotes').value.trim();
  if(!notes){alert(currentLanguage==='es'?'Escribe el motivo del rechazo.':'Add a rejection reason.');return}
  if(!confirm(currentLanguage==='es'?'¿Rechazar definitivamente esta requisición?':'Reject this requisition?')) return;
  showLoading(true);
  try{
    const {error}=await sb.rpc('catalyst_reject_requisition',{p_requisition_id:r.id,p_notes:notes});
    if(error) throw error;
    await refreshAfterRequisitionDecision();
  }catch(e){console.error(e);alert(e.message||'Could not reject requisition.')}finally{showLoading(false)}
}

async function refreshAfterRequisitionDecision(){
  const id=currentRequisitionDetail?.id;
  await Promise.all([loadRequisitions(),loadDashboard(),typeof loadJobs==='function'?loadJobs():Promise.resolve()]);
  if(id) await openRequisitionDetail(id);
}

function closeRequisitionDetail(){document.getElementById('reqDetailModal').classList.remove('show')}
function goToLinkedJob(){closeRequisitionDetail();go('jobs')}

function openRequisitionModal(){document.getElementById('reqModal').classList.add('show')}
function closeRequisitionModal(){document.getElementById('reqModal').classList.remove('show')}

function reqPayload(status){
  return {
    campaign:document.getElementById('reqCampaign').value,
    lob:document.getElementById('reqLob').value.trim(),
    requested_heads:Number(document.getElementById('reqHeads').value||0),
    schedule_text:document.getElementById('reqSchedule').value.trim(),
    reason:document.getElementById('reqReason').value.trim(),
    start_date:document.getElementById('reqStartDate').value,
    status,
    created_by:currentEmpleado.id,
    approver_role_name:'head_people',
    position_title:document.getElementById('reqPosition').value.trim(),
    requisition_type:document.getElementById('reqType').value,
    priority:document.getElementById('reqPriority').value
  };
}

async function createReq(status){
  const p=reqPayload(status),missing=[];
  if(!p.position_title) missing.push(t('Position title'));
  if(!p.lob) missing.push('LOB');
  if(!p.requested_heads) missing.push(t('Headcount'));
  if(!p.schedule_text) missing.push(t('Schedule'));
  if(!p.reason) missing.push(t('Justification'));
  if(!p.start_date) missing.push(t('Start date'));
  if(missing.length){alert((currentLanguage==='es'?'Completa: ':'Complete: ')+missing.join(', '));return}

  showLoading(true);
  try{
    const {error}=await sb.from('job_requisitions').insert(p);
    if(error) throw error;
    closeRequisitionModal();
    await Promise.all([loadRequisitions(),loadDashboard()]);
    go('requisitions');
  }catch(e){alert(e.message||t('Could not create requisition.'))}finally{showLoading(false)}
}

async function saveDraft(){await createReq('draft')}
async function submitReq(){await createReq('submitted')}
