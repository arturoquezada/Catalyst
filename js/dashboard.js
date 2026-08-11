async function countRows(table,configure){let q=sb.from(table).select('*',{count:'exact',head:true});if(configure)q=configure(q);const {count,error}=await q;if(error)throw error;return count||0}

async function loadDashboard(){
  const isMgr=managerRoles.includes(currentRole);
  try{
    const [jobs,apps,ints,offs]=await Promise.all([
      countRows('jobs',q=>q.eq('status','open')),
      isMgr?Promise.resolve(null):countRows('applications',q=>q.eq('status','active')),
      isMgr?Promise.resolve(null):countRows('interviews',q=>q.eq('status','scheduled')),
      isMgr?Promise.resolve(null):countRows('offers',q=>q.in('status',['pending_approval','ready_to_send','sent','negotiation']))
    ]);
    document.getElementById('kpiOpenJobs').textContent=jobs;
    document.getElementById('kpiActiveCandidates').textContent=isMgr?'—':apps;
    document.getElementById('kpiInterviews').textContent=isMgr?'—':ints;
    document.getElementById('kpiOffers').textContent=isMgr?'—':offs;
  }catch(e){console.error('[Catalyst dashboard]',e)}
}
