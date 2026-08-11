const titles={
  dashboard:'Dashboard',
  requisitions:'Requisitions',
  jobs:'Jobs',
  candidates:'Candidates',
  pipeline:'Pipeline',
  offers:'Offers & Hires',
  onboarding:'Onboarding',
  analytics:'People Analytics'
};

function esc(v){
  return String(v ?? '').replace(/[&<>"']/g,m=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[m]));
}

function initials(n){
  return String(n || 'CX')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0,2)
    .map(x=>x[0])
    .join('')
    .toUpperCase();
}

function fmtDate(v){
  if(!v) return '—';
  return new Date(v+'T12:00:00').toLocaleDateString(
    currentLanguage === 'es' ? 'es-MX' : 'en-US',
    {day:'2-digit',month:'short',year:'numeric'}
  );
}

function roleLabel(r){
  return ({
    head_people:'Head of People',
    ceo:'CEO',
    talent:'Talent',
    ta_manager:'TA Manager',
    ta_analyst:'TA Analyst',
    manager:'Manager',
    'sr manager':'Sr Manager',
    jr_manager:'Jr Manager'
  })[r] || r || 'User';
}

function pillForStatus(s){
  s=String(s||'').toLowerCase();
  if(['approved','accepted','hired','open'].includes(s)) return 'pg';
  if(['rejected','declined','cancelled'].includes(s)) return 'pr';
  if(['submitted','pending','pending_approval'].includes(s)) return 'pb';
  if(['returned','changes_requested','paused'].includes(s)) return 'pa';
  return 'pgr';
}

function showLoading(on){
  document.getElementById('loadingOverlay')?.classList.toggle('show',!!on);
}

function go(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(page)?.classList.add('active');

  const topTitle=document.getElementById('topTitle');
  if(topTitle) topTitle.textContent=localizedTitle(page);

  document.querySelectorAll('[data-page]').forEach(el=>{
    el.classList.toggle('active',el.dataset.page===page);
  });

  if(page==='requisitions') loadRequisitions();
  if(page==='jobs' && typeof loadJobs==='function') loadJobs();
}

function updateClock(){
  const e=document.getElementById('liveDate');
  if(!e) return;
  e.textContent=new Date().toLocaleString(
    currentLanguage === 'es' ? 'es-MX' : 'en-US',
    {weekday:'short',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}
  );
}

document.querySelectorAll('[data-page]').forEach(el=>{
  el.addEventListener('click',()=>go(el.dataset.page));
});

setInterval(updateClock,60000);

document.getElementById('reqModal')?.addEventListener('click',e=>{
  if(e.target.id==='reqModal') closeRequisitionModal();
});

document.getElementById('loginPassword')?.addEventListener('keydown',e=>{
  if(e.key==='Enter') loginCatalyst();
});

applyPreferences();
updateClock();

(async()=>{
  const {data:{session}}=await sb.auth.getSession();

  if(session?.user){
    try{
      await startCatalyst(session.user);
    }catch(e){
      console.error('[Catalyst startup]',e);
      await sb.auth.signOut();
      const er=document.getElementById('loginError');
      if(er){
        er.textContent=e.message || 'Could not start Catalyst.';
        er.style.display='block';
      }
      document.getElementById('authScreen').style.display='flex';
    }
  }else{
    document.getElementById('authScreen').style.display='flex';
  }
})();
