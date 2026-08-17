async function loginCatalyst(){
  const email=document.getElementById('loginEmail').value.trim(),password=document.getElementById('loginPassword').value,err=document.getElementById('loginError'),btn=document.getElementById('loginBtn');
  err.style.display='none'; if(!email||!password){err.textContent='Enter your email and password.';err.style.display='block';return}
  btn.disabled=true;btn.textContent='Signing in…';
  try{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;await startCatalyst(data.user)}
  catch(e){err.textContent=e.message||'Could not sign in.';err.style.display='block'}
  finally{btn.disabled=false;btn.textContent='Sign in'}
}

async function startCatalyst(user){
  showLoading(true);
  try{
    currentUser=user;
    const {data:emp,error}=await sb.from('empleados').select('id,nombre,nombre_completo,correo_corporativo,role_id,roles(name)').ilike('correo_corporativo',(user.email||'').toLowerCase()).maybeSingle();
    if(error)throw error;if(!emp)throw new Error('Authenticated, but no empleados record is linked to this email.');
    currentEmpleado=emp;currentRole=emp.roles?.name||null;
    const allowed=[...managerRoles,...taRoles,...hopRoles];if(!allowed.includes(currentRole))throw new Error('Your role does not have access to Catalyst.');
    document.getElementById('authScreen').style.display='none';
    document.getElementById('sbUserName').textContent=emp.nombre_completo||emp.nombre||user.email;
    document.getElementById('sbUserRole').textContent=roleLabel(currentRole);
    document.getElementById('sbUserAv').textContent=initials(emp.nombre_completo||emp.nombre||user.email);
    const h1=document.querySelector('#dashboard .hero h1');if(h1){const first=(emp.nombre||emp.nombre_completo||'').split(' ')[0]||'';h1.textContent=currentLanguage==='es'?`Buenos días, ${first}.`:`Good morning, ${first}.`;}
    applyRoleVisibility();
    updateClock();
    const initialLoads=[loadDashboard(),loadRequisitions(),typeof loadJobs==='function'?loadJobs():Promise.resolve()];
    if(!managerRoles.includes(currentRole)){
      initialLoads.push(
        typeof loadCandidates==='function'?loadCandidates():Promise.resolve(),
        typeof loadOffers==='function'?loadOffers():Promise.resolve()
      );
    }
    await Promise.allSettled(initialLoads);
  }finally{showLoading(false)}
}

async function logoutCatalyst(){await sb.auth.signOut();location.reload()}


function applyRoleVisibility(){
  const isMgr=managerRoles.includes(currentRole);
  const canCreate=isMgr || hopRoles.includes(currentRole);

  document.querySelectorAll('[onclick="openRequisitionModal()"]').forEach(btn=>{
    btn.style.display=canCreate ? '' : 'none';
  });

  ['candidates','pipeline','offers','onboarding','analytics'].forEach(page=>{
    document.querySelectorAll(`[data-page="${page}"]`).forEach(el=>{
      el.style.display=isMgr ? 'none' : '';
    });
  });

  if(isMgr && ['candidates','pipeline','offers','onboarding','analytics'].includes(document.querySelector('.page.active')?.id)){
    go('dashboard');
  }
}
