async function loadOnboarding(){
  if(managerRoles.includes(currentRole)) return;
  const tbody=document.getElementById('onboardingTable'); if(!tbody)return;
  try{
    const {data:hires,error}=await sb.from('hires').select('*').order('planned_start_date',{ascending:true}).limit(300);if(error)throw error;
    const list=hires||[];
    document.getElementById('onbPending').textContent=list.filter(h=>h.status==='pending').length;
    document.getElementById('onbConfirmed').textContent=list.filter(h=>h.status==='confirmed').length;
    document.getElementById('onbStarted').textContent=list.filter(h=>h.status==='started').length;
    const today=new Date();today.setHours(0,0,0,0);const soon=new Date(today);soon.setDate(soon.getDate()+14);
    document.getElementById('onbSoon').textContent=list.filter(h=>h.status!=='started'&&h.status!=='cancelled'&&h.planned_start_date&&new Date(h.planned_start_date+'T12:00:00')>=today&&new Date(h.planned_start_date+'T12:00:00')<=soon).length;
    if(!list.length){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:28px;color:#94A3B8">${t('No onboarding handoffs yet.')}</td></tr>`;return}
    const candIds=[...new Set(list.map(h=>h.candidate_id).filter(Boolean))],jobIds=[...new Set(list.map(h=>h.job_id).filter(Boolean))];
    const [cRes,jRes]=await Promise.all([candIds.length?sb.from('candidates').select('id,full_name').in('id',candIds):Promise.resolve({data:[]}),jobIds.length?sb.from('jobs').select('id,title').in('id',jobIds):Promise.resolve({data:[]})]);
    const cm=Object.fromEntries((cRes.data||[]).map(x=>[x.id,x.full_name])),jm=Object.fromEntries((jRes.data||[]).map(x=>[x.id,x.title]));
    tbody.innerHTML=list.map(h=>`<tr onclick="${h.offer_id?`openOfferDetail('${h.offer_id}')`:''}"><td class="tn">${esc(cm[h.candidate_id]||'—')}</td><td>${esc(jm[h.job_id]||'—')}</td><td>${fmtDate(h.planned_start_date)}</td><td>${esc(h.employee_id||'—')}</td><td><span class="pill ${pillForStatus(h.status)}">${esc(t(h.status))}</span></td></tr>`).join('');
  }catch(e){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:24px;color:#B91C1C">${esc(e.message)}</td></tr>`}
}

async function loadAnalytics(){
  if(managerRoles.includes(currentRole)) return;
  try{
    const [reqRes,hireRes,offerRes,appRes,candRes]=await Promise.all([
      sb.from('job_requisitions').select('requested_heads,status'),
      sb.from('hires').select('status'),
      sb.from('offers').select('status'),
      sb.from('applications').select('status'),
      sb.from('candidates').select('source')
    ]);
    [reqRes,hireRes,offerRes,appRes,candRes].forEach(r=>{if(r.error)throw r.error});
    const reqs=reqRes.data||[],hires=hireRes.data||[],offers=offerRes.data||[],apps=appRes.data||[],cands=candRes.data||[];
    document.getElementById('anRequested').textContent=reqs.filter(r=>r.status==='approved').reduce((s,r)=>s+(Number(r.requested_heads)||0),0);
    document.getElementById('anHires').textContent=hires.filter(h=>['pending','confirmed','started'].includes(h.status)).length;
    const responded=offers.filter(o=>['accepted','declined'].includes(o.status));document.getElementById('anAcceptance').textContent=responded.length?Math.round(responded.filter(o=>o.status==='accepted').length/responded.length*100)+'%':'—';
    document.getElementById('anActiveApps').textContent=apps.filter(a=>a.status==='active').length;
    const outcomes={};apps.forEach(a=>outcomes[a.status]=(outcomes[a.status]||0)+1);document.getElementById('analyticsOutcomes').innerHTML=Object.entries(outcomes).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="attention"><div class="att-main"><div class="att-title">${esc(t(k))}</div></div><div class="att-right"><div class="att-num">${v}</div></div></div>`).join('')||`<div class="empty">${t('No application data.')}</div>`;
    const sources={};cands.forEach(c=>{const s=(c.source||'Unknown').trim()||'Unknown';sources[s]=(sources[s]||0)+1});document.getElementById('analyticsSources').innerHTML=Object.entries(sources).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`<div class="attention"><div class="att-main"><div class="att-title">${esc(k)}</div></div><div class="att-right"><div class="att-num">${v}</div></div></div>`).join('')||`<div class="empty">${t('No source data.')}</div>`;
  }catch(e){console.error('[Catalyst analytics]',e)}
}
