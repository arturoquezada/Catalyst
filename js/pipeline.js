let pipelineJobs=[];

async function loadPipeline(){
  if(managerRoles.includes(currentRole)) return;
  const select=document.getElementById('pipelineJobSelect');
  const board=document.getElementById('pipelineBoard');
  const errorBox=document.getElementById('pipelineDataError');
  if(!select || !board) return;
  errorBox.style.display='none';

  try{
    const {data:jobs,error}=await sb.from('jobs')
      .select('id,title,pipeline_id,status')
      .in('status',['open','paused'])
      .order('title',{ascending:true});
    if(error) throw error;
    pipelineJobs=jobs||[];

    const previous=select.value;
    select.innerHTML=`<option value="">${t('Select a job')}</option>`+pipelineJobs.map(j=>`<option value="${esc(j.id)}">${esc(j.title)}</option>`).join('');
    if(pipelineJobs.some(j=>j.id===previous)) select.value=previous;
    else if(pipelineJobs.length) select.value=pipelineJobs[0].id;

    if(select.value) await renderPipelineForJob(select.value);
    else board.innerHTML=`<div class="empty">${t('No open jobs are available for pipeline view.')}</div>`;
  }catch(e){
    console.error('[Catalyst pipeline]',e);
    board.innerHTML=`<div class="empty" style="color:#B91C1C">${t('Could not load pipeline.')}</div>`;
    errorBox.textContent=e.message||t('Could not load pipeline.');
    errorBox.style.display='block';
  }
}

async function renderPipelineForJob(jobId){
  const board=document.getElementById('pipelineBoard');
  board.innerHTML=`<div class="empty">${t('Loading pipeline…')}</div>`;

  const job=pipelineJobs.find(j=>j.id===jobId);
  if(!job?.pipeline_id){
    board.innerHTML=`<div class="empty">${t('This job does not have a pipeline assigned.')}</div>`;
    return;
  }

  const [stageRes,appRes]=await Promise.all([
    sb.from('stages').select('id,name,stage_order').eq('pipeline_id',job.pipeline_id).order('stage_order',{ascending:true}),
    sb.from('applications').select('id,candidate_id,current_stage_id,status,updated_at,created_at').eq('job_id',jobId).in('status',['active','hired'])
  ]);
  if(stageRes.error) throw stageRes.error;
  if(appRes.error) throw appRes.error;

  const stages=stageRes.data||[];
  const apps=appRes.data||[];
  const candidateIds=[...new Set(apps.map(a=>a.candidate_id).filter(Boolean))];
  const {data:candidates,error:candError}=candidateIds.length
    ? await sb.from('candidates').select('id,full_name,source').in('id',candidateIds)
    : {data:[],error:null};
  if(candError) throw candError;

  const candMap=Object.fromEntries((candidates||[]).map(c=>[c.id,c]));
  const unassigned=apps.filter(a=>!a.current_stage_id);

  const columns=[...stages.map(s=>({id:s.id,name:s.name,apps:apps.filter(a=>a.current_stage_id===s.id)}))];
  if(unassigned.length) columns.unshift({id:'unassigned',name:t('No stage'),apps:unassigned});

  if(!columns.length){
    board.innerHTML=`<div class="empty">${t('This pipeline has no configured stages.')}</div>`;
    return;
  }

  board.innerHTML=columns.map(col=>`
    <div class="stage" data-stage-id="${col.id}" ondragover="pipelineDragOver(event)" ondragleave="pipelineDragLeave(event)" ondrop="pipelineDrop(event,'${col.id}')">
      <div class="stage-head"><span>${esc(col.name)}</span><span class="stage-count">${col.apps.length}</span></div>
      ${col.apps.length?col.apps.map(a=>{
        const c=candMap[a.candidate_id]||{};
        const age=daysBetween(a.updated_at||a.created_at,new Date());
        return `<div class="candidate-card" draggable="true" data-application-id="${a.id}" onclick="openCandidateDetail('${a.id}')" ondragstart="pipelineDragStart(event,'${a.id}')">
          <div class="cand-name">${esc(c.full_name||t('Unnamed candidate'))}</div>
          <div class="cand-meta">${esc(c.source||'—')} · ${age===null?'—':age+'d'}</div>
          <div class="cand-foot"><span class="pill ${pillForStatus(a.status)}">${esc(t(a.status))}</span><span class="tm">${age===null?'—':age+'d'}</span></div>
        </div>`;
      }).join(''):`<div class="empty" style="padding:16px">${t('No candidates')}</div>`}
    </div>`).join('');
}

document.getElementById('pipelineJobSelect')?.addEventListener('change',e=>renderPipelineForJob(e.target.value));


let draggedApplicationId=null;
function pipelineDragStart(event,applicationId){draggedApplicationId=applicationId;event.currentTarget.classList.add('dragging');event.dataTransfer.effectAllowed='move';}
function pipelineDragOver(event){event.preventDefault();event.currentTarget.classList.add('drop-target');event.dataTransfer.dropEffect='move';}
function pipelineDragLeave(event){event.currentTarget.classList.remove('drop-target');}
async function pipelineDrop(event,stageId){event.preventDefault();event.currentTarget.classList.remove('drop-target');document.querySelectorAll('.candidate-card.dragging').forEach(x=>x.classList.remove('dragging'));if(!draggedApplicationId||stageId==='unassigned')return;const id=draggedApplicationId;draggedApplicationId=null;await moveApplicationStage(id,stageId);}
