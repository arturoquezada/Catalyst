async function loadRequisitions(){
  if(!currentEmpleado)return;
  const tbody=document.getElementById('reqTableBody'),box=document.getElementById('reqDataError');box.style.display='none';
  tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:#94A3B8;padding:24px">Loading requisitions…</td></tr>';
  try{
    const {data,error}=await sb.from('job_requisitions').select('id,position_title,campaign,lob,requested_heads,priority,requisition_type,start_date,status,created_by,created_at').order('created_at',{ascending:false}).limit(200);
    if(error)throw error;requisitions=data||[];
    const ids=[...new Set(requisitions.map(r=>r.created_by).filter(Boolean))],creators={};
    if(ids.length){const {data:emps}=await sb.from('empleados').select('id,nombre_completo,nombre').in('id',ids);(emps||[]).forEach(e=>creators[e.id]=e.nombre_completo||e.nombre||'—')}
    tbody.innerHTML=requisitions.length?requisitions.map(r=>`<tr><td><div class="tn">${esc(r.position_title||'Untitled requisition')}</div><div class="tm">${esc(r.id.slice(0,8).toUpperCase())}</div></td><td>${esc(r.campaign||'—')} · ${esc(r.lob||'—')}</td><td>${esc(r.requested_heads)}</td><td><span class="pill ${r.priority==='high'?'pr':r.priority==='medium'?'pa':'pgr'}">${esc(r.priority||'medium')}</span></td><td>${esc(creators[r.created_by]||'—')}</td><td>${fmtDate(r.start_date)}</td><td><span class="pill ${pillForStatus(r.status)}">${esc(String(r.status||'').replaceAll('_',' '))}</span></td></tr>`).join(''):'<tr><td colspan="7" style="text-align:center;color:#94A3B8;padding:28px">No requisitions yet.</td></tr>';
    document.getElementById('reqPending').textContent=requisitions.filter(r=>['submitted','pending'].includes(r.status)).length;
    document.getElementById('reqApproved').textContent=requisitions.filter(r=>r.status==='approved').length;
    document.getElementById('reqChanges').textContent=requisitions.filter(r=>['returned','changes_requested'].includes(r.status)).length;
    document.getElementById('reqHeadcount').textContent=requisitions.filter(r=>r.status!=='rejected').reduce((s,r)=>s+(Number(r.requested_heads)||0),0);
  }catch(e){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:#B91C1C;padding:24px">Could not load requisitions.</td></tr>';box.textContent=e.message||'Could not load requisitions.';box.style.display='block'}
}

function openRequisitionModal(){document.getElementById('reqModal').classList.add('show')}

function closeRequisitionModal(){document.getElementById('reqModal').classList.remove('show')}

function reqPayload(status){return{campaign:document.getElementById('reqCampaign').value,lob:document.getElementById('reqLob').value.trim(),requested_heads:Number(document.getElementById('reqHeads').value||0),schedule_text:document.getElementById('reqSchedule').value.trim(),reason:document.getElementById('reqReason').value.trim(),start_date:document.getElementById('reqStartDate').value,status,created_by:currentEmpleado.id,approver_role_name:'head_people',position_title:document.getElementById('reqPosition').value.trim(),requisition_type:document.getElementById('reqType').value,priority:document.getElementById('reqPriority').value}}

async function createReq(status){
  const p=reqPayload(status),missing=[];if(!p.position_title)missing.push('Position title');if(!p.lob)missing.push('LOB');if(!p.requested_heads)missing.push('Headcount');if(!p.schedule_text)missing.push('Schedule');if(!p.reason)missing.push('Justification');if(!p.start_date)missing.push('Start date');
  if(missing.length){alert('Complete: '+missing.join(', '));return}
  showLoading(true);try{const {error}=await sb.from('job_requisitions').insert(p);if(error)throw error;closeRequisitionModal();await Promise.all([loadRequisitions(),loadDashboard()]);go('requisitions')}catch(e){alert(e.message||'Could not create requisition.')}finally{showLoading(false)}
}

async function saveDraft(){await createReq('draft')}

async function submitReq(){await createReq('submitted')}
