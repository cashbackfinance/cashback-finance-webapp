let YEAR=new Date().getUTCFullYear();
const SUPABASE_URL='https://rsmvfzdpouvtsuhyrhnr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_S4dzik7Wg-Bgqglb3oR3Sw_dV-HhPsT';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
// Discard responses that belong to a signed-out or previous user.
function guardedQuery(query,actor){return new Proxy(query,{get(target,key){
 if(key==='then')return(resolve,reject)=>Promise.resolve(target).then(result=>{if(actor!==authSession?.user?.id)throw Error('Session changed');return result;}).then(resolve,reject);
 const value=target[key];return typeof value==='function'?(...args)=>guardedQuery(value.apply(target,args),actor):value;
}});}
const sb={auth:supabaseClient.auth,from:table=>guardedQuery(supabaseClient.from(table),authSession?.user?.id),schema:name=>({from:table=>guardedQuery(supabaseClient.schema(name).from(table),authSession?.user?.id),rpc:(name,args)=>guardedQuery(supabaseClient.schema('api').rpc(name,args),authSession?.user?.id)})};
let authSession=null, liveProfile=null, liveUserRole='customer', liveFinancialMap=[], liveFinancialObjects=[], liveProgress=[], liveAnnualBenefit=null, liveReviewRequests=[], liveSavingsGoals=[], liveMicrosavings=[], liveReferrals=[], advisorCustomers=[], advisorCustomer=null, advisorImpulses=[];
let liveProgressSummary=null, liveAchievementRequests=[], feedback='', dataError='', refreshing=false;
const pendingActions=new Set();
let advisorReferral=null,referralMatches=[],referralSelected=null;
let referralDraft={query:'',date:'',evidence:'',confirmed:false};
function qualifiedReferralsThisYear(){return state.referrals.filter(r=>r.status==='qualified'&&r.qualifiedAt&&new Date(r.qualifiedAt).getUTCFullYear()===YEAR);}
const DEFAULT={role:'customer',page:'home',score:null,microTotal:0,savingsGoal:null,microEntries:[],streakMonths:null,referrals:[],events:[],areaDone:{},areaRequested:{}};
let state=structuredClone(DEFAULT);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const AREA_TYPE_TO_NAME={housing_financing:'Wohnen & Finanzierung',protection:'Absicherung',retirement_assets:'Vorsorge & Vermögen',energy_household:'Energie & Haushalt',communication:'Kommunikation',credit_liquidity:'Kredite & Liquidität'};
function dateDE(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('de-DE')}
function moneyDE(v){if(v===null||v===undefined||v==='')return '—';return Number(v).toLocaleString('de-DE',{style:'currency',currency:'EUR'})}
function areaIsDone(row){return row?.reviewed_this_year===true;}
function syncLiveFinancialMap(){const done={};for(const n of areaNames)done[n]=false;for(const row of liveFinancialMap){const n=AREA_TYPE_TO_NAME[row.area_type];if(n)done[n]=areaIsDone(row)}state.areaDone=done;}
function liveAreaRow(name){const type=Object.entries(AREA_TYPE_TO_NAME).find(([,n])=>n===name)?.[0];return liveFinancialMap.find(x=>x.area_type===type)||null}
function liveObjectsForArea(name){const type=Object.entries(AREA_TYPE_TO_NAME).find(([,n])=>n===name)?.[0];return liveFinancialObjects.filter(x=>x.financial_area===type)}
const OBJECT_TYPE_LABELS={electricity_contract:'Stromvertrag',gas_contract:'Gasvertrag',internet_contract:'Internetvertrag',mobile_contract:'Mobilfunkvertrag',mortgage:'Baufinanzierung',loan:'Kredit',insurance_contract:'Versicherung'};const STATUS_LABELS={active:'Aktiv',inactive:'Inaktiv',ended:'Beendet',cancelled:'Beendet',pending:'In Prüfung'};
function liveAreaRecord(name){const row=liveAreaRow(name),objs=liveObjectsForArea(name);if(!row)return areaRecord(name);const known=[];for(const o of objs){let bits=[o.provider,o.product_name].filter(Boolean).join(' · ');known.push(bits||o.object_type||'Finanzobjekt hinterlegt')}
 if(!known.length)known.push('Bereich in deiner CF-Kundenakte angelegt');
 const products=objs.map(o=>{const a=o.attributes||{};let details=[];if(a.annual_consumption_kwh!=null)details.push(Number(a.annual_consumption_kwh).toLocaleString('de-DE')+' kWh/Jahr');if(a.work_price_cent!=null)details.push(String(a.work_price_cent).replace('.',',')+' ct/kWh');if(a.base_price_eur!=null)details.push(moneyDE(a.base_price_eur)+' Grundpreis');const term=o.change_possible_at?'änderbar ab '+dateDE(o.change_possible_at):o.end_date?'bis '+dateDE(o.end_date):'';return {type:OBJECT_TYPE_LABELS[o.object_type]||o.object_type||'Finanzobjekt',provider:o.provider||'—',name:o.product_name||o.object_number||'—',amount:o.monthly_amount!=null?moneyDE(o.monthly_amount)+' / Monat':o.annual_amount!=null?moneyDE(o.annual_amount)+' / Jahr':'—',meta:[term,...details].filter(Boolean).join(' · ')||'—',action:STATUS_LABELS[o.status]||o.status||'Hinterlegt'}});
 return {known,products,result:row.customer_visible_note|| (areaIsDone(row)?'Dieser Bereich wurde für das laufende Vorteilsjahr geprüft.':'Für diesen Bereich liegt noch kein qualifiziertes Prüfergebnis vor.'),last:dateDE(row.last_review_at),next:row.next_review_at?'Nächste Prüfung: '+dateDE(row.next_review_at):(row.action_required?'Prüfung mit Cashback Finance vervollständigen.':'Aktuell ist kein nächster Prüftermin hinterlegt.'),history:row.last_review_at?[[dateDE(row.last_review_at),'Letzte dokumentierte Prüfung',row.customer_visible_note||row.current_status||'Geprüft']]:[]};}
async function loadLiveFinancialData(){const [mapRes,objRes]=await Promise.all([sb.schema('api').from('my_financial_map').select('*'),sb.schema('api').from('my_financial_objects').select('*')]);if(mapRes.error)throw mapRes.error;if(objRes.error)throw objRes.error;liveFinancialMap=mapRes.data||[];liveFinancialObjects=objRes.data||[];syncLiveFinancialMap();}
const PROGRESS_LABELS={qualified_financial_area_review:'Qualifizierte Finanzbereichsprüfung',annual_financial_check:'Jährlicher CF-Finanzcheck',financial_map_updated:'Finanzlandkarte erstellt/aktualisiert',financial_goals_updated:'Finanzielle Ziele definiert/aktualisiert',microsavings_started:'Microsavings gestartet',microsavings_3_month_streak:'Microsavings 3-Monats-Streak',microsavings_6_month_streak:'Microsavings 6-Monats-Streak',microsavings_12_month_streak:'Microsavings 12-Monats-Streak',savings_goal_achieved:'Persönliches Sparziel erreicht',annual_review:'Jahres-/Abschlusscheck',active_customer_year:'Aktive CF-Kundenbeziehung',existing_customer_review:'Bestandskunden-Jahrescheck',successful_referral:'Erfolgreiche Empfehlung'};
async function loadLiveProgress(){
 const {data,error}=await sb.schema('api').rpc('my_current_progress');
 if(error)throw error;
 if(!data?.data_complete||data.total_progress_score==null||data.annual_level==null)throw Error('Progress konnte nicht vollständig geladen werden.');
 liveProgressSummary=data; YEAR=data.benefit_year; liveProgress=data.events||[];
 state.score=Number(data.total_progress_score);
 state.events=liveProgress.map(e=>[PROGRESS_LABELS[e.activity_type]||e.activity_type,Number(e.points)]);
}
async function loadLiveAnnualBenefit(){const {data,error}=await sb.schema('api').from('my_annual_benefit').select('*').eq('benefit_year',YEAR).maybeSingle();if(error)throw error;liveAnnualBenefit=data||null;}
async function loadLiveReviewRequests(){const {data,error}=await sb.schema('api').from('my_review_requests').select('*').order('requested_at',{ascending:false});if(error)throw error;liveReviewRequests=data||[];state.areaRequested={};for(const r of liveReviewRequests){if(r.status==='requested'||r.status==='in_review'){const n=AREA_TYPE_TO_NAME[r.financial_area];if(n)state.areaRequested[n]=true;}}}
async function requestAreaReview(name){const areaType=Object.entries(AREA_TYPE_TO_NAME).find(([,n])=>n===name)?.[0];if(!areaType)throw new Error('Unbekannter Finanzbereich');const {error}=await sb.schema('api').rpc('request_financial_area_review',{p_financial_area:areaType});if(error)throw error;await Promise.all([loadLiveReviewRequests(),loadLiveFinancialData()]);}
async function loadLiveSavings(){const [g,m]=await Promise.all([sb.schema('api').from('my_savings_goals').select('*'),sb.schema('api').from('my_microsavings').select('*').order('occurred_at',{ascending:false})]);if(g.error)throw g.error;if(m.error)throw m.error;liveSavingsGoals=g.data||[];liveMicrosavings=m.data||[];const goal=liveSavingsGoals.find(x=>x.status==='active')||liveSavingsGoals[0]||null;state.savingsGoal=goal?{id:goal.savings_goal_id,name:goal.title,target:goal.target_amount==null?null:Number(goal.target_amount),status:goal.status,verificationStatus:goal.verification_status,purpose:goal.purpose,targetDate:goal.target_date}:null;state.microEntries=liveMicrosavings.map(x=>({date:String(x.occurred_at||x.reported_at||'').slice(0,10),amount:Number(x.amount||0),note:x.notes||'',goalId:x.savings_goal_id}));state.microTotal=goal?Number(goal.reported_saved_amount||0):liveMicrosavings.reduce((sum,x)=>sum+Number(x.amount||0),0);}
async function createSavingsGoal(name,target){const {error}=await sb.schema('api').rpc('create_savings_goal',{p_title:name,p_target_amount:target,p_purpose:null,p_target_date:null});if(error)throw error;await loadLiveSavings();}
async function reportMicrosaving(amount,note){const {error}=await sb.schema('api').rpc('report_microsaving',{p_amount:amount,p_savings_goal_id:state.savingsGoal?.id||null,p_notes:note||null});if(error)throw error;await loadLiveSavings();}
async function loadLiveReferrals(){const {data,error}=await sb.schema('api').from('my_referrals').select('*').order('created_at',{ascending:false});if(error)throw error;liveReferrals=data||[];state.referrals=liveReferrals.map(x=>({id:x.referral_id,name:x.referred_name,contact:'',interest:x.topic||'Finanzcheck',note:'',status:x.status,createdAt:x.created_at,qualifiedAt:x.qualified_at}));}
async function submitReferral(name,contact,topic,note){const {error}=await sb.schema('api').rpc('submit_referral',{p_referred_name:name,p_referred_contact:contact,p_topic:topic||null,p_note:note||null});if(error)throw error;await loadLiveReferrals();}
async function loadAdvisorImpulses(){const {data,error}=await sb.schema('api').rpc('advisor_open_impulses');if(error)throw error;advisorImpulses=data||[];}
async function setAdvisorImpulseStatus(id,status){const {error}=await sb.schema('api').rpc('advisor_set_impulse_status',{p_impulse_id:id,p_status:status});if(error)throw error;await loadAdvisorImpulses();}

const navCustomer=[['home','⌂','Home'],['benefit','◇','Vorteil'],['finances','▣','Finanzlandkarte'],['discover','◈','Entdecken'],['coach','○','Coach']],navAdvisor=[['advisor','⌂','Home'],['customers','◎','Kunden'],['work','▣','Vorgänge']];
const areaNames=['Wohnen & Finanzierung','Absicherung','Vorsorge & Vermögen','Energie & Haushalt','Kommunikation','Kredite & Liquidität'];
function areaRecord(){return {known:[],products:[],result:'Noch keine Daten oder Prüfergebnisse hinterlegt.',last:'—',next:'Prüfung mit Cashback Finance anstoßen.',history:[]};}
function save(){} // Customer data is loaded from the Core and is not persisted in localStorage.
function levelFor(){return liveProgressSummary?.annual_level??null;}
function nextFor(){return liveProgressSummary?.next_threshold==null?null:[liveProgressSummary.next_threshold,liveProgressSummary.next_level];}
function euro(n){return n==null?'—':Number(n).toLocaleString('de-DE',{minimumFractionDigits:0,maximumFractionDigits:2})+' €';}
function calc(){} // No revenue or benefit calculation in the browser.
function roleSwitch(){const name=liveProfile?[liveProfile.first_name,liveProfile.last_name].filter(Boolean).join(' '):authSession?.user?.email||'Cashback Finance';return `<div class="sessionbox"><span><b>${escapeHTML(name)}</b><span class="live-pill">${liveUserRole==='customer'?'LIVE PROFIL':'INTERN · '+escapeHTML(String(liveUserRole).toUpperCase())}</span><br>${escapeHTML(liveProfile?.customer_number||authSession?.user?.email||'')}</span><button class="role" data-logout>Abmelden</button></div>`;}
function levelBar(){let l=levelFor(state.score),n=nextFor(state.score);return `<div class="level"><div class="level-head"><b>CF-Level ${l} %</b><span>${n?`Noch ${n[0]-state.score} Punkte bis ${n[1]} %`:'Maximales Level erreicht'}</span></div><div class="steps">${(liveProgressSummary?.levels||[]).map(({threshold:p,level:x},i)=>`<div class="step ${x<=l?'on':''}"><i>${x<=l?'✓':''}</i><small>${x}%</small></div>${i<5?`<div class="line ${liveProgressSummary.levels[i+1].level<=l?'on':''}"></div>`:''}`).join('')}</div></div>`}
function nextAction(){let n=nextFor(state.score),open=areaNames.filter(x=>!state.areaDone[x]);if(!n)return {title:'25 % erreicht',text:'Du hast die höchste Vorteilsstufe für dieses Jahr erreicht.',go:'benefit',cta:'Vorteil ansehen'};if(open.length)return {title:`Noch ${n[0]-state.score} Punkte bis ${n[1]} %`,text:`${open[0]} ist noch offen. Eine qualifizierte Prüfung kann 5 Fortschrittspunkte bringen.`,go:'finances',cta:'Finanzlandkarte öffnen'};return {title:`Noch ${n[0]-state.score} Punkte bis ${n[1]} %`,text:'Dein Coach zeigt dir die nächsten sinnvollen Schritte.',go:'coach',cta:'Zum Coach'}}
function home(){calc();let l=levelFor(state.score),a=nextAction(),done=areaNames.filter(x=>state.areaDone[x]).length,last=state.events[0];return `<header><div><span class="eyebrow">VORTEILSJAHR ${YEAR}</span><h1>Guten Tag, ${escapeHTML(liveProfile?.first_name||'Kunde')}.</h1><p>Dein Finanzfortschritt – und was als Nächstes sinnvoll ist.</p></div>${roleSwitch()}</header>${state.lastAchievement?`<div class="achievement"><div class="spark">✓</div><div><span>NEUER FORTSCHRITT</span><strong>${state.lastAchievement.name}</strong><p>+${state.lastAchievement.points} Punkte · dein Fortschritt wurde von Cashback Finance verifiziert.</p></div><button data-dismiss>×</button></div>`:''}<section class="hero"><div><span class="eyebrow gold">DEIN FINANZFORTSCHRITT</span><div class="big"><span id="scoreCounter" data-target="${state.score}">0</span> <small>Punkte</small></div><p>${done} von 6 Finanzbereichen dieses Jahr geprüft.</p></div>${levelBar()}</section><div class="nextaction"><div><span class="eyebrow">DEIN NÄCHSTER SCHRITT</span><h2>${a.title}</h2><p>${a.text}</p></div><button class="primary" data-go="${a.go}">${a.cta} →</button></div><div class="grid3"><div class="card"><span class="label">Aktuelles Level</span><strong class="metric">${l} %</strong><span class="positive">${nextFor(state.score)?`${nextFor(state.score)[0]-state.score} Punkte bis zur nächsten Stufe`:'Höchste Stufe erreicht'}</span></div><div class="card"><span class="label">Finanzlandkarte</span><strong class="metric">${done}/6</strong><span class="muted">Bereiche qualifiziert geprüft</span></div><div class="card featured"><span class="label">Vorteilspotenzial</span><strong class="metric">${euro(liveAnnualBenefit?.target_benefit)}</strong><span>gespeicherter Berechnungsstand · ${dateDE(liveAnnualBenefit?.calculated_at)}</span></div></div><div class="momentum"><div><b>${state.streakMonths??'—'}</b><span>Monate Microsavings-Streak</span></div><div><b>${qualifiedReferralsThisYear().length}/3</b><span>Empfehlungen qualifiziert</span></div><div><b>+${last?last[1]:0}</b><span>letzter verifizierter Fortschritt</span></div></div><div class="home-actions"><button class="home-action" data-go="microsavings"><span class="home-action-kicker">FINANZIELLE ROUTINE</span><strong>Microsavings erfassen</strong><span>${euro(state.microTotal)} bisher erfasst · ${state.streakMonths??'—'} Monate Streak</span><b>Jetzt erfassen →</b></button><button class="home-action" data-go="referrals"><span class="home-action-kicker">EMPFEHLUNGEN</span><strong>Empfehlung abgeben</strong><span>${qualifiedReferralsThisYear().length} von max. 3 dieses Jahr qualifiziert</span><b>Person empfehlen →</b></button><button class="home-action map-action" data-go="finances"><span class="home-action-kicker">DEINE FINANZLANDKARTE</span><strong>${done} von 6 Bereichen geprüft</strong><span>${done<6?'Dein nächster offener Bereich wartet auf die Jahresprüfung.':'Alle sechs Finanzbereiche sind für dieses Jahr geprüft.'}</span><b>Finanzlandkarte öffnen →</b></button></div>`}
function benefit(){
  let b=liveAnnualBenefit;
  let score=state.score;
  let l=levelFor(), n=nextFor();
  let ecv=b?.eligible_customer_value==null?null:Number(b.eligible_customer_value);
  let target=b?.target_benefit==null?null:Number(b.target_benefit);
  let finalBenefit=b&&b.final_benefit!=null?Number(b.final_benefit):null;
  let factor=b&&b.annual_pool_factor!=null?Number(b.annual_pool_factor):null;
  let status=b?.calculation_status||'unavailable';
  let nextText=n?`${n[0]-score} Punkte fehlen dir bis ${n[1]} %`:'Du hast die höchste Vorteilsstufe erreicht';
  let statusLabel={provisional:'Vorläufig',calculated:'Berechnet',finalized:'Finalisiert',paid:'Ausgezahlt',cancelled:'Storniert',unavailable:'Noch kein Berechnungsstand'}[status]||status;
  return `<header><div><span class="eyebrow">VORTEIL</span><h1>Dein Vorteil – einfach erklärt.</h1><p>Dein Jahresvorteil entsteht aus deinem verifizierten Finanzfortschritt und dem berücksichtigungsfähigen Kundenwert.</p></div>${roleSwitch()}</header>
  <section class="benefit-hero">
    <div><span class="eyebrow gold">LIVE · VORTEILSJAHR ${YEAR}</span><strong>${euro(target)}</strong><p>Gespeicherter Jahresvorteil · ${dateDE(b?.calculated_at)} · ${statusLabel}. Dieser Berechnungsstand kann vom aktuellen Progress abweichen.</p></div>
    <div class="benefit-hero-side"><span>Berücksichtigter Wert</span><b>${euro(ecv)}</b><small>Eligible Customer Value (ECV) für ${YEAR}. Versicherungsumsätze sind ausgeschlossen.</small></div>
  </section>
  <div class="benefit-flow">
    <div class="flow-card"><span class="flow-no">1</span><span class="label">Dein Fortschritt</span><strong>${score} Punkte</strong><small>${nextText}</small></div>
    <div class="flow-arrow">→</div>
    <div class="flow-card"><span class="flow-no">2</span><span class="label">Dein CF-Level</span><strong>${l} %</strong><small>Aktuelles Level aus deinem verifizierten Jahresprogress.</small></div>
    <div class="flow-arrow">·</div>
    <div class="flow-card"><span class="flow-no">3</span><span class="label">Berücksichtigter Wert</span><strong>${euro(ecv)}</strong><small>LIVE aus deinem Annual-Benefit-Datensatz</small></div>
    <div class="flow-arrow">·</div>
    <div class="flow-card result"><span class="flow-no">4</span><span class="label">Ziel-Jahresvorteil</span><strong>${euro(target)}</strong><small>${statusLabel} · Stand heute</small></div>
  </div>
  <div class="card benefit-level">${levelBar()}<div class="level-explain"><b>Dein Level ist noch nicht eingefroren.</b><p>Verifizierter Fortschritt kann dein Jahreslevel weiter erhöhen. Das am Ende des Vorteilsjahres erreichte Level wird auf den berücksichtigten Wert dieses Jahres angewendet.</p></div></div>
  <div class="section-head"><span class="eyebrow">AKTUELLER PROGRESS UND GESPEICHERTER JAHRESVORTEIL</span><h2>Was aktuell in deiner Kundenakte steht.</h2></div>
  <div class="grid2 benefit-detail-grid">
    <div class="card"><span class="mini-icon">↗</span><span class="label">FINANZFORTSCHRITT</span><h3>${score} verifizierte Punkte.</h3><p>Dein aktuelles CF-Level beträgt ${l} %. Der gespeicherte Jahresvorteil wird separat berechnet.</p></div>
    <div class="card"><span class="mini-icon">€</span><span class="label">ELIGIBLE CUSTOMER VALUE</span><h3>${euro(ecv)} berücksichtigt.</h3><p>Nur programmfähiger, wirtschaftlich berücksichtigter Kundenwert fließt hier ein. Versicherungsvermittlung bleibt beim ECV ausdrücklich außen vor.</p></div>
  </div>
  ${finalBenefit!=null?`<div class="scenario"><div><span class="eyebrow">FINALER JAHRESVORTEIL</span><h3>${euro(finalBenefit)}</h3><p>Dieser Wert ist im Annual-Benefit-Datensatz bereits als finaler Vorteil hinterlegt.</p></div></div>`:`<div class="notice"><b>i</b><div><strong>Noch kein finaler Jahresvorteil.</strong><p>Der Datensatz ist ${statusLabel.toLowerCase()}. Pool-Faktor und finaler Jahresvorteil sind noch nicht festgelegt${factor!=null?`; aktueller Pool-Faktor: ${factor}`:''}. Die App erfindet dafür keinen Wert.</p></div></div>`}
  <div class="section-head"><span class="eyebrow">WICHTIG ZU WISSEN</span><h2>Fortschritt ist nicht gleich Produktkauf.</h2></div>
  <div class="principles"><div><b>✓</b><span><strong>Eine sinnvolle Prüfung zählt.</strong><small>Auch „alles passt“ oder „keine Änderung nötig“ kann qualifizierten Fortschritt bedeuten.</small></span></div><div><b>✓</b><span><strong>Ein Abschluss bringt keine Extra-Punkte.</strong><small>Progress entsteht durch verifizierte finanzielle Arbeit – nicht durch möglichst viele Produkte.</small></span></div><div><b>✓</b><span><strong>Versicherung bleibt beim ECV außen vor.</strong><small>Eine qualifizierte Prüfung im Bereich Absicherung kann Progress bringen; Versicherungsumsatz bleibt dennoch 0 € berücksichtigter Wert.</small></span></div></div>
  <div class="year-close"><div><span class="eyebrow gold">AM JAHRESENDE</span><h2>Aus dem vorläufigen Stand wird der Jahresvorteil.</h2><p>Nach Abschluss des Vorteilsjahres werden finaler Progress, Jahreslevel und endgültiger ECV zusammengeführt. Eine mögliche Budget-/Pool-Anpassung wird erst berücksichtigt, wenn sie tatsächlich festgelegt ist.</p></div><div class="year-badge"><span>Aktuell</span><b>${l} %</b><small>vorläufiges CF-Level</small></div></div>`
}
function finances(){let done=areaNames.filter(x=>state.areaDone[x]).length;return `<header><div><span class="eyebrow">DEINE FINANZLANDKARTE</span><h1>Alles, was finanziell zusammengehört.</h1><p>Nicht nur Statuskarten: Hier entsteht deine laufende finanzielle Übersicht mit bekannten Informationen, Prüfergebnissen, offenen Aufgaben und Historie.</p></div>${roleSwitch()}</header><div class="mapsummary"><strong>${done} von 6</strong><div><b>Finanzbereiche ${YEAR} geprüft</b><p>Jede qualifizierte Jahresprüfung zählt einmal – unabhängig davon, ob etwas geändert wird.</p></div></div><div class="area-grid">${areaNames.map(n=>{let d=state.areaDone[n],r=(liveFinancialMap.length?liveAreaRecord(n):areaRecord(n)),requested=state.areaRequested&&state.areaRequested[n];return `<div class="card area area-deep"><div class="areaicon ${d?'done':''}">${d?'✓':requested?'↗':'◷'}</div><span class="pill ${d?'done':''}">${d?YEAR+' geprüft':requested?'Prüfung angefragt':'Noch offen'}</span><h3>${n}</h3><p>${escapeHTML(r.result)}</p><div class="area-meta"><span><b>${r.known.length}</b> Informationen eingeordnet</span><span><b>${r.last}</b> letzte Prüfung</span></div><div class="areafoot"><span>${d?'Ergebnis & Historie':requested?'Anfrage übermittelt':'Nächster Schritt'}</span><button class="linkbtn" data-area-detail="${n}">Bereich öffnen →</button></div></div>`}).join('')}</div><div class="notice"><b>i</b><div><strong>Deine Finanzlandkarte wächst mit dir.</strong><p>Sie verbindet vorhandene Informationen, dokumentierte Ergebnisse und offene Aufgaben. Progress entsteht weiterhin erst nach einer qualifizierten, dokumentierten Prüfung.</p></div></div>`}
function areaDetail(){let n=state.selectedArea||areaNames[0],d=!!state.areaDone[n],r=(liveFinancialMap.length?liveAreaRecord(n):areaRecord(n)),requested=state.areaRequested&&state.areaRequested[n];let products=r.products||[];return `<header><div><span class="eyebrow">FINANZLANDKARTE · DETAIL</span><h1>${n}</h1><p>Was bereits bekannt ist, welche Verträge oder Finanzobjekte zugeordnet sind und was als Nächstes sinnvoll ist.</p></div>${roleSwitch()}</header><div class="detail-hero"><span class="eyebrow gold">DEIN STATUS ${YEAR}</span><h2>${d?'Dieser Bereich ist qualifiziert geprüft.':requested?'Die Prüfung ist angefragt.':'Dieser Bereich ist noch offen.'}</h2><p>${escapeHTML(r.result)}</p><div class="statusline"><span class="statuschip ${d?'ok':''}">${d?'✓ Jahresprüfung erledigt':requested?'↗ Prüfung angefragt':'○ Jahresprüfung offen'}</span><span class="statuschip">+5 bei qualifizierter Prüfung</span></div></div>${products.length?`<div class="card product-data"><span class="eyebrow">DEINE ZUGEORDNETEN DATEN</span><h3>Was Cashback Finance zu diesem Bereich kennt</h3><p class="product-intro">Später kommen diese Angaben direkt aus deiner CF-Kundenakte. Angezeigt wird nur, was tatsächlich gespeichert und dem Bereich zugeordnet ist.</p><div class="product-list">${products.map(x=>`<div class="product-row"><div><span>${x.type}</span><strong>${escapeHTML(x.provider)} · ${escapeHTML(x.name)}</strong></div><div><span>Kosten / Rate</span><strong>${x.amount}</strong></div><div><span>Vertrag / Termin</span><strong>${escapeHTML(x.meta)}</strong></div><div><span>Status</span><strong>${escapeHTML(x.action)}</strong></div></div>`).join('')}</div><p class="fine">LIVE · Daten aus deiner CF-Kundenakte.</p></div>`:''}<div class="finance-depth-grid"><div class="card"><span class="eyebrow">BEREITS BEKANNT</span><h3>Dein aktueller Informationsstand</h3><div class="known-list">${r.known.map(x=>`<div><i>✓</i><span>${escapeHTML(x)}</span></div>`).join('')}</div><p class="fine">LIVE · Daten aus deiner CF-Kundenakte.</p></div><div class="card result-card"><span class="eyebrow">LETZTES PRÜFERGEBNIS</span><h3>${d?r.last:'Noch kein Ergebnis '+YEAR}</h3><p>${escapeHTML(r.result)}</p>${d?`<span class="result-badge">✓ Dokumentiert</span>`:'<span class="result-badge open">Noch offen</span>'}</div></div><div class="finance-depth-grid lower"><div class="card"><span class="eyebrow">NÄCHSTE AUFGABE</span><h3>${d?'Im Blick behalten':'Jahresprüfung vervollständigen'}</h3><p>${escapeHTML(r.next)}</p>${!d&&!requested?`<button class="primary" data-requestarea="${n}">Prüfung anstoßen →</button>`:''}${requested&&!d?'<div class="request-confirm">✓ Anfrage übermittelt · Cashback Finance prüft als Nächstes und meldet sich bei dir.</div>':''}</div><div class="card"><span class="eyebrow">HISTORIE</span><h3>Was bisher passiert ist</h3><div class="timeline">${r.history.map(([date,title,text])=>`<div class="timeline-item"><i></i><div><span>${escapeHTML(date)}</span><b>${escapeHTML(title)}</b><p>${escapeHTML(text)}</p></div></div>`).join('')}</div></div></div><button class="back-map" data-go="finances">← Zur Finanzlandkarte</button>`}
let liveGoalChanges=[],goalChangeReason='',advisorGoalChange=null;
let goalChangeDraft={title:'',amount:'',purpose:'',date:'',reason:'',confirmed:false};
const GOAL_CHANGE_STATUS={requested:'Anfrage übermittelt',in_review:'In Prüfung',approved:'Änderung angenommen',rejected:'Änderung abgelehnt',cancelled:'Anfrage zurückgezogen'};
async function loadGoalChanges(){const {data,error}=await sb.schema('api').from('my_savings_goal_change_requests').select('*').order('requested_at',{ascending:false});if(error)throw error;liveGoalChanges=data||[];}
async function loadAdvisorGoalChange(id){const {data,error}=await sb.schema('api').rpc('advisor_savings_goal_change_details',{p_request_id:id});if(error)throw error;advisorGoalChange=data;}
function customerGoalChange(){
 const g=state.savingsGoal;if(!g)return '';
 const rows=liveGoalChanges.filter(r=>r.savings_goal_id===g.id),open=rows.some(r=>['requested','in_review'].includes(r.status));
 return `<section class="card"><h3>Sparzieländerung</h3><p>Beschreibe deinen Änderungswunsch. Cashback Finance prüft ihn mit dir; dein gespeichertes Ziel bleibt bis zur Entscheidung unverändert.</p>
 ${g.status==='active'&&g.verificationStatus!=='verified'&&!open?`<label for="goalChangeReason">Gewünschte Änderung und Begründung</label><textarea id="goalChangeReason" maxlength="4000">${escapeHTML(goalChangeReason)}</textarea><button class="primary" data-request-goal-change>Änderung anfragen</button>`:open?'<p role="status">Dein Änderungsantrag wird geprüft. Eine weitere Anfrage ist derzeit nicht nötig.</p>':'<p>Für dieses abgeschlossene oder verifizierte Ziel ist keine Änderung möglich.</p>'}
 ${rows.map(r=>`<div class="internal-row"><b>${escapeHTML(GOAL_CHANGE_STATUS[r.status]||r.status)}</b><small>${dateDE(r.requested_at)}</small><p>${escapeHTML(r.reason)}</p>${r.decision_reason?`<p><strong>Entscheidung:</strong> ${escapeHTML(r.decision_reason)}</p>`:''}${r.status==='approved'&&r.goal_after?`<p>Bestätigtes Ziel: ${escapeHTML(r.goal_after.title)} · ${euro(r.goal_after.target_amount)}</p>`:''}</div>`).join('')}</section>`;
}
function advisorGoalChangePage(){
 const r=advisorGoalChange;if(!r)return '<div class="card">Keine Änderungsanfrage geöffnet.</div>';
 const g=r.goal||{},open=['requested','in_review'].includes(r.status),editable=g.status==='active'&&g.verification_status!=='verified'&&!r.achievement_pending;
 return `<header><div><button class="back-map" data-go="work">← Vorgänge</button><span class="eyebrow">SPARZIELÄNDERUNG PRÜFEN</span><h1>${escapeHTML(g.title)}</h1></div>${roleSwitch()}</header>
 <section class="card"><h3>Änderungswunsch</h3><p>${escapeHTML(r.reason)}</p><p>Aktuelles Ziel: ${euro(g.target_amount)} · ${escapeHTML(g.purpose||'Kein Zweck hinterlegt')} · Zieldatum ${dateDE(g.target_date)}</p><p>${escapeHTML(GOAL_CHANGE_STATUS[r.status]||r.status)}</p>${r.decision_reason?`<p>${escapeHTML(r.decision_reason)}</p>`:''}</section>
 ${open?`<section class="card"><h3>Geprüfte Entscheidung</h3>${!editable?`<p role="status">${r.achievement_pending?'Zuerst die offene Zielerreichungsmeldung klären. Bis dahin ist keine Annahme möglich.':'Das Ziel ist abgeschlossen oder verifiziert. Eine Annahme ist nicht möglich.'}</p>`:`<label for="changeTitle">Geprüfter Zieltitel</label><input id="changeTitle" maxlength="300" value="${escapeHTML(goalChangeDraft.title)}"><label for="changeAmount">Geprüfter Zielbetrag in Euro</label><input id="changeAmount" type="number" min="0.01" step="0.01" value="${escapeHTML(goalChangeDraft.amount)}"><label for="changePurpose">Zweck (optional)</label><textarea id="changePurpose" maxlength="2000">${escapeHTML(goalChangeDraft.purpose)}</textarea><label for="changeDate">Zieldatum (optional)</label><input id="changeDate" type="date" value="${escapeHTML(goalChangeDraft.date)}">`}
 <label for="changeDecisionReason">Entscheidungsbegründung für den Kunden</label><textarea id="changeDecisionReason" maxlength="4000">${escapeHTML(goalChangeDraft.reason)}</textarea><label class="verification-check"><input id="changeConfirmed" type="checkbox" ${goalChangeDraft.confirmed?'checked':''}> Ich habe die Anfrage und diese Entscheidung fachlich geprüft.</label><p class="fine">Die Zieländerung erzeugt keine Punkte und bestätigt keine Zielerreichung.</p>${editable?'<button class="primary" data-resolve-goal-change="approved">Änderung annehmen</button>':''}<button class="goal-reject" data-resolve-goal-change="rejected">Änderung ablehnen</button></section>`:''}`;
}
function bindGoalChangeWorkflow(){
 const reason=document.querySelector('#goalChangeReason');if(reason)reason.oninput=()=>goalChangeReason=reason.value;
 const request=document.querySelector('[data-request-goal-change]');if(request)request.onclick=()=>{
  if(!goalChangeReason.trim()){feedback='Bitte beschreibe deinen Änderungswunsch.';render();return;}
  const id=state.savingsGoal?.id;if(!id)return;
  runWorkflow('request-goal-change',async()=>{const {error}=await sb.schema('api').rpc('request_savings_goal_change',{p_savings_goal_id:id,p_reason:goalChangeReason.trim()});if(error)throw error;goalChangeReason='';},loadCustomerData,'Dein Änderungsantrag wurde übermittelt. Dein Sparziel bleibt bis zur Entscheidung unverändert.');
 };
 document.querySelectorAll('[data-open-goal-change]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await loadAdvisorGoalChange(b.dataset.openGoalChange);const g=advisorGoalChange.goal;goalChangeDraft={title:g.title||'',amount:g.target_amount??'',purpose:g.purpose||'',date:g.target_date||'',reason:'',confirmed:false};state.page='goalchange';feedback='';render();}catch(e){b.disabled=false;alert('Der Änderungsantrag konnte nicht geladen werden.');}});
 for(const [id,key] of [['changeTitle','title'],['changeAmount','amount'],['changePurpose','purpose'],['changeDate','date'],['changeDecisionReason','reason']]){const n=document.querySelector('#'+id);if(n)n.oninput=()=>goalChangeDraft[key]=n.value;}
 const check=document.querySelector('#changeConfirmed');if(check)check.onchange=()=>goalChangeDraft.confirmed=check.checked;
 document.querySelectorAll('[data-resolve-goal-change]').forEach(b=>b.onclick=()=>{
  const decision=b.dataset.resolveGoalChange,d=goalChangeDraft,amount=Number(d.amount);
  if(!d.reason.trim()||!d.confirmed||(decision==='approved'&&(!d.title.trim()||!Number.isFinite(amount)||amount<=0))){feedback='Bitte begründe und bestätige die Entscheidung. Für eine Annahme sind ein Titel und ein positiver Zielbetrag erforderlich.';render();return;}
  if(!confirm(decision==='approved'?'Geprüfte Änderung verbindlich annehmen? Es werden keine Punkte vergeben.':'Änderungsantrag mit dieser Begründung ablehnen?'))return;
  const r=advisorGoalChange;
  runWorkflow('resolve-goal-change',async()=>{const {error}=await sb.schema('api').rpc('advisor_resolve_savings_goal_change',{p_request_id:r.request_id,p_decision:decision,p_decision_reason:d.reason.trim(),p_title:decision==='approved'?d.title.trim():null,p_target_amount:decision==='approved'?amount:null,p_purpose:decision==='approved'?d.purpose.trim()||null:null,p_target_date:decision==='approved'?d.date||null:null,p_confirmed:d.confirmed});if(error)throw error;},async()=>{await loadAdvisorGoalChange(r.request_id);await loadAdvisorImpulses();await loadCustomerOverview(r.person_id);},decision==='approved'?'Änderung angenommen. Sparziel und Vorgang wurden aktualisiert; keine Punkte vergeben.':'Änderung abgelehnt. Das Sparziel bleibt unverändert.');
 });
}

function microsavings(){
 const g=state.savingsGoal, pct=g?.target?Math.min(100,Math.round(state.microTotal/g.target*100)):null;
 const requests=liveAchievementRequests.filter(r=>r.savings_goal_id===g?.id);
 const open=requests.find(r=>['requested','in_review'].includes(r.status));
 const latest=requests[0];
 let status='Noch nicht als erreicht gemeldet.';
 if(open)status='Du hast dein Sparziel als erreicht gemeldet. Cashback Finance prüft die Zielerreichung.';
 else if(latest?.status==='verified'||g?.verificationStatus==='verified')status='Cashback Finance hat die Zielerreichung bestätigt. Dein verifizierter Progress wurde neu geladen.';
 else if(latest?.status==='rejected')status='Die Zielerreichung wurde nicht bestätigt. Bei neuen Nachweisen kannst du sie erneut melden.';
 else if(g&&g.status!=='active')status='Dieses Sparziel ist abgeschlossen oder nicht aktiv.';
 return `<header><div><span class="eyebrow">FINANZIELLE ROUTINEN</span><h1>Microsavings</h1><p>Kleine Beträge sichtbar machen und auf dein persönliches Ziel hinarbeiten.</p></div>${roleSwitch()}</header>
 <div class="grid3"><div class="card"><span class="label">Erfasste Sparbeträge</span><strong class="metric">${euro(state.microTotal)}</strong></div><div class="card"><span class="label">Sparziel</span><strong class="metric">${g?euro(g.target):'Noch offen'}</strong><span>${escapeHTML(g?.name||'Lege dein persönliches Ziel fest')}</span></div><div class="card featured"><span class="label">Erfasster Anteil</span><strong class="metric">${pct==null?'—':pct+' %'}</strong><span>Die Erfassung ersetzt keine Verifikation.</span></div></div>
 <section class="card"><h3>Dein Sparziel</h3>${g?`<p><strong>${escapeHTML(g.name)}</strong> · ${euro(g.target)}</p><p class="fine">Dein gespeichertes Sparziel ist gesperrt. Änderungen erfolgen über einen kontrollierten Änderungsantrag bei Cashback Finance.</p><p role="status">${status}</p>${g.status==='active'&&!open?'<button class="primary" data-request-achievement>Sparziel erreicht melden</button>':''}`:`<label for="goalName">Wofür möchtest du sparen?</label><input id="goalName" placeholder="z. B. Notgroschen"><label for="goalTarget">Zielbetrag</label><input id="goalTarget" type="number" min="1" step="1" placeholder="500"><button class="primary" data-savegoal>Sparziel speichern</button>`}
 <p class="fine">Die Meldung vergibt keine Punkte. Erst die menschliche Verifikation kann +5 Progress erzeugen.</p></section>
 ${customerGoalChange()}<div class="card"><h3>Microsaving erfassen</h3><label for="microAmount">Betrag</label><input id="microAmount" type="number" min="0.01" step="0.01" placeholder="25,00"><label for="microNote">Notiz</label><input id="microNote" placeholder="z. B. Kaffee gespart"><button class="primary" data-addmicro>Speichern</button><p class="fine">Die Höhe einzelner Microsavings erzeugt keine Progress-Punkte.</p></div>
 <div class="card"><h3>Historie</h3>${state.microEntries.map(x=>`<div class="eventrow"><div><b>${euro(x.amount)}</b><span>${escapeHTML(x.note||'Microsaving')} · ${escapeHTML(x.date)}</span></div></div>`).join('')||'<p>Noch keine Einträge.</p>'}</div>`;
}
function referrals(){let qualified=qualifiedReferralsThisYear().length;return `<header><div><span class="eyebrow">EMPFEHLUNGEN</span><h1>${qualified} von max. 3 qualifiziert</h1><p>Du kannst eine Empfehlung übermitteln. Ob sie die Voraussetzungen erfüllt, bestätigt ausschließlich Cashback Finance.</p></div>${roleSwitch()}</header><div class="card"><h3>Person empfehlen</h3><label>Name</label><input id="refName" placeholder="Vor- und Nachname"><label>Kontaktmöglichkeit</label><input id="refContact" placeholder="E-Mail oder Mobilnummer"><label>Worum geht es ungefähr?</label><select id="refInterest"><option>Finanzcheck</option><option>Wohnen & Finanzierung</option><option>Absicherung</option><option>Vorsorge & Vermögen</option><option>Energie & Haushalt</option><option>Kommunikation</option><option>Kredite & Liquidität</option></select><label>Notiz (optional)</label><textarea id="refNote" placeholder="Kurzer Hinweis für Cashback Finance"></textarea><button class="primary" data-addref>Empfehlung übermitteln</button><p class="fine">Alternative für später: persönlicher Empfehlungslink zum KI-Finanzcheck, über den sich die empfohlene Person selbst meldet.</p></div><div class="card"><h3>Deine Empfehlungen</h3>${state.referrals.map((r,i)=>`<div class="eventrow"><div><b>${escapeHTML(r.name)}</b><span>${r.contact||'Kontakt über Empfehlungslink'} · ${r.interest||'Finanzcheck'}</span><span>${r.status==='qualified'?'Erfolgreich qualifiziert · '+dateDE(r.qualifiedAt)+' · +10 Progress':r.status==='not_qualified'?'Nicht qualifiziert · keine Punkte':r.status==='cancelled'?'Zurückgezogen · keine Punkte':'Übermittelt · Prüfung durch Cashback Finance offen · 0 Punkte'}</span></div>${r.status==='qualified'?'<strong>+10</strong>':['not_qualified','cancelled'].includes(r.status)?'<span class="statuswait">Abgeschlossen</span>':'<span class="statuswait">Prüfung offen</span>'}</div>`).join('')||'<p>Noch keine Empfehlungen.</p>'}</div>`}

function discover(){let topics=[
 {k:'benefit',tag:'DEIN VORTEIL',title:'Wie dein Jahresvorteil entsteht',text:'Verstehe das Zusammenspiel aus Fortschritt, CF-Level und berücksichtigtem Wert.',cta:'Vorteil verstehen →'},
 {k:'finances',tag:'FINANZCHECK',title:'Deine Finanzen als Gesamtbild',text:'Warum wir sechs Finanzbereiche gemeinsam betrachten – und nicht nur einzelne Verträge.',cta:'Finanzlandkarte öffnen →'},
 {k:'microsavings',tag:'ROUTINEN',title:'Kleine Beträge, echtes Sparziel',text:'Microsavings machen kleine Entscheidungen sichtbar und helfen dir, konsequent auf ein Ziel hinzuarbeiten.',cta:'Microsavings ansehen →'},
 {k:'areadetail',area:'Wohnen & Finanzierung',tag:'WOHNEN',title:'Immobilie & Finanzierung',text:'Finanzierungsrate, Zinsbindung, Restschuld und nächste wichtige Termine im Blick behalten.',cta:'Bereich entdecken →'},
 {k:'areadetail',area:'Energie & Haushalt',tag:'HAUSHALT',title:'Energie sinnvoll prüfen',text:'Tarif, Abschlag, Verbrauch und Wechselmöglichkeiten zusammen betrachten.',cta:'Bereich entdecken →'},
 {k:'areadetail',area:'Vorsorge & Vermögen',tag:'VERMÖGEN',title:'Vorsorge verständlich ordnen',text:'Ziele, vorhandene Lösungen und langfristigen Vermögensaufbau in einen Zusammenhang bringen.',cta:'Bereich entdecken →'}
];return `<header><div><span class="eyebrow">ENTDECKEN</span><h1>Mehr verstehen. Möglichkeiten entdecken.</h1><p>Hier findest du Wissen und Themen rund um deine Finanzen – unabhängig davon, was gerade als Nächstes ansteht. Lesen und Entdecken erzeugt keine Progress-Punkte.</p></div>${roleSwitch()}</header><div class="discover-feature"><span class="eyebrow gold">ORIENTIERUNG STATT PRODUKTREGAL</span><h2>Finanzwissen, das zu deiner Finanzlandkarte passt.</h2><p>Entdecken zeigt dir Zusammenhänge und Möglichkeiten. Was für dich persönlich als Nächstes sinnvoll ist, findest du im Coach.</p><button class="primary" data-go="coach">Zu meinen nächsten Schritten →</button></div><div class="discover-grid">${topics.map(t=>`<button class="discover-card" data-discover="${t.k}" data-area="${t.area||''}"><span class="eyebrow">${t.tag}</span><h3>${t.title}</h3><p>${t.text}</p><strong>${t.cta}</strong></button>`).join('')}</div><div class="notice"><b>i</b><div><strong>Entdecken verändert deinen Progress nicht.</strong><p>Fortschritt entsteht nur durch die in der Benefit Engine definierten, tatsächlich abgeschlossenen und – wo erforderlich – von Cashback Finance verifizierten Aktivitäten.</p></div></div>`}
function coach(){let n=nextFor(state.score),open=areaNames.filter(x=>!state.areaDone[x]),requested=open.filter(x=>state.areaRequested&&state.areaRequested[x]),untouched=open.filter(x=>!(state.areaRequested&&state.areaRequested[x])),q=qualifiedReferralsThisYear().length,g=state.savingsGoal||{name:'',target:0,status:'none'},goalPct=g.target?Math.min(100,Math.round(state.microTotal/g.target*100)):0;let actions=[];
 if(untouched.length)actions.push({prio:'JETZT SINNVOLL',title:`${untouched[0]} prüfen lassen`,text:`Dieser Bereich deiner Finanzlandkarte ist ${YEAR} noch offen. Eine qualifizierte Jahresprüfung kann 5 Fortschrittspunkte bringen.`,cta:'Prüfung vorbereiten →',go:'areadetail',area:untouched[0]});
 if(requested.length)actions.push({prio:'BEREITS ANGESTOSSEN',title:`${requested[0]}: Cashback Finance meldet sich`,text:'Deine Anfrage ist übermittelt. Der nächste Schritt liegt jetzt bei Cashback Finance – du musst hier aktuell nichts weiter tun.',cta:'Status ansehen →',go:'areadetail',area:requested[0]});
 if(g.target&&g.verificationStatus!=='verified'&&goalPct<100)actions.push({prio:'DEINE ROUTINE',title:`${escapeHTML(g.name)}: ${goalPct} % erreicht`,text:`${euro(Math.max(0,g.target-state.microTotal))} fehlen noch bis zu deinem persönlichen Sparziel. Die Höhe einzelner Einzahlungen erzeugt keine Progress-Punkte.`,cta:'Sparziel ansehen →',go:'microsavings'});
 else if(g.target&&goalPct<100)actions.push({prio:'DEINE ROUTINE',title:`${escapeHTML(g.name)}: ${goalPct} % erreicht`,text:`${euro(Math.max(0,g.target-state.microTotal))} fehlen noch bis zu deinem persönlichen Sparziel.`,cta:'Microsavings erfassen →',go:'microsavings'});
 if(q<3)actions.push({prio:'OPTIONAL',title:`${q} von 3 Empfehlungen qualifiziert`,text:'Eine Empfehlung bringt erst dann Progress, wenn die empfohlene Person ein qualifiziertes CF-Onboarding abgeschlossen hat.',cta:'Empfehlung abgeben →',go:'referrals'});
 let headline=n?`Noch ${n[0]-state.score} Punkte bis ${n[1]} %`:'25 % erreicht – höchste Vorteilsstufe';return `<header><div><span class="eyebrow">CF COACH</span><h1>${headline}</h1><p>Dein Coach verbindet Finanzlandkarte, Fortschritt, Sparziel und offene Aktivitäten zu konkreten nächsten Schritten.</p></div>${roleSwitch()}</header><div class="coach-hero"><div><span class="eyebrow gold">DEIN NÄCHSTER SCHRITT</span><h2>${actions[0]?actions[0].title:'Für dieses Jahr ist aktuell nichts Dringendes offen.'}</h2><p>${actions[0]?actions[0].text:'Deine Finanzlandkarte ist vollständig geprüft und du hast die höchste Vorteilsstufe erreicht. Neue Aufgaben entstehen erst durch neue Informationen oder den nächsten Jahrescheck.'}</p>${actions[0]?`<button class="primary" data-coachgo="${actions[0].go}" data-area="${actions[0].area||''}">${actions[0].cta}</button>`:''}</div><div class="coach-score"><span>Fortschritt ${YEAR}</span><strong>${state.score}</strong><small>${n?`${n[0]-state.score} Punkte bis ${n[1]} %`:'Level 25 % erreicht'}</small></div></div><div class="coach-status"><div class="card"><span class="label">Finanzlandkarte</span><strong>${6-open.length} / 6 geprüft</strong><small>${requested.length?requested.length+' Prüfung angefragt':open.length?open.length+' Bereich offen':'vollständig'}</small></div><div class="card"><span class="label">Sparziel</span><strong>${g.target?goalPct+' %':'Noch keines'}</strong><small>${g.target?g.name:'Persönliches Ziel definieren'}</small></div><div class="card"><span class="label">Empfehlungen</span><strong>${q} / 3</strong><small>qualifiziert in ${YEAR}</small></div></div><div class="section-title"><div><span class="eyebrow">DEINE NÄCHSTEN MÖGLICHKEITEN</span><h2>Was jetzt sinnvoll sein kann</h2></div></div><div class="coach-actions">${actions.map((a,i)=>`<button class="coach-action ${i===0?'top':''}" data-coachgo="${a.go}" data-area="${a.area||''}"><span class="eyebrow">${a.prio}</span><h3>${a.title}</h3><p>${a.text}</p><strong>${a.cta}</strong></button>`).join('')||'<div class="card"><h3>Alles im grünen Bereich.</h3><p>Aktuell gibt es keine offene Coach-Aktion.</p></div>'}</div><div class="notice"><b>✓</b><div><strong>Der Coach entscheidet nicht über deine Finanzen.</strong><p>Er macht vorhandene Informationen und offene Schritte verständlich sichtbar. Fachliche Prüfungen und Verifizierungen bleiben Aufgabe von Cashback Finance.</p></div></div>`}
function advisor(){return `<header><div><span class="eyebrow">CASHBACK FINANCE · INTERN</span><h1>Advisor Home</h1><p>Arbeite vom Kunden und seinen echten CF-Core-Daten aus.</p></div>${roleSwitch()}</header><div class="grid3"><button class="card advisor-tile" data-go="customers"><span class="label">KUNDEN</span><strong>Kunden suchen</strong><p>Person finden und strukturierte Kundenakte öffnen.</p></button><button class="card advisor-tile" data-go="work"><span class="label">VORGÄNGE</span><strong>Offene Arbeit</strong><p>Kundenimpulse und Prüfungen werden hier gebündelt.</p></button><div class="card featured"><span class="label">PRINZIP</span><strong>CF Core</strong><p>Eine Datenbasis. Rollenbezogene Sicht. Keine Schattenakte.</p></div></div><div class="notice"><b>i</b><div><strong>Interne V1</strong><p>Kundenakte und offene Vorgänge sind angebunden. Zielerreichungsmeldungen können fachlich bestätigt oder abgelehnt werden.</p></div></div>`}
function advisorCustomersPage(){return `<header><div><span class="eyebrow">ADVISOR · KUNDEN</span><h1>Kunden finden</h1><p>Suche nach Name oder Kundennummer.</p></div>${roleSwitch()}</header><div class="card advisor-search"><div class="searchline"><input id="advisorSearch" placeholder="z. B. Mustermann oder CF-TEST-0001" value="${escapeHTML(state.advisorQuery||'')}"><button class="primary" data-advisor-search>Suchen</button></div><div class="advisor-results">${advisorCustomers.length?advisorCustomers.map(c=>`<button class="customer-hit" data-open-customer="${escapeHTML(c.person_id)}"><span><b>${escapeHTML([c.first_name,c.last_name].filter(Boolean).join(' '))}</b><small>${escapeHTML(c.customer_number||'Keine Kundennummer')} · ${escapeHTML(c.city||'Ort nicht hinterlegt')}</small></span><strong>Öffnen →</strong></button>`).join(''):`<p class="empty-state">${state.advisorSearched?'Keine passenden Kunden gefunden.':'Starte eine Suche, um eine Kundenakte zu öffnen.'}</p>`}</div></div>`}
function advisorCustomerPage(){const d=advisorCustomer;if(!d)return advisorCustomersPage();const p=d.person||{}, maps=d.financial_map||[],facts=d.financial_facts||[],objs=d.financial_objects||[],cases=d.cases||[],reviews=d.reviews||[],imp=d.open_impulses||[],house=d.households||[];return `<header><div><button class="back-map" data-go="customers">← Kunden</button><span class="eyebrow">INTERNE KUNDENAKTE</span><h1>${escapeHTML([p.first_name,p.last_name].filter(Boolean).join(' ')||'Kunde')}</h1><p>${escapeHTML(p.customer_number||'Keine Kundennummer')} · ${escapeHTML(p.city||'Ort nicht hinterlegt')}</p></div>${roleSwitch()}</header><div class="advisor-summary"><div><span>Haushalt</span><strong>${house.length||0}</strong></div><div><span>Finanzbereiche</span><strong>${maps.length||0}</strong></div><div><span>Financial Facts</span><strong>${facts.length||0}</strong></div><div><span>Objekte</span><strong>${objs.length||0}</strong></div><div><span>Offene Impulse</span><strong>${imp.length||0}</strong></div></div><div class="advisor-customer-grid"><section class="card"><span class="label">PERSON</span><h3>${escapeHTML([p.first_name,p.last_name].filter(Boolean).join(' '))}</h3><p>${escapeHTML(p.email||'E-Mail nicht hinterlegt')}<br>${escapeHTML(p.phone||'Telefon nicht hinterlegt')}<br>${escapeHTML([p.street,p.postal_code,p.city].filter(Boolean).join(', ')||'Adresse nicht hinterlegt')}</p></section><section class="card"><span class="label">HAUSHALT</span>${house.length?house.map(h=>`<div class="internal-row"><b>${escapeHTML(h.household_name||h.household_number||'Haushalt')}</b><small>${escapeHTML(h.relationship_type||'Beziehung nicht hinterlegt')} · ${escapeHTML(h.dependent_children??'—')} Kinder</small></div>`).join(''):'<p>Keine Haushaltszuordnung vorhanden.</p>'}</section></div><div class="section-head"><span class="eyebrow">FINANZIELLE REALITÄT</span><h2>Finanzlandkarte</h2></div><div class="advisor-area-grid">${maps.map(a=>`<div class="card"><span class="label">${escapeHTML(AREA_TYPE_TO_NAME[a.area_type]||a.area_type)}</span><strong>${a.reviewed_this_year===true?'Dieses Jahr qualifiziert geprüft':a.reviewed_this_year===false?'Dieses Jahr noch nicht qualifiziert geprüft':'Jahresprüfstatus nicht verfügbar'}</strong><small>Gespeicherter Bearbeitungsstatus: ${escapeHTML(a.current_status||'Status offen')}</small><small>Letzte gespeicherte Prüfung: ${a.last_review_at?dateDE(a.last_review_at):'Nicht hinterlegt'}</small></div>`).join('')||'<div class="card"><p>Keine Finanzbereiche vorhanden.</p></div>'}</div><div class="advisor-customer-grid"><section class="card"><span class="label">FINANCIAL FACTS</span>${facts.length?facts.map(f=>`<div class="internal-row"><b>${escapeHTML(f.fact_type)}</b><small>${escapeHTML(f.value_numeric!=null?f.value_numeric+(f.unit?' '+f.unit:''):f.value_text??(f.value_boolean===true?'Ja':f.value_boolean===false?'Nein':'Wert unbekannt'))} · Quelle: ${escapeHTML(f.source||'unbekannt')}</small></div>`).join(''):'<p>Keine Financial Facts vorhanden.</p>'}</section><section class="card"><span class="label">FINANCIAL OBJECTS</span>${objs.length?objs.map(o=>`<div class="internal-row"><b>${escapeHTML(OBJECT_TYPE_LABELS[o.object_type]||o.object_type)}</b><small>${escapeHTML([o.provider,o.product_name].filter(Boolean).join(' · ')||'Keine Produktdetails')} · ${escapeHTML(o.status||'Status offen')}</small></div>`).join(''):'<p>Keine Financial Objects vorhanden.</p>'}</section><section class="card"><span class="label">CASES</span>${cases.length?cases.map(c=>`<div class="internal-row"><b>${escapeHTML(c.case_type||c.case_number||'Vorgang')}</b><small>${escapeHTML(AREA_TYPE_TO_NAME[c.financial_area]||c.financial_area||'Bereich offen')} · ${escapeHTML(c.status||'Status offen')}</small></div>`).join(''):'<p>Keine Cases vorhanden.</p>'}</section><section class="card"><span class="label">REVIEWS</span>${reviews.length?reviews.map(r=>`<div class="internal-row"><b>${escapeHTML(AREA_TYPE_TO_NAME[r.financial_area]||r.financial_area)}</b><small>${escapeHTML(r.status||'Status offen')} · ${dateDE(r.requested_at)}</small></div>`).join(''):'<p>Keine Reviews vorhanden.</p>'}</section></div><div class="section-head"><span class="eyebrow">NÄCHSTER SCHRITT</span><h2>Offene Kundenimpulse</h2></div><div class="card">${imp.length?imp.map(i=>`<div class="internal-row impulse"><b>${escapeHTML(i.title)}</b><small>${i.priority==='high'?'Hohe Priorität':'Normal'} · ${dateDE(i.created_at)} · ${escapeHTML(i.status)}</small></div>`).join(''):'<p>Aktuell keine offenen Kundenimpulse.</p>'}</div>`}
function advisorWorkPage(){
 const high=advisorImpulses.filter(i=>i.priority==='high').length;
 return `<header><div><span class="eyebrow">ADVISOR · VORGÄNGE</span><h1>Offene Arbeit</h1><p>Kundenimpulse und fachliche Prüfungen.</p></div>${roleSwitch()}</header><div class="advisor-summary"><div><span>Offen</span><strong>${advisorImpulses.length}</strong></div><div><span>Hohe Priorität</span><strong>${high}</strong></div></div><div class="card work-list">${advisorImpulses.map(i=>{
 const achievement=i.source_type==='savings_goal_achievement_request';
 return `<div class="work-item ${i.priority==='high'?'high':''}"><div class="work-main"><div class="work-meta"><span>${i.status==='in_progress'?'IN BEARBEITUNG':'NEU'}</span><span>${dateDE(i.created_at)}</span></div><h3>${escapeHTML(i.title)}</h3><p><b>${escapeHTML([i.first_name,i.last_name].filter(Boolean).join(' ')||'Kunde')}</b> · ${escapeHTML(i.customer_number||'Keine Kundennummer')}</p>${achievement?'<p class="fine">Zielerreichung fachlich prüfen, bevor du bestätigst. Bestätigen erzeugt serverseitig einmalig +5.</p>':''}</div><div class="work-actions"><button data-open-customer="${escapeHTML(i.person_id)}">Kunde öffnen</button>${i.source_type==='savings_goal_change_request'?`<button class="primary" data-open-goal-change="${escapeHTML(i.source_id)}">Sparzieländerung prüfen</button>`:i.source_type==='review_request'?`<button class="primary" data-open-review="${escapeHTML(i.source_id)}">Review prüfen</button>`:i.source_type==='referral'?`<button class="primary" data-open-referral="${escapeHTML(i.source_id)}">Empfehlung prüfen</button>`:achievement?(i.source_id?`<button class="primary" data-open-achievement="${escapeHTML(i.source_id)}">Zielerreichung prüfen</button>`:'<span>Die Zuordnung zur Meldung fehlt.</span>'):`<button class="primary" data-impulse-status="${escapeHTML(i.impulse_id)}" data-status="${i.status==='new'?'in_progress':'done'}">${i.status==='new'?'Bearbeitung starten':'Erledigt'}</button>`}</div></div>`;
 }).join('')||'<div class="empty-state">Keine offenen Vorgänge.</div>'}</div><div class="notice"><b>i</b><div><strong>Arbeitsstatus und Verifikation</strong><p>„Erledigt“ schließt einen Arbeitsvorgang. Fachliche Verifikationen erfolgen über die dafür vorgesehenen Aktionen.</p></div></div>`;
}

let advisorAchievement=null,achievementDraft={confirmed:false};

async function loadAdvisorAchievement(id){
 const {data,error}=await sb.schema('api').rpc('advisor_savings_goal_achievement_details',{p_request_id:id});
 if(error)throw error;
 advisorAchievement=data;
}

function advisorAchievementPage(){
 const r=advisorAchievement;
 if(!r)return '<div class="card"><p>Keine Zielerreichungsmeldung geöffnet.</p><button data-go="work">Zu den Vorgängen</button></div>';

 const g=r.goal||{},p=r.person||{},open=['requested','in_review'].includes(r.status);
 const target=Number(g.target_amount||0);
 const total=Number(r.microsavings_total||0);
 const remaining=Number(r.remaining_amount||0);
 const pct=Number(r.achievement_percent||0);

 return `<header><div><button class="back-map" data-go="work">← Vorgänge</button><span class="eyebrow">SPARZIELERREICHUNG PRÜFEN</span><h1>${escapeHTML(g.title||'Sparziel')}</h1><p>${escapeHTML([p.first_name,p.last_name].filter(Boolean).join(' ')||'Kunde')} · ${escapeHTML(p.customer_number||'Keine Kundennummer')}</p></div>${roleSwitch()}</header>

 <section class="card">
   <span class="eyebrow">MELDUNG</span>
   <h3>Vom Kunden als erreicht gemeldet</h3>
   <p>Meldedatum: ${dateDE(r.requested_at)}</p>
   ${r.note?`<p><strong>Kundennotiz:</strong> ${escapeHTML(r.note)}</p>`:'<p class="fine">Keine zusätzliche Kundennotiz hinterlegt.</p>'}
 </section>

 <div class="grid3">
   <div class="card">
     <span class="label">SPARZIEL</span>
     <strong class="metric">${euro(target)}</strong>
     <span>${escapeHTML(g.title||'Sparziel')}</span>
   </div>
   <div class="card">
     <span class="label">ERFASSTE SPARLEISTUNG</span>
     <strong class="metric">${euro(total)}</strong>
     <span>Interne Microsavings-Historie</span>
   </div>
   <div class="card featured">
     <span class="label">ERFÜLLUNGSGRAD</span>
     <strong class="metric">${Number.isFinite(pct)?String(pct).replace('.',',')+' %':'—'}</strong>
     <span>${remaining>0?euro(remaining)+' bis zum Ziel':'Zielbetrag rechnerisch erreicht'}</span>
   </div>
 </div>

 <section class="card">
   <span class="eyebrow">PRÜFGRUNDLAGE</span>
   <h3>Microsavings-Historie</h3>
   ${(r.microsavings||[]).length
     ?(r.microsavings||[]).map(m=>`<div class="eventrow"><div><b>${euro(m.amount)}</b><span>${escapeHTML(m.notes||'Microsaving')} · ${dateDE(m.occurred_at)}</span></div></div>`).join('')
     :'<p>Keine Microsavings zum Sparziel hinterlegt.</p>'}
   <p class="fine">Diese Daten bilden die interne Prüfbasis. Eine externe Nachweisreferenz ist nicht zwingend erforderlich, wenn die Zielerreichung daraus fachlich nachvollziehbar ist.</p>
 </section>

 ${!open
   ?`<section class="card"><h3>Prüfung abgeschlossen</h3><p>Status: ${escapeHTML(r.status)}</p></section>`
   :`<section class="card">
       <span class="eyebrow">FACHLICHE ENTSCHEIDUNG</span>
       <h3>Zielerreichung verifizieren</h3>

       <label class="verification-check">
         <input id="achievementConfirmed" type="checkbox" ${achievementDraft.confirmed?'checked':''}>
         Ich habe Sparziel, erfasste Sparleistung und die vorliegenden Informationen fachlich geprüft.
       </label>

       <p class="fine">Erst die bestätigte menschliche Prüfung darf serverseitig einmalig +5 Progress erzeugen.</p>

       <button class="primary" data-resolve-achievement-v2="verified">Zielerreichung bestätigen (+5)</button>
       <button data-resolve-achievement-v2="rejected">Ablehnen</button>
     </section>`}`;
}

function bindAchievementWorkflow(){
 document.querySelectorAll('[data-open-achievement]').forEach(b=>b.onclick=async()=>{
   b.disabled=true;

   try{
     await loadAdvisorAchievement(b.dataset.openAchievement);
     achievementDraft={confirmed:false};
     state.page='achievementcheck';
     feedback='';
     render();
     scrollTo(0,0);
   }catch(e){
     b.disabled=false;
     alert('Die Zielerreichungsmeldung konnte nicht geladen werden.');
   }
 });

 const checked=document.querySelector('#achievementConfirmed');
 if(checked)checked.onchange=()=>achievementDraft.confirmed=checked.checked;

 document.querySelectorAll('[data-resolve-achievement-v2]').forEach(button=>button.onclick=()=>{
   if(liveUserRole==='customer')return;

   const decision=button.dataset.resolveAchievementV2;

   if(decision==='verified'&&!achievementDraft.confirmed){
     feedback='Bitte bestätige zuerst die fachliche Prüfung von Ziel und Sparleistung.';
     render();
     return;
   }

   if(!confirm(
     decision==='verified'
       ?'Geprüfte Zielerreichung verbindlich bestätigen? Das Backend verbucht einmalig +5.'
       :'Zielerreichungsmeldung ablehnen? Es werden keine Punkte vergeben.'
   ))return;

   const r=advisorAchievement;

   runWorkflow(
     'resolve-achievement-v2',
     async()=>{
       const {error}=await sb.schema('api').rpc(
         'advisor_resolve_savings_goal_achievement_v2',
         {
           p_request_id:r.request_id,
           p_decision:decision,
           p_confirmed:decision==='verified'?achievementDraft.confirmed:false
         }
       );
       if(error)throw error;
     },
     async()=>{
       await loadAdvisorAchievement(r.request_id);
       await loadAdvisorImpulses();
       await loadCustomerOverview(r.person_id);
     },
     decision==='verified'
       ?'Zielerreichung bestätigt. Vorgang und Kundenakte wurden aktualisiert.'
       :'Zielerreichung abgelehnt. Der Vorgang wurde geschlossen.'
   );
 });
}
let advisorReview=null,reviewDraft={result:'',text:'',evidence:'',confirmed:false};
const REVIEW_RESULTS={no_action_required:'Kein Handlungsbedarf',optimization_recommended:'Optimierung empfohlen',further_information_required:'Weitere Informationen erforderlich',case_created:'Beratungsfall angelegt'};
async function loadAdvisorReview(id){const {data,error}=await sb.schema('api').rpc('advisor_review_details',{p_review_id:id});if(error)throw error;advisorReview=data;}
function advisorReviewPage(){
 const r=advisorReview;if(!r)return '<div class="card">Keine Prüfung geöffnet.</div>';
 const open=['requested','in_review'].includes(r.status);
 return `<header><div><button class="back-map" data-go="work">← Vorgänge</button><span class="eyebrow">FINANZBEREICH PRÜFEN</span><h1>${escapeHTML(AREA_TYPE_TO_NAME[r.financial_area]||r.financial_area)}</h1><p>Angefragt am ${dateDE(r.requested_at)}</p></div>${roleSwitch()}</header>
 <section class="card"><p>${r.credited_this_year?'Für diesen Finanzbereich ist dieses Jahr bereits eine Gutschrift vorhanden. Ein weiterer Abschluss erzeugt keine zusätzlichen Punkte.':'Eine dokumentierte, qualifizierte Prüfung kann einmal pro Jahr +5 ergeben.'}</p>
 ${!open?`<h3>Prüfung abgeschlossen</h3><p>${escapeHTML(REVIEW_RESULTS[r.result]||r.status)}</p><p>${escapeHTML(r.customer_visible_result)}</p>`:`<label for="reviewResult">Prüfergebnis</label><select id="reviewResult"><option value="">Bitte auswählen</option>${Object.entries(REVIEW_RESULTS).map(([k,v])=>`<option value="${k}" ${reviewDraft.result===k?'selected':''}>${v}</option>`).join('')}</select>
 <label for="reviewText">Ergebnis oder benötigte Informationen für den Kunden</label><textarea id="reviewText" maxlength="4000">${escapeHTML(reviewDraft.text)}</textarea>
 <label for="reviewEvidence">Nachweisreferenz zum dokumentierten Review</label><textarea id="reviewEvidence" maxlength="2000">${escapeHTML(reviewDraft.evidence)}</textarea>
 <label class="verification-check"><input id="reviewConfirmed" type="checkbox" ${reviewDraft.confirmed?'checked':''}> Ich habe diesen Finanzbereich fachlich geprüft und den qualifizierten Review dokumentiert.</label>
 <p class="fine">Die Prüfung ist unabhängig von einem Produktabschluss. Bei fehlenden Informationen bleibt sie offen und erzeugt keine Punkte.</p><button class="primary" data-save-review>Prüfergebnis speichern</button>`}</section>`;
}
function bindReviewWorkflow(){
 document.querySelectorAll('[data-open-review]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await loadAdvisorReview(b.dataset.openReview);reviewDraft={result:advisorReview.result||'',text:advisorReview.customer_visible_result||'',evidence:advisorReview.document_reference||'',confirmed:false};state.page='reviewcheck';feedback='';render();}catch(e){b.disabled=false;alert('Die Prüfung konnte nicht geladen werden.');}});
 for(const [id,key] of [['reviewResult','result'],['reviewText','text'],['reviewEvidence','evidence']]){const n=document.querySelector('#'+id);if(n)n.oninput=()=>reviewDraft[key]=n.value;}
 const check=document.querySelector('#reviewConfirmed');if(check)check.onchange=()=>reviewDraft.confirmed=check.checked;
 const button=document.querySelector('[data-save-review]');if(button)button.onclick=()=>{
  const complete=reviewDraft.result!=='further_information_required';
  if(!REVIEW_RESULTS[reviewDraft.result]||!reviewDraft.text.trim()||(complete&&(!reviewDraft.evidence.trim()||!reviewDraft.confirmed))){feedback='Bitte Ergebnis und Kundentext angeben. Für einen Abschluss sind zusätzlich Nachweis und fachliche Bestätigung erforderlich.';render();return;}
  if(complete&&!confirm('Möchtest du den dokumentierten Review verbindlich abschließen? Die Datenbank prüft, ob eine einmalige Gutschrift zulässig ist.'))return;
  const r=advisorReview;let result;
  runWorkflow('resolve-review',async()=>{const response=await sb.schema('api').rpc('advisor_resolve_review',{p_review_id:r.review_id,p_result:reviewDraft.result,p_customer_result:reviewDraft.text.trim(),p_evidence_reference:reviewDraft.evidence.trim()||null,p_confirmed:reviewDraft.confirmed});if(response.error)throw response.error;result=response.data;},async()=>{await loadAdvisorReview(r.review_id);await loadAdvisorImpulses();await loadCustomerOverview(r.person_id);},()=>result?.status==='in_review'?'Benötigte Informationen gespeichert. Die Prüfung bleibt offen; keine Punkte vergeben.':result?.awarded?'Prüfung abgeschlossen und einmalig +5 verbucht.':'Prüfung abgeschlossen. Keine zusätzliche Gutschrift verbucht.');
 };
}

function advisorReferralPage(){
 const r=advisorReferral;if(!r)return '<div class="card"><p>Keine Empfehlung geöffnet.</p><button data-go="work">Zu den Vorgängen</button></div>';
 const open=['submitted','contacted','onboarding'].includes(r.status),limited=Number(r.credited_this_year)>=3;
 return `<header><div><button class="back-map" data-go="work">← Vorgänge</button><span class="eyebrow">EMPFEHLUNG PRÜFEN</span><h1>Qualifiziertes Onboarding bestätigen</h1><p>Die fachliche Prüfung bleibt deine Entscheidung.</p></div>${roleSwitch()}</header>
 <div class="card"><h3>${escapeHTML(r.referred_name||'Empfohlene Person')}</h3><p>${escapeHTML(r.referred_contact||'Keine Kontaktangabe')}</p><p>${escapeHTML(r.topic||'Kein Thema hinterlegt')}</p><p>${escapeHTML(r.note||'Keine Notiz')}</p><p>${r.credited_this_year} von maximal 3 Gutschriften im Jahr ${r.benefit_year}.</p></div>
 ${!open?'<div class="card"><p>Diese Empfehlung ist bereits abgeschlossen.</p></div>':`<section class="card"><h3>1. Bestehenden Kunden zuordnen</h3><label for="referralSearch">Name oder Kundennummer</label><div class="searchline"><input id="referralSearch" value="${escapeHTML(referralDraft.query)}" placeholder="Kunden suchen"><button data-referral-search>Suchen</button></div><div class="advisor-results">${referralMatches.map(c=>`<button class="customer-hit" data-select-referral-person="${escapeHTML(c.person_id)}"><span><b>${escapeHTML([c.first_name,c.last_name].filter(Boolean).join(' '))}</b><small>${escapeHTML(c.customer_number||'Keine Kundennummer')}</small></span><strong>Auswählen</strong></button>`).join('')}</div><p role="status">${referralSelected?'Zugeordnet: '+escapeHTML([referralSelected.first_name,referralSelected.last_name].filter(Boolean).join(' ')):'Noch kein Kunde ausgewählt.'}</p></section>
 <section class="card"><h3>2. Abschluss und Nachweis</h3><label for="onboardingDate">Qualifiziertes Onboarding abgeschlossen am</label><input id="onboardingDate" type="datetime-local" value="${escapeHTML(referralDraft.date)}"><label for="referralEvidence">Nachweisreferenz</label><textarea id="referralEvidence" placeholder="Referenz zum dokumentierten qualifizierten Onboarding oder Financial Check">${escapeHTML(referralDraft.evidence)}</textarea><label class="verification-check"><input id="referralConfirmed" type="checkbox" ${referralDraft.confirmed?'checked':''}> Ich habe die Kundenzuordnung und das abgeschlossene qualifizierte CF-Onboarding bzw. den Financial Check fachlich geprüft.</label><p class="fine">Ein Produktabschluss ist nicht erforderlich. Kontaktdaten oder eine bloße Meldung genügen nicht.</p>${limited?'<p role="status">Die Jahresgrenze ist erreicht. Eine weitere Gutschrift ist in diesem Jahr nicht möglich.</p>':'<button class="primary" data-qualify-referral>Qualifikation bestätigen (+10)</button>'}</section>`}`;
}
function bindReferralWorkflow(){
 document.querySelectorAll('[data-open-referral]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await loadAdvisorReferral(b.dataset.openReferral);referralMatches=[];referralSelected=null;referralDraft={query:'',date:'',evidence:'',confirmed:false};state.page='referralcheck';feedback='';render();}catch(e){b.disabled=false;alert('Die Empfehlung konnte nicht geladen werden.');}});
 const query=document.querySelector('#referralSearch');if(query)query.oninput=()=>referralDraft.query=query.value;
 const date=document.querySelector('#onboardingDate');if(date)date.oninput=()=>referralDraft.date=date.value;
 const evidence=document.querySelector('#referralEvidence');if(evidence)evidence.oninput=()=>referralDraft.evidence=evidence.value;
 const checked=document.querySelector('#referralConfirmed');if(checked)checked.onchange=()=>referralDraft.confirmed=checked.checked;
 const search=document.querySelector('[data-referral-search]');if(search)search.onclick=async()=>{if(!referralDraft.query.trim()){feedback='Bitte Name oder Kundennummer eingeben.';render();return;}search.disabled=true;try{const {data,error}=await sb.schema('api').rpc('advisor_search_customers',{p_query:referralDraft.query.trim()});if(error)throw error;referralMatches=(data||[]).filter(c=>c.status==='customer'&&c.person_id!==advisorReferral.referring_person_id);feedback=referralMatches.length?'':'Keine passenden CF-Kunden gefunden.';render();}catch(e){search.disabled=false;alert('Die Kundensuche konnte nicht ausgeführt werden.');}};
 document.querySelectorAll('[data-select-referral-person]').forEach(b=>b.onclick=()=>{referralSelected=referralMatches.find(c=>c.person_id===b.dataset.selectReferralPerson)||null;render();});
 const qualify=document.querySelector('[data-qualify-referral]');if(qualify)qualify.onclick=()=>{
  const completed=new Date(referralDraft.date);
  if(!referralSelected||!referralDraft.confirmed||!referralDraft.evidence.trim()||!referralDraft.date||Number.isNaN(completed.getTime())){feedback='Bitte Kunde, Abschlussdatum, Nachweisreferenz und fachliche Bestätigung vollständig angeben.';render();return;}
  if(!confirm('Möchtest du die geprüfte Empfehlung verbindlich qualifizieren? Das Backend prüft die Jahresgrenze und verbucht einmalig +10.'))return;
  const r=advisorReferral;
  runWorkflow('qualify-referral',async()=>{const {error}=await sb.schema('api').rpc('advisor_qualify_referral',{p_referral_id:r.referral_id,p_referred_person_id:referralSelected.person_id,p_onboarding_completed_at:completed.toISOString(),p_evidence_reference:referralDraft.evidence.trim()});if(error)throw error;},async()=>{await loadAdvisorReferral(r.referral_id);await loadAdvisorImpulses();await loadCustomerOverview(r.referring_person_id);},'Empfehlung qualifiziert. Vorgang und Kundenakte wurden aktualisiert.');
 };
}
function events(){return `<header><div><span class="eyebrow">PROGRESS LEDGER</span><h1>${state.score} Punkte</h1></div>${roleSwitch()}</header><div class="card">${state.events.map(e=>`<div class="eventrow"><div><b>${e[0]}</b><span>verified · ${YEAR}</span></div><strong>+${e[1]}</strong></div>`).join('')}</div>`}
function render(){if(!authSession){renderAuth();return;}const allowed=state.role==='customer'?['home','benefit','finances','discover','coach','events','microsavings','referrals','areadetail']:['advisor','customers','customer','work','referralcheck','reviewcheck','goalchange','achievementcheck'];if(!allowed.includes(state.page))state.page=allowed[0];calc();let pages={home,benefit,finances,discover,coach,advisor,customers:advisorCustomersPage,customer:advisorCustomerPage,work:advisorWorkPage,goalchange:advisorGoalChangePage,reviewcheck:advisorReviewPage,referralcheck:advisorReferralPage,achievementcheck:advisorAchievementPage,events,microsavings,referrals,areadetail:areaDetail};let nav=state.role==='customer'?navCustomer:navAdvisor;if(!pages[state.page])state.page=state.role==='customer'?'home':'advisor';document.querySelector('#app').innerHTML=`<div class="app"><aside><div class="brand">Cashback <b>Finance</b><small>${state.role==='customer'?'DEIN VORTEILSPORTAL':'INTERNER ARBEITSBEREICH'}</small></div><nav>${nav.map(([id,ic,l])=>`<button data-go="${id}" class="${state.page===id?'active':''}"><span>${ic}</span>${l}</button>`).join('')}</nav><div class="asidefoot">Benefit Engine <b>V0.3</b><span>Multi-Role V1.4.3 · Kontrollierte Sparzielverifikation</span></div></aside><main><div class="refreshbar"><button data-refresh ${refreshing?'disabled':''}>${refreshing?'Wird aktualisiert …':'Daten aktualisieren'}</button></div>${feedback?`<div class="notice" role="status">${escapeHTML(feedback)}</div>`:''}${dataError?`<div class="card" role="alert">${roleSwitch()}<h2>Daten konnten nicht geladen werden</h2><p>${escapeHTML(dataError)}</p><p>Bitte aktualisiere die Daten, bevor du fortfährst.</p></div>`:pages[state.page]()}</main><div class="bottom">${nav.map(([id,ic,l])=>`<button data-go="${id}" class="${state.page===id?'active':''}"><span>${ic}</span><small>${l}</small></button>`).join('')}</div></div>`;bind();save();if(!dataError&&state.role==='customer'&&state.page==='home')animateHome()}
function animateHome(){
  const counter=document.querySelector('#scoreCounter');
  if(counter){const target=Number(counter.dataset.target)||0,start=performance.now(),duration=Math.min(1300,650+target*7);function tick(now){const t=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-t,3);counter.textContent=Math.round(target*ease);if(t<1)requestAnimationFrame(tick)}requestAnimationFrame(tick)}
  document.querySelectorAll('.hero .step.on,.hero .line.on').forEach((el,i)=>{el.style.setProperty('--reveal-delay',(i*110)+'ms')});
}

function bind(){bindWorkflow();let lo=document.querySelector('[data-logout]');if(lo)lo.onclick=async()=>{await sb.auth.signOut();clearSession();renderAuth();};let dis=document.querySelector('[data-dismiss]');if(dis)dis.onclick=()=>{delete state.lastAchievement;render()};document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{let p=b.dataset.go;state.page=p;render();scrollTo(0,0);if(['home','benefit','coach','microsavings','referrals','work','customer'].includes(p))refreshData();});let am=document.querySelector('[data-addmicro]');if(am)am.onclick=async()=>{let a=Number(document.querySelector('#microAmount').value),n=document.querySelector('#microNote').value.trim();if(!Number.isFinite(a)||a<=0){alert('Bitte einen positiven Betrag eingeben.');return;}am.disabled=true;am.textContent='Wird gespeichert …';try{await reportMicrosaving(a,n);render();}catch(e){console.error(e);am.disabled=false;am.textContent='Speichern';alert('Das Microsaving konnte nicht gespeichert werden. Bitte versuche es erneut.');}};let ar=document.querySelector('[data-addref]');if(ar)ar.onclick=async()=>{let n=document.querySelector('#refName').value.trim(),c=document.querySelector('#refContact').value.trim(),i=document.querySelector('#refInterest').value,note=document.querySelector('#refNote').value.trim();if(!n||!c){alert('Bitte Name und mindestens eine Kontaktmöglichkeit angeben.');return;}ar.disabled=true;ar.textContent='Wird übermittelt …';try{await submitReferral(n,c,i,note);render();}catch(e){console.error(e);ar.disabled=false;ar.textContent='Empfehlung übermitteln';alert('Die Empfehlung konnte nicht übermittelt werden. Bitte versuche es erneut.');}} ;document.querySelectorAll('[data-area-detail]').forEach(b=>b.onclick=()=>{state.selectedArea=b.dataset.areaDetail;state.page='areadetail';render();scrollTo(0,0)});document.querySelectorAll('[data-requestarea]').forEach(b=>b.onclick=async()=>{const name=b.dataset.requestarea;b.disabled=true;const oldText=b.textContent;b.textContent='Wird übermittelt …';try{await requestAreaReview(name);render();}catch(e){console.error(e);b.disabled=false;b.textContent=oldText;alert('Die Prüfungsanfrage konnte nicht übermittelt werden. Bitte versuche es erneut.');}});let sg=document.querySelector('[data-savegoal]');if(sg)sg.onclick=async()=>{let name=document.querySelector('#goalName').value.trim(),target=Number(document.querySelector('#goalTarget').value);if(!name||!Number.isFinite(target)||target<=0){alert('Bitte Sparziel und Zielbetrag angeben.');return;}if(state.savingsGoal?.id){alert('Es besteht bereits ein aktives Sparziel. Eine Bearbeitungsfunktion ergänzen wir in einer späteren Stufe.');return;}sg.disabled=true;sg.textContent='Wird gespeichert …';try{await createSavingsGoal(name,target);render();}catch(e){console.error(e);sg.disabled=false;sg.textContent='Sparziel speichern';alert('Das Sparziel konnte nicht gespeichert werden. Bitte versuche es erneut.');}};document.querySelectorAll('[data-discover]').forEach(b=>b.onclick=()=>{let p=b.dataset.discover;if(b.dataset.area){state.selectedArea=b.dataset.area;p='areadetail'}state.page=p;render();scrollTo(0,0)});document.querySelectorAll('[data-coachgo]').forEach(b=>b.onclick=()=>{let p=b.dataset.coachgo;if(b.dataset.area){state.selectedArea=b.dataset.area;p='areadetail'}state.page=p;render();scrollTo(0,0)});let as=document.querySelector('[data-advisor-search]');if(as)as.onclick=async()=>{const q=document.querySelector('#advisorSearch').value.trim();state.advisorQuery=q;as.disabled=true;as.textContent='Suche …';try{const {data,error}=await sb.schema('api').rpc('advisor_search_customers',{p_query:q});if(error)throw error;advisorCustomers=data||[];state.advisorSearched=true;render();}catch(e){console.error(e);alert('Die Kundensuche konnte nicht ausgeführt werden.');as.disabled=false;as.textContent='Suchen';}};document.querySelectorAll('[data-open-customer]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const {data,error}=await sb.schema('api').rpc('advisor_customer_overview',{p_person_id:b.dataset.openCustomer});if(error)throw error;advisorCustomer=data;state.page='customer';render();scrollTo(0,0);}catch(e){console.error(e);alert('Die Kundenakte konnte nicht geladen werden.');b.disabled=false;}});document.querySelectorAll('[data-impulse-status]').forEach(b=>b.onclick=async()=>{const old=b.textContent;b.disabled=true;b.textContent='Wird gespeichert …';try{await setAdvisorImpulseStatus(b.dataset.impulseStatus,b.dataset.status);render();}catch(e){console.error(e);b.disabled=false;b.textContent=old;alert('Der Vorgangsstatus konnte nicht geändert werden.');}});}

function renderAuth(message=''){
  document.querySelector('#app').innerHTML=`<div class="auth-shell"><div class="auth-card"><div class="auth-brand">Cashback <b>Finance</b></div><span class="eyebrow">CASHBACK FINANCE · ANMELDUNG</span><h1>Anmelden</h1><p>Melde dich mit deinem Cashback-Finance-Konto an.</p><div class="auth-error" id="authError" style="display:${message?'block':'none'}">${escapeHTML(message)}</div><form id="loginForm"><label>E-Mail-Adresse</label><input id="loginEmail" type="email" autocomplete="username" placeholder="max.mustermann@cashback-finance.test" required><label>Passwort</label><input id="loginPassword" type="password" autocomplete="current-password" required><button class="primary" type="submit">Anmelden →</button></form><div class="auth-note">Dein Zugang führt dich zu deinem Kundenportal oder internen Arbeitsbereich.</div></div></div>`;
  document.querySelector('#loginForm').onsubmit=async(e)=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;btn.textContent='Anmeldung läuft …';const email=document.querySelector('#loginEmail').value.trim(),password=document.querySelector('#loginPassword').value;const {data,error}=await sb.auth.signInWithPassword({email,password});if(error){renderAuth('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');return;}authSession=data.session;await loadLiveProfile();};
}
async function loadLiveProfile(){
 const actor=authSession?.user?.id;
 state=structuredClone(DEFAULT);dataError='';feedback='';
  const {data:roleRows,error:roleError}=await sb.from('user_profiles').select('role,is_active,person_id').eq('auth_user_id',authSession.user.id).limit(1);
  if(roleError||!roleRows?.length||!roleRows[0].is_active){await sb.auth.signOut();authSession=null;liveProfile=null;renderAuth('Login erfolgreich, aber das Benutzerprofil ist nicht aktiv oder konnte nicht geladen werden.');return;}
  liveUserRole=roleRows[0].role||'customer';
  const {data,error}=await sb.schema('api').from('my_profile').select('*').maybeSingle();
  if(!error&&data)liveProfile=data;else liveProfile=null;
  if(liveUserRole==='customer'){
    if(!liveProfile){await sb.auth.signOut();authSession=null;renderAuth('Login erfolgreich, aber das Kundenprofil konnte nicht geladen werden. Bitte CF-Zuordnung prüfen.');return;}
    try{await loadCustomerData();}catch(e){dataError='Deine Daten sind derzeit nicht vollständig verfügbar.';}
    state.role='customer';if(['advisor','customers','customer','work','advisorrefs','case','events','revenue'].includes(state.page))state.page='home';
  }else if(['advisor','backoffice','admin'].includes(liveUserRole)){
    try{await loadAdvisorImpulses();}catch(e){dataError='Die Vorgänge konnten nicht geladen werden.';}
    state.role='advisor';if(!['advisor','customers','customer','work'].includes(state.page))state.page='advisor';
  }else {await sb.auth.signOut();authSession=null;renderAuth('Diese Benutzerrolle wird noch nicht unterstützt.');return;}
  if(actor===authSession?.user?.id)render();
}
async function initApp(){
  document.querySelector('#app').innerHTML='<div class="auth-loading">Cashback Finance wird geladen …</div>';
  const {data}=await sb.auth.getSession();authSession=data.session;
  if(authSession) await loadLiveProfile(); else renderAuth();
  sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){clearSession();renderAuth();}else if(session){authSession=session;}});
}
function clearSession(){liveGoalChanges=[];goalChangeReason='';advisorGoalChange=null;goalChangeDraft={title:'',amount:'',purpose:'',date:'',reason:'',confirmed:false};authSession=null;liveProfile=null;liveUserRole='customer';state=structuredClone(DEFAULT);liveProgressSummary=null;liveProgress=[];liveAnnualBenefit=null;liveSavingsGoals=[];liveAchievementRequests=[];liveFinancialMap=[];liveFinancialObjects=[];liveMicrosavings=[];liveReferrals=[];advisorCustomer=null;advisorCustomers=[];advisorImpulses=[];advisorReview=null;reviewDraft={result:'',text:'',evidence:'',confirmed:false};advisorReferral=null;referralMatches=[];referralSelected=null;referralDraft={query:'',date:'',evidence:'',confirmed:false};advisorAchievement=null;achievementDraft={confirmed:false};feedback='';dataError='';pendingActions.clear();}
async function loadAchievementRequests(){const {data,error}=await sb.schema('api').from('my_savings_goal_achievement_requests').select('*').order('requested_at',{ascending:false});if(error)throw error;liveAchievementRequests=data||[];}
async function loadCustomerData(){await loadLiveProgress();await Promise.all([loadLiveFinancialData(),loadLiveAnnualBenefit(),loadLiveReviewRequests(),loadLiveSavings(),loadLiveReferrals(),loadAchievementRequests(),loadGoalChanges()]);}
async function loadCustomerOverview(personId){const {data,error}=await sb.schema('api').rpc('advisor_customer_overview',{p_person_id:personId});if(error)throw error;advisorCustomer=data;}
async function loadAdvisorReferral(id){const {data,error}=await sb.schema('api').rpc('advisor_referral_details',{p_referral_id:id});if(error)throw error;advisorReferral=data;}
function workflowError(e){return ({'Achievement request pending':'Bitte zuerst die offene Zielerreichungsmeldung klären. Das Ziel wurde nicht geändert.','Editable savings goal not available':'Dieses Ziel ist nicht mehr für Änderungen verfügbar.','Decision reason required':'Bitte hinterlege eine Entscheidungsbegründung.','Valid goal details required':'Bitte Titel, positiven Zielbetrag mit höchstens zwei Nachkommastellen und gültige Zielfelder prüfen.','Change request already resolved':'Für diesen Antrag liegt bereits eine andere Entscheidung vor.','Change request not open':'Dieser Änderungsantrag ist bereits geschlossen.','Annual referral limit reached':'Die Jahresgrenze von drei erfolgreichen Empfehlungen ist erreicht. Es wurden keine weiteren Punkte vergeben.','Customer already qualified for this referrer':'Diese Person wurde für diesen Empfehlenden bereits qualifiziert.','Referred person is not a customer':'Die zugeordnete Person ist noch kein CF-Kunde.','Referral customer mismatch':'Die Empfehlung ist bereits einer anderen Person zugeordnet. Bitte prüfe die Zuordnung.','Customer result required':'Bitte gib ein verständliches Ergebnis für den Kunden an.','Human verification required':'Bitte bestätige die fachliche Prüfung.','Review already resolved':'Diese Prüfung wurde bereits mit einem anderen Ergebnis abgeschlossen.','Review not open':'Die Prüfung ist bereits geschlossen.','Evidence reference required':'Bitte hinterlege eine Nachweisreferenz.','Completed onboarding required':'Bitte gib ein bereits abgeschlossenes Onboarding an.','Advisor identity required':'Deinem internen Konto fehlt die Personenidentität für die Prüfprotokollierung.'})[e?.message]||'Die Aktion konnte nicht bestätigt werden. Der aktuelle Stand wird neu geladen.';}
async function refreshData(){
 if(!authSession||refreshing||pendingActions.size)return;
 const actor=authSession.user.id;refreshing=true;
 try{if(liveUserRole==='customer')await loadCustomerData();else{await loadAdvisorImpulses();if(state.page==='goalchange'&&advisorGoalChange)await loadAdvisorGoalChange(advisorGoalChange.request_id);if(state.page==='reviewcheck'&&advisorReview)await loadAdvisorReview(advisorReview.review_id);if(state.page==='referralcheck'&&advisorReferral)await loadAdvisorReferral(advisorReferral.referral_id);if(state.page==='achievementcheck'&&advisorAchievement)await loadAdvisorAchievement(advisorAchievement.request_id);if(advisorCustomer?.person?.person_id)await loadCustomerOverview(advisorCustomer.person.person_id);}dataError='';}
 catch(e){if(actor===authSession?.user?.id)dataError='Aktualisierung fehlgeschlagen. Bitte versuche es erneut.';}
 finally{refreshing=false;if(authSession)render();}
}
async function runWorkflow(key,mutation,reload,success){
 if(pendingActions.size||refreshing||!authSession)return;
 const actor=authSession.user.id;pendingActions.add(key);let committed=false;
 document.querySelectorAll('main button').forEach(b=>b.disabled=true);
 try{await mutation();committed=true;await reload();dataError='';feedback=typeof success==='function'?success():success;}
 catch(e){
  if(actor!==authSession?.user?.id)return;
  if(committed){dataError='Die Aktion wurde gespeichert, aber die aktualisierten Daten konnten nicht geladen werden.';feedback='Bitte Daten aktualisieren.';}
  else {feedback=workflowError(e); try{await reload();dataError='';}catch(_){dataError='Der aktuelle Stand ist unbekannt. Bitte Daten aktualisieren.';}}
 }finally{pendingActions.delete(key);if(authSession)render();}
}
function bindWorkflow(){
 bindReferralWorkflow();bindReviewWorkflow();bindGoalChangeWorkflow();bindAchievementWorkflow();
 const refresh=document.querySelector('[data-refresh]');if(refresh)refresh.onclick=()=>refreshData();
 const request=document.querySelector('[data-request-achievement]');if(request)request.onclick=()=>{
  const goal=state.savingsGoal;if(!goal||goal.status!=='active')return;
  if(liveAchievementRequests.some(r=>r.savings_goal_id===goal.id&&['requested','in_review'].includes(r.status)))return;
  runWorkflow('request',async()=>{const {error}=await sb.schema('api').rpc('request_savings_goal_achievement',{p_savings_goal_id:goal.id,p_note:null});if(error)throw error;},loadCustomerData,'Du hast dein Sparziel als erreicht gemeldet. Cashback Finance prüft die Zielerreichung.');
 };

}
// A focus event can arrive before a click. Keep the current DOM and drafts intact.
window.addEventListener('focus',()=>{
 if(!authSession||refreshing||pendingActions.size)return;
 const refresh=document.querySelector('[data-refresh]');
 if(refresh&&!refresh.disabled)refresh.textContent='Daten auf Aktualität prüfen';
});
initApp();
