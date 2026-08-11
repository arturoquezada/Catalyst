async function countRows(table,configure){
  let q=sb.from(table).select('*',{count:'exact',head:true});
  if(configure) q=configure(q);
  const {count,error}=await q;
  if(error) throw error;
  return count||0;
}

function daysBetween(from,to){
  if(!from || !to) return null;
  const a=new Date(from);
  const b=new Date(to);
  if(Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0,Math.round((b-a)/86400000));
}

function renderDashboardEmpty(containerId,message){
  const el=document.getElementById(containerId);
  if(el) el.innerHTML=`<div class="empty">${esc(message)}</div>`;
}

async function loadDashboard(){
  const isMgr=managerRoles.includes(currentRole);

  try{
    const jobsPromise=sb.from('jobs')
      .select('id,title,status,open_date,target_fill_date,recruiter_owner_id,headcount_requested,created_at')
      .eq('status','open')
      .order('open_date',{ascending:true});

    const reqPromise=sb.from('job_requisitions')
      .select('id,status,created_at,position_title,priority')
      .in('status',['submitted','approved'])
      .order('created_at',{ascending:true});

    const [jobsRes,reqRes]=await Promise.all([jobsPromise,reqPromise]);
    if(jobsRes.error) throw jobsRes.error;
    if(reqRes.error) throw reqRes.error;

    const jobs=jobsRes.data||[];
    const reqs=reqRes.data||[];

    document.getElementById('kpiOpenJobs').textContent=jobs.length;

    if(isMgr){
      document.getElementById('kpiActiveCandidates').textContent='—';
      document.getElementById('kpiInterviews').textContent='—';
      document.getElementById('kpiOffers').textContent='—';
    }else{
      const [apps,ints,offs]=await Promise.all([
        countRows('applications',q=>q.eq('status','active')),
        countRows('interviews',q=>q.eq('status','scheduled')),
        countRows('offers',q=>q.in('status',['pending_approval','ready_to_send','sent','negotiation']))
      ]);
      document.getElementById('kpiActiveCandidates').textContent=apps;
      document.getElementById('kpiInterviews').textContent=ints;
      document.getElementById('kpiOffers').textContent=offs;
    }

    // Attention = objective live conditions only.
    const jobIds=jobs.map(j=>j.id);
    const appCounts={};
    if(jobIds.length && !isMgr){
      const {data:apps,error}=await sb.from('applications').select('job_id').in('job_id',jobIds).eq('status','active');
      if(!error) (apps||[]).forEach(a=>appCounts[a.job_id]=(appCounts[a.job_id]||0)+1);
    }

    const today=new Date();
    today.setHours(0,0,0,0);
    const risks=[];

    jobs.forEach(j=>{
      const openDays=j.open_date ? daysBetween(j.open_date+'T12:00:00',new Date()) : null;
      const target=j.target_fill_date ? new Date(j.target_fill_date+'T12:00:00') : null;
      const daysToTarget=target ? Math.ceil((target-today)/86400000) : null;

      if(!j.recruiter_owner_id){
        risks.push({level:'red',title:j.title,sub:t('No recruiter owner assigned'),num:'—',label:t('owner'),page:'jobs'});
      }else if(daysToTarget!==null && daysToTarget<0){
        risks.push({level:'red',title:j.title,sub:t('Target fill date has passed'),num:Math.abs(daysToTarget)+'d',label:t('overdue'),page:'jobs'});
      }else if(daysToTarget!==null && daysToTarget<=7){
        risks.push({level:'amber',title:j.title,sub:t('Target fill date is within 7 days'),num:daysToTarget+'d',label:t('left'),page:'jobs'});
      }else if(!isMgr && (appCounts[j.id]||0)===0){
        risks.push({level:'amber',title:j.title,sub:t('No active candidates'),num:openDays!==null?openDays+'d':'—',label:t('open'),page:'jobs'});
      }else if(openDays!==null && openDays>=30){
        risks.push({level:'amber',title:j.title,sub:t('Open for 30+ days'),num:openDays+'d',label:t('open'),page:'jobs'});
      }
    });

    reqs.filter(r=>r.status==='submitted').forEach(r=>{
      const age=daysBetween(r.created_at,new Date());
      if(age!==null && age>=2){
        risks.push({level:'amber',title:r.position_title||t('Untitled requisition'),sub:t('Requisition awaiting approval'),num:age+'d',label:t('waiting'),page:'requisitions'});
      }
    });

    const attention=document.getElementById('attentionList');
    const count=document.getElementById('attentionCount');
    count.textContent=risks.length;
    count.className='pill '+(risks.some(r=>r.level==='red')?'pr':risks.length?'pa':'pg');

    if(!risks.length){
      attention.innerHTML=`<div class="empty">${t('No current recruiting risks based on configured dates and ownership.')}</div>`;
    }else{
      attention.innerHTML=risks.slice(0,6).map(r=>`
        <div class="attention ${r.level}" onclick="go('${r.page}')">
          <div class="att-main"><div class="att-title">${esc(r.title)}</div><div class="att-sub">${esc(r.sub)}</div></div>
          <div class="att-right"><div class="att-num">${esc(r.num)}</div><div class="att-label">${esc(r.label)}</div></div>
        </div>`).join('');
    }

    // Bit uses the exact same live conditions.
    const noOwner=jobs.filter(j=>!j.recruiter_owner_id).length;
    const dueSoon=jobs.filter(j=>{
      if(!j.target_fill_date) return false;
      const d=Math.ceil((new Date(j.target_fill_date+'T12:00:00')-today)/86400000);
      return d>=0 && d<=7;
    }).length;
    const pendingReq=reqs.filter(r=>r.status==='submitted').length;

    const bitCopy=document.getElementById('bitCopy');
    const bitAction=document.getElementById('bitAction');
    if(noOwner){
      bitCopy.textContent=currentLanguage==='es'
        ? `${noOwner} vacante${noOwner===1?'':'s'} abierta${noOwner===1?'':'s'} no tiene${noOwner===1?'':'n'} recruiter owner.`
        : `${noOwner} open job${noOwner===1?'':'s'} ${noOwner===1?'has':'have'} no recruiter owner.`;
      bitAction.textContent=t('Review jobs'); bitAction.onclick=()=>go('jobs');
    }else if(dueSoon){
      bitCopy.textContent=currentLanguage==='es'
        ? `${dueSoon} vacante${dueSoon===1?'':'s'} llega${dueSoon===1?'':'n'} a su target fill date en los próximos 7 días.`
        : `${dueSoon} job${dueSoon===1?'':'s'} ${dueSoon===1?'reaches':'reach'} target fill date within 7 days.`;
      bitAction.textContent=t('Review jobs'); bitAction.onclick=()=>go('jobs');
    }else if(pendingReq){
      bitCopy.textContent=currentLanguage==='es'
        ? `${pendingReq} requisición${pendingReq===1?'':'es'} pendiente${pendingReq===1?'':'s'} de decisión.`
        : `${pendingReq} requisition${pendingReq===1?' is':'s are'} awaiting a decision.`;
      bitAction.textContent=t('Review requisitions'); bitAction.onclick=()=>go('requisitions');
    }else{
      bitCopy.textContent=t('No immediate recruiting exception is currently detected.');
      bitAction.textContent=t('Review jobs'); bitAction.onclick=()=>go('jobs');
    }

    if(!isMgr){
      await loadDashboardActivityAndVelocity(jobs);
    }else{
      renderDashboardEmpty('recentActivityList',t('Candidate activity is available to TA and People only.'));
      document.getElementById('metricTimeToFill').textContent='—';
      document.getElementById('metricOfferAcceptance').textContent='—';
      document.getElementById('metricJobsOnTarget').textContent='—';
    }

    translateRoot(document.getElementById('dashboard'));
  }catch(e){
    console.error('[Catalyst dashboard]',e);
    renderDashboardEmpty('attentionList',t('Could not load live dashboard data.'));
    renderDashboardEmpty('recentActivityList',t('Could not load recent activity.'));
  }
}

async function loadDashboardActivityAndVelocity(openJobs){
  // Recent application events
  const {data:events,error:eventError}=await sb.from('application_events')
    .select('id,application_id,event_type,from_stage_id,to_stage_id,notes,created_at')
    .order('created_at',{ascending:false})
    .limit(8);

  if(eventError){
    console.warn('[Catalyst activity]',eventError);
    renderDashboardEmpty('recentActivityList',t('No recent activity available.'));
  }else if(!events?.length){
    renderDashboardEmpty('recentActivityList',t('No recruiting activity has been recorded yet.'));
  }else{
    const appIds=[...new Set(events.map(e=>e.application_id).filter(Boolean))];
    const {data:apps}=await sb.from('applications').select('id,candidate_id,job_id').in('id',appIds);
    const appMap=Object.fromEntries((apps||[]).map(a=>[a.id,a]));
    const candIds=[...new Set((apps||[]).map(a=>a.candidate_id).filter(Boolean))];
    const jobIds=[...new Set((apps||[]).map(a=>a.job_id).filter(Boolean))];
    const [candRes,jobRes]=await Promise.all([
      candIds.length?sb.from('candidates').select('id,full_name').in('id',candIds):Promise.resolve({data:[]}),
      jobIds.length?sb.from('jobs').select('id,title').in('id',jobIds):Promise.resolve({data:[]})
    ]);
    const candMap=Object.fromEntries((candRes.data||[]).map(c=>[c.id,c.full_name]));
    const jobMap=Object.fromEntries((jobRes.data||[]).map(j=>[j.id,j.title]));
    const box=document.getElementById('recentActivityList');
    box.innerHTML=events.map(e=>{
      const a=appMap[e.application_id]||{};
      const who=candMap[a.candidate_id]||t('Candidate');
      const job=jobMap[a.job_id]||t('Recruiting');
      const label=t(String(e.event_type||'event').replaceAll('_',' '));
      const when=new Date(e.created_at).toLocaleString(currentLanguage==='es'?'es-MX':'en-US',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
      return `<div class="attention"><div class="att-main"><div class="att-title">${esc(who)} · ${esc(label)}</div><div class="att-sub">${esc(job)} · ${esc(when)}</div></div></div>`;
    }).join('');
  }

  // Time to fill based only on recorded hires + job open_date.
  const {data:hires}=await sb.from('hires')
    .select('id,job_id,status,created_at,actual_start_date')
    .in('status',['confirmed','started'])
    .order('created_at',{ascending:false})
    .limit(200);

  let ttfValues=[];
  if(hires?.length){
    const jobIds=[...new Set(hires.map(h=>h.job_id).filter(Boolean))];
    const {data:jobs}=await sb.from('jobs').select('id,open_date').in('id',jobIds);
    const jobMap=Object.fromEntries((jobs||[]).map(j=>[j.id,j]));
    ttfValues=hires.map(h=>{
      const j=jobMap[h.job_id];
      return j?.open_date ? daysBetween(j.open_date+'T12:00:00',h.created_at) : null;
    }).filter(v=>v!==null);
  }
  const avgTtf=ttfValues.length?Math.round(ttfValues.reduce((a,b)=>a+b,0)/ttfValues.length):null;
  document.getElementById('metricTimeToFill').textContent=avgTtf===null?'—':`${avgTtf} ${t('days')}`;
  document.getElementById('metricTimeToFillBar').style.width=avgTtf===null?'0%':`${Math.max(5,Math.min(100,100-(avgTtf/60*100)))}%`;

  // Offer acceptance from offers that reached a terminal candidate response.
  const {data:offers}=await sb.from('offers').select('status,sent_at');
  const responded=(offers||[]).filter(o=>['accepted','declined'].includes(o.status));
  const accepted=responded.filter(o=>o.status==='accepted').length;
  const acceptance=responded.length?Math.round(accepted/responded.length*100):null;
  document.getElementById('metricOfferAcceptance').textContent=acceptance===null?'—':`${acceptance}%`;
  document.getElementById('metricOfferAcceptanceBar').style.width=acceptance===null?'0%':`${acceptance}%`;

  // Jobs on target = open jobs with target_fill_date today or future / open jobs with a configured target.
  const configured=openJobs.filter(j=>j.target_fill_date);
  const today=new Date(); today.setHours(0,0,0,0);
  const onTarget=configured.filter(j=>new Date(j.target_fill_date+'T12:00:00')>=today).length;
  const pct=configured.length?Math.round(onTarget/configured.length*100):null;
  document.getElementById('metricJobsOnTarget').textContent=pct===null?'—':`${pct}%`;
  document.getElementById('metricJobsOnTargetBar').style.width=pct===null?'0%':`${pct}%`;
}
