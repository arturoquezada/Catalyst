async function loadJobs(){
  const grid=document.getElementById('jobsGrid');
  if(!grid || !currentEmpleado) return;
  grid.innerHTML=`<div class="empty job-empty">${t('Loading jobs…')}</div>`;

  try{
    const {data:jobs,error}=await sb.from('jobs')
      .select('id,title,department,campaign,headcount_requested,status,open_date,target_start_date,recruiter_owner_id,priority,target_fill_date,pipeline_id,linked_requisition_id')
      .order('created_at',{ascending:false})
      .limit(100);
    if(error) throw error;

    const ownerIds=[...new Set((jobs||[]).map(j=>j.recruiter_owner_id).filter(Boolean))];
    const owners={};
    if(ownerIds.length){
      const {data:emps}=await sb.from('empleados').select('id,nombre_completo,nombre').in('id',ownerIds);
      (emps||[]).forEach(e=>owners[e.id]=e.nombre_completo||e.nombre||'—');
    }

    const jobIds=(jobs||[]).map(j=>j.id);
    const appCounts={};
    if(jobIds.length){
      const {data:apps}=await sb.from('applications').select('job_id,status').in('job_id',jobIds);
      (apps||[]).forEach(a=>{appCounts[a.job_id]=(appCounts[a.job_id]||0)+1});
    }

    if(!jobs?.length){grid.innerHTML=`<div class="empty job-empty">${t('No jobs yet.')}</div>`;return}

    grid.innerHTML=jobs.map(j=>{
      const openDays=j.open_date?Math.max(0,Math.floor((Date.now()-new Date(j.open_date+'T12:00:00').getTime())/86400000)):0;
      const priority=String(j.priority||'medium').toLowerCase();
      const status=String(j.status||'').replaceAll('_',' ');
      return `<div class="job-card" onclick="openJobDetail('${j.id}')">
        <div class="job-top"><div><div class="job-title">${esc(j.title)}</div><div class="job-meta">${esc(j.campaign||j.department||'—')} · ${esc(owners[j.recruiter_owner_id]||t('Unassigned'))}</div></div><span class="pill ${pillForStatus(j.status)}">${esc(t(status))}</span></div>
        <div class="progress"><span style="width:${j.status==='closed'?100:Math.min(90,Math.max(8,100-(openDays*1.5)))}%"></span></div>
        <div class="job-stats">
          <div class="js"><div class="jsv">${esc(j.headcount_requested)}</div><div class="jsl">${t('Headcount')}</div></div>
          <div class="js"><div class="jsv">${openDays}d</div><div class="jsl">${t('Open')}</div></div>
          <div class="js"><div class="jsv">${appCounts[j.id]||0}</div><div class="jsl">${t('Candidates')}</div></div>
        </div>
        <div class="job-meta" style="margin-top:10px">${t('Target fill')}: ${fmtDate(j.target_fill_date)} · ${t(priority)}</div>
      </div>`;
    }).join('');
    translateRoot(grid);
  }catch(e){
    console.error('[Catalyst jobs]',e);
    grid.innerHTML=`<div class="empty job-empty" style="color:#B91C1C">${esc(e.message||t('Could not load jobs.'))}</div>`;
  }
}
