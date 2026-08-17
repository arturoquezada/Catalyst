let candidateRows=[];

async function loadCandidates(){
  if(managerRoles.includes(currentRole)) return;
  const tbody=document.getElementById('candidateTableBody');
  const errorBox=document.getElementById('candidateDataError');
  if(!tbody) return;
  errorBox.style.display='none';
  tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;color:#94A3B8;padding:24px">${t('Loading candidates…')}</td></tr>`;

  try{
    const {data:apps,error}=await sb.from('applications')
      .select('id,candidate_id,job_id,status,current_stage_id,updated_at,created_at')
      .order('updated_at',{ascending:false})
      .limit(500);
    if(error) throw error;

    const candidateIds=[...new Set((apps||[]).map(a=>a.candidate_id).filter(Boolean))];
    const jobIds=[...new Set((apps||[]).map(a=>a.job_id).filter(Boolean))];
    const stageIds=[...new Set((apps||[]).map(a=>a.current_stage_id).filter(Boolean))];

    const [candRes,jobRes,stageRes]=await Promise.all([
      candidateIds.length?sb.from('candidates').select('id,full_name,email,phone,source,created_at').in('id',candidateIds):Promise.resolve({data:[]}),
      jobIds.length?sb.from('jobs').select('id,title,status').in('id',jobIds):Promise.resolve({data:[]}),
      stageIds.length?sb.from('stages').select('id,name').in('id',stageIds):Promise.resolve({data:[]})
    ]);

    if(candRes.error) throw candRes.error;
    if(jobRes.error) throw jobRes.error;
    if(stageRes.error) throw stageRes.error;

    const candMap=Object.fromEntries((candRes.data||[]).map(c=>[c.id,c]));
    const jobMap=Object.fromEntries((jobRes.data||[]).map(j=>[j.id,j]));
    const stageMap=Object.fromEntries((stageRes.data||[]).map(s=>[s.id,s]));

    candidateRows=(apps||[]).map(a=>({
      ...a,
      candidate:candMap[a.candidate_id]||{},
      job:jobMap[a.job_id]||{},
      stage:stageMap[a.current_stage_id]||{}
    }));

    populateCandidateJobFilter();
    renderCandidates();
  }catch(e){
    console.error('[Catalyst candidates]',e);
    tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;color:#B91C1C;padding:24px">${t('Could not load candidates.')}</td></tr>`;
    errorBox.textContent=e.message||t('Could not load candidates.');
    errorBox.style.display='block';
  }
}

function populateCandidateJobFilter(){
  const select=document.getElementById('candidateJobFilter');
  if(!select) return;
  const selected=select.value;
  const jobs=[...new Map(candidateRows.filter(r=>r.job?.id).map(r=>[r.job.id,r.job])).values()]
    .sort((a,b)=>(a.title||'').localeCompare(b.title||''));
  select.innerHTML=`<option value="">${t('All jobs')}</option>`+jobs.map(j=>`<option value="${esc(j.id)}">${esc(j.title)}</option>`).join('');
  if(jobs.some(j=>j.id===selected)) select.value=selected;
}

function renderCandidates(){
  const tbody=document.getElementById('candidateTableBody');
  if(!tbody) return;
  const search=(document.getElementById('candidateSearch')?.value||'').trim().toLowerCase();
  const jobId=document.getElementById('candidateJobFilter')?.value||'';

  const rows=candidateRows.filter(r=>{
    const c=r.candidate||{};
    const hay=[c.full_name,c.email,c.phone].filter(Boolean).join(' ').toLowerCase();
    return (!search || hay.includes(search)) && (!jobId || r.job_id===jobId);
  });

  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;color:#94A3B8;padding:28px">${t('No candidates match the current filters.')}</td></tr>`;
    return;
  }

  tbody.innerHTML=rows.map(r=>{
    const c=r.candidate||{};
    const last=new Date(r.updated_at||r.created_at).toLocaleString(currentLanguage==='es'?'es-MX':'en-US',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<tr onclick="openCandidateDetail('${r.id}')">
      <td><div class="tn">${esc(c.full_name||t('Unnamed candidate'))}</div><div class="tm">${esc(c.email||c.phone||'—')}</div></td>
      <td>${esc(r.job?.title||'—')}</td>
      <td>${esc(r.stage?.name||t('No stage'))}</td>
      <td>${esc(c.source||'—')}</td>
      <td>${esc(last)}</td>
      <td><span class="pill ${pillForStatus(r.status)}">${esc(t(String(r.status||'').replaceAll('_',' ')))}</span></td>
    </tr>`;
  }).join('');
}

document.getElementById('candidateSearch')?.addEventListener('input',renderCandidates);
document.getElementById('candidateJobFilter')?.addEventListener('change',renderCandidates);
