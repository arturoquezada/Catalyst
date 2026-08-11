const SB_URL='https://kpuqabxmpavxgbzxzlng.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdXFhYnhtcGF2eGdienh6bG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTk1NzAsImV4cCI6MjA4MDI3NTU3MH0.CoB4NA6Z8qtTrRzvIqfP-hm3T1m24WpRNI1Xc74all8';
const sb=supabase.createClient(SB_URL,SB_KEY);
let currentUser=null,currentEmpleado=null,currentRole=null,requisitions=[];
const managerRoles=['manager','sr manager','jr_manager'];
const taRoles=['talent','ta_manager','ta_analyst'];
const hopRoles=['head_people','ceo'];
