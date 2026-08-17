async function loadOffers(){
  if(managerRoles.includes(currentRole)) return;
  const tbody=document.getElementById('offersTableBody');
  const errorBox=document.getElementById('offersDataError');
  if(!tbody) return;
  errorBox.style.display='none';
  tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:#94A3B8;padding:24px">${t('Loading offers…')}</td></tr>`;

  try{
    const {data:offers,error}=await sb.from('offers')
      .select('id,application_id,status,current_version_id,created_at,sent_at,accepted_at')
      .order('created_at',{ascending:false})
      .limit(300);
    if(error) throw error;

    const list=offers||[];
    document.getElementById('offerDraftCount').textContent=list.filter(o=>o.status==='draft').length;
    document.getElementById('offerPendingCount').textContent=list.filter(o=>o.status==='pending_approval').length;
    document.getElementById('offerSentCount').textContent=list.filter(o=>['sent','negotiation','ready_to_send'].includes(o.status)).length;
    document.getElementById('offerAcceptedCount').textContent=list.filter(o=>o.status==='accepted').length;

    if(!list.length){
      tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:#94A3B8;padding:28px">${t('No offers have been created yet.')}</td></tr>`;
      return;
    }

    const appIds=[...new Set(list.map(o=>o.application_id).filter(Boolean))];
    const versionIds=[...new Set(list.map(o=>o.current_version_id).filter(Boolean))];

    const [appRes,versionRes,hireRes]=await Promise.all([
      sb.from('applications').select('id,candidate_id,job_id').in('id',appIds),
      versionIds.length?sb.from('offer_versions').select('id,offer_id,version_number,salary,currency,planned_start_date').in('id',versionIds):Promise.resolve({data:[]}),
      sb.from('hires').select('id,offer_id,status,employee_id').in('offer_id',list.map(o=>o.id))
    ]);
    if(appRes.error) throw appRes.error;
    if(versionRes.error) throw versionRes.error;
    if(hireRes.error) throw hireRes.error;

    const apps=appRes.data||[];
    const candIds=[...new Set(apps.map(a=>a.candidate_id).filter(Boolean))];
    const jobIds=[...new Set(apps.map(a=>a.job_id).filter(Boolean))];
    const [candRes,jobRes]=await Promise.all([
      candIds.length?sb.from('candidates').select('id,full_name').in('id',candIds):Promise.resolve({data:[]}),
      jobIds.length?sb.from('jobs').select('id,title').in('id',jobIds):Promise.resolve({data:[]})
    ]);

    const appMap=Object.fromEntries(apps.map(a=>[a.id,a]));
    const candMap=Object.fromEntries((candRes.data||[]).map(c=>[c.id,c.full_name]));
    const jobMap=Object.fromEntries((jobRes.data||[]).map(j=>[j.id,j.title]));
    const versionMap=Object.fromEntries((versionRes.data||[]).map(v=>[v.id,v]));
    const hireMap=Object.fromEntries((hireRes.data||[]).map(h=>[h.offer_id,h]));

    tbody.innerHTML=list.map(o=>{
      const a=appMap[o.application_id]||{};
      const v=versionMap[o.current_version_id]||{};
      const h=hireMap[o.id];
      const salary=v.salary!=null ? new Intl.NumberFormat(currentLanguage==='es'?'es-MX':'en-US',{style:'currency',currency:v.currency||'MXN',maximumFractionDigits:0}).format(v.salary) : '—';
      const impulse=h?.employee_id ? h.employee_id : (h ? t('Pending') : '—');
      return `<tr onclick="openOfferDetail('${o.id}')">
        <td class="tn">${esc(candMap[a.candidate_id]||t('Candidate'))}</td>
        <td>${esc(jobMap[a.job_id]||'—')}</td>
        <td>${v.version_number?`V${esc(v.version_number)}`:'—'}</td>
        <td>${esc(salary)}</td>
        <td>${fmtDate(v.planned_start_date)}</td>
        <td><span class="pill ${pillForStatus(o.status)}">${esc(t(String(o.status||'').replaceAll('_',' ')))}</span></td>
        <td>${esc(impulse)}</td>
      </tr>`;
    }).join('');
  }catch(e){
    console.error('[Catalyst offers]',e);
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:#B91C1C;padding:24px">${t('Could not load offers.')}</td></tr>`;
    errorBox.textContent=e.message||t('Could not load offers.');
    errorBox.style.display='block';
  }
}
