const I18N={
 en:{tagline:'People Operating System',dashboard:'Dashboard',recruiting:'Recruiting',requisitions:'Requisitions',jobs:'Jobs',candidates:'Candidates',pipeline:'Pipeline',offersHires:'Offers & Hires',onboarding:'Onboarding',peopleAnalytics:'People Analytics',logout:'Log out',live:'Live',dashboardSubtitle:'Here is the current hiring health across Catalyst.',requisitionsSubtitle:'Request, approve, and convert headcount into active recruiting work.',welcome:'Welcome to Catalyst',authCopy:'Use the same corporate credentials you use for Impulse.'},
 es:{tagline:'Sistema Operativo de People',dashboard:'Dashboard',recruiting:'Recruiting',requisitions:'Requisiciones',jobs:'Vacantes',candidates:'Candidatos',pipeline:'Pipeline',offersHires:'Ofertas y Contrataciones',onboarding:'Onboarding',peopleAnalytics:'People Analytics',logout:'Cerrar sesión',live:'En vivo',dashboardSubtitle:'Este es el estado actual de contratación en Catalyst.',requisitionsSubtitle:'Solicita, aprueba y convierte headcount en trabajo activo de recruiting.',welcome:'Bienvenido a Catalyst',authCopy:'Usa las mismas credenciales corporativas que utilizas en Impulse.'}
};
let currentLanguage=localStorage.getItem('catalyst_language')||'en';
let currentTheme=localStorage.getItem('catalyst_theme')||'light';
function localizedTitle(page){
 const map={dashboard:'dashboard',requisitions:'requisitions',jobs:'jobs',candidates:'candidates',pipeline:'pipeline',offers:'offersHires',onboarding:'onboarding',analytics:'peopleAnalytics'};
 return I18N[currentLanguage]?.[map[page]]||titles[page]||'Catalyst';
}
function applyPreferences(){
 document.documentElement.setAttribute('data-theme',currentTheme);
 document.documentElement.lang=currentLanguage;
 const t=document.getElementById('themeToggle'); if(t)t.textContent=currentTheme==='dark'?'☀':'☾';
 const l=document.getElementById('langToggle'); if(l)l.textContent=currentLanguage.toUpperCase();
 document.querySelectorAll('[data-i18n]').forEach(el=>{const v=I18N[currentLanguage]?.[el.dataset.i18n];if(v)el.textContent=v});
 const active=document.querySelector('.page.active')?.id||'dashboard';
 const tt=document.getElementById('topTitle'); if(tt)tt.textContent=localizedTitle(active);
}
function toggleTheme(){currentTheme=currentTheme==='dark'?'light':'dark';localStorage.setItem('catalyst_theme',currentTheme);applyPreferences()}
function toggleLanguageMenu(){document.getElementById('langPopover')?.classList.toggle('show')}
function setLanguage(lang){currentLanguage=lang;localStorage.setItem('catalyst_language',lang);document.getElementById('langPopover')?.classList.remove('show');applyPreferences()}
document.addEventListener('click',e=>{if(!e.target.closest('.lang-menu'))document.getElementById('langPopover')?.classList.remove('show')});
