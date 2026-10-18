'use strict';
let mcPage=1,mcNextPage=null,mcHasMore=false,mcConfigured=false,mcBusy=false,mcTimer=null,mcGeneration=0,mcExploreSequence=0,mcLastSync=null;
let mcSyncPromise=null,mcController=null,mcCurrentStatus=null,mcNextAutoAt=0;
const mcAutoInterval=30000;
const mcFilters={cards:['q','rarity','category','dimension','limit'],collection:['q','rarity','category','dimension','limit'],boosters:[],profiles:['q','limit'],arenas:['limit'],auctions:['status','limit'],leaderboard:['limit']};
const mcLabels={id:'Identifiant',cardId:'Carte',name:'Nom',nameEn:'Nom anglais',description:'Description',descriptionEn:'Description anglaise',category:'Catégorie',dimension:'Dimension',minecraftVersion:'Version Minecraft',rarity:'Rareté',attack:'Attaque',defense:'Défense',active:'Disponible dans les boosters',quantity:'Exemplaires disponibles',username:'Joueur',bio:'Présentation',premium:'MineCards+',showCollection:'Collection publique',showActivity:'Activité publique',createdAt:'Création',score:'Score',rank:'Rang',available:'Boosters disponibles',capacity:'Capacité',intervalSeconds:'Intervalle (secondes)',accruedAt:'Dernière acquisition',giftedStandard:'Dons classiques',giftedPremium:'Dons premium',nextAt:'Prochain booster',premiumAvailable:'Boosters premium disponibles',premiumNextAt:'Prochain premium',premiumIntervalSeconds:'Intervalle premium (secondes)',dailyPremiumAvailable:'Premium disponible (compatibilité)',serverTime:'Heure du serveur',badge:'Badge',champion:'Champion',startingPrice:'Prix de départ',currentBid:'Offre actuelle',status:'Statut enregistré',effectiveStatus:'Statut effectif',hasEnded:'Terminée',settled:'Règlement effectué',endsAt:'Fin',settledAt:'Date du règlement',seller:'Vendeur',highestBidder:'Meilleur enchérisseur',bidCount:'Nombre d’offres',showcaseCards:'Cartes exposées',showcaseBadges:'Badges exposés',collection:'Collection publique',activity:'Activité',avatarId:'Avatar',bannerId:'Bannière'};
mcLabels.power='Puissance officielle';
function mcMessage(message,success=false){const el=document.getElementById('mc-explorer-message');el.textContent=message;el.classList.toggle('success',success);}
function mcErrorMessage(error){return error.message+(error.retryAfter?' Réessaie dans '+error.retryAfter+' secondes.':'');}
function mcAutoEnabled(){try{return localStorage.getItem('mc-auto-'+activeProfile?.id)!=='false';}catch{return true;}}
function mcSetAutoSync(){try{localStorage.setItem('mc-auto-'+activeProfile.id,String(document.getElementById('mc-auto-sync').checked));}catch{}void mcMaybeSync();}
function mcStop(){
    mcGeneration++;mcExploreSequence++;mcController?.abort();mcController=null;mcSyncPromise=null;
    if(mcTimer)clearInterval(mcTimer);mcTimer=null;mcConfigured=false;mcBusy=false;mcLastSync=null;mcCurrentStatus=null;mcNextAutoAt=0;
    arenaReset();document.getElementById('mc-api-key').value='';document.getElementById('mc-results').textContent='Choisis une rubrique puis clique sur « Afficher ».';document.getElementById('mc-detail').classList.add('hidden');
    document.getElementById('mc-sync-progress').classList.add('hidden');document.getElementById('collection-sync-state').textContent='';
}
function mcDelay(milliseconds,signal){
    return new Promise((resolve,reject)=>{
        if(signal.aborted){reject(new DOMException('Synchronisation interrompue.','AbortError'));return;}
        const done=()=>{signal.removeEventListener('abort',cancel);resolve();};
        const timer=setTimeout(done,milliseconds);
        const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(new DOMException('Synchronisation interrompue.','AbortError'));};
        signal.addEventListener('abort',cancel,{once:true});
    });
}
function mcApplyStatus(state){
    mcCurrentStatus=state;
    mcConfigured=state.configured;mcLastSync=state.lastSync;
    const job=state.job,button=document.getElementById('mc-sync-button');
    button.disabled=!mcConfigured||mcBusy;button.setAttribute('aria-busy',String(mcBusy));
    button.innerHTML='<i class="fa-solid fa-arrows-rotate'+(mcBusy?' fa-spin':'')+'" aria-hidden="true"></i> '+(mcBusy?'Synchronisation…':job?.running?'Reprendre la synchronisation':'Synchroniser maintenant');
    let text=mcConfigured?'Connexion active · API '+(state.apiVersion||'1.1.0')+'. ':'Aucune clé reliée à ce profil. ';
    if(state.lastSync)text+=state.uniqueCards+' cartes différentes · '+state.totalCards+' exemplaires disponibles · dernière copie le '+new Date(state.lastSync).toLocaleString('fr-FR')+'.';
    if(state.job?.running)text+=' Synchronisation en cours : '+state.job.pages+' page(s) lue(s).';
    if(state.job?.error)text+=' Dernier essai : '+state.job.error;
    if(state.job?.retryAt&&Date.parse(state.job.retryAt)>Date.now())text+=' Nouvel essai possible à '+new Date(state.job.retryAt).toLocaleTimeString('fr-FR')+'.';
    document.getElementById('mc-status').textContent=text;
    const progress=document.getElementById('mc-sync-progress'),meter=document.getElementById('mc-sync-meter'),indicator=document.getElementById('collection-sync-state');
    progress.classList.toggle('hidden',!mcBusy&&!job?.running&&job?.phase!=='complete');
    const waiting=job?.retryAt&&Date.parse(job.retryAt)>Date.now();
    const seconds=waiting?Math.ceil((Date.parse(job.retryAt)-Date.now())/1000):0;
    let phase=job?.phase==='complete'?'Collection à jour':waiting?'Reprise dans '+seconds+' s':mcBusy?(job?.phase==='starting'?'Préparation de la synchronisation…':'Lecture de la page '+(job?.nextPage||1)+'…'):job?.running?'Synchronisation à reprendre':'';
    document.getElementById('mc-sync-phase').textContent=phase;
    document.getElementById('mc-sync-counts').textContent=(job?.pages||0)+' page(s) · '+(job?.received||0)+' carte(s) reçue(s)';
    if(job?.phase==='complete')meter.value=1;else meter.removeAttribute('value');
    indicator.classList.toggle('sync-active',mcBusy);indicator.textContent=mcBusy?phase:job?.running?'Actualisation interrompue · reprise possible':state.lastSync?'Collection actualisée à '+new Date(state.lastSync).toLocaleTimeString('fr-FR'):'';
}
async function mcStatus(){const generation=mcGeneration;const state=await apiRequest('/api/minecards/status');if(generation!==mcGeneration)return null;mcApplyStatus(state);return state;}
async function mcInit(){
    mcStop();const generation=mcGeneration;
    document.getElementById('mc-auto-sync').checked=mcAutoEnabled();
    try{const state=await mcStatus();if(generation!==mcGeneration||!state)return;void mcMaybeSync();}
    catch(error){document.getElementById('mc-status').textContent=error.message;}
    if(generation!==mcGeneration)return;
    mcTimer=setInterval(()=>void mcMaybeSync(),5000);
    mcResourceChanged(false);
}
function mcMaybeSync(){
    const editing=document.activeElement?.matches('textarea,select,input:not([type="checkbox"]):not([type="button"]):not([type="submit"])');
    if(activeProfile&&mcConfigured&&mcAutoEnabled()&&!mcBusy&&Date.now()>=mcNextAutoAt&&document.visibilityState==='visible'&&document.getElementById('card-modal').classList.contains('hidden')&&!editing&&(mcCurrentStatus?.job?.running||!mcLastSync||Date.now()-Date.parse(mcLastSync)>=mcAutoInterval))return mcSync();
    return Promise.resolve(null);
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void mcMaybeSync();});
window.addEventListener('focus',()=>void mcMaybeSync());
window.addEventListener('online',()=>{mcNextAutoAt=0;void mcMaybeSync();});
async function mcShow(){try{await mcStatus();}catch(error){mcMessage(error.message);}mcResourceChanged(false);}
async function mcConnect(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
    try{const state=await apiRequest('/api/minecards/connect',{method:'POST',body:JSON.stringify({key:document.getElementById('mc-api-key').value.trim()})});form.reset();mcApplyStatus(state);await mcSync();}
    catch(error){mcMessage(mcErrorMessage(error));}finally{button.disabled=false;}
}
async function mcDisconnect(){
    if(!confirm('Déconnecter la clé MineCards de ce profil ? La dernière copie de collection et tes cartes locales seront conservées.'))return;
    try{await apiRequest('/api/minecards/disconnect',{method:'POST',body:'{}'});await mcInit();mcMessage('Connexion retirée. La dernière collection importée reste consultable.',true);}catch(error){mcMessage(error.message);}
}
async function mcReloadCollection(generation,suppliedData=null,revision=null,serverRevision=null){
    while(generation===mcGeneration&&activeProfile){
        await profileSaveQueue;
        if(generation!==mcGeneration||!activeProfile)return;
        const currentRevision=profileDataRevision;
        const result=suppliedData&&revision===currentRevision?{data:suppliedData,revision:serverRevision}:await apiRequest('/api/data');
        if(generation!==mcGeneration||!activeProfile)return;
        // Une sauvegarde lancée pendant cette lecture doit se terminer avant
        // d'afficher une nouvelle copie, sans effacer les modifications locales.
        if(currentRevision!==profileDataRevision){suppliedData=null;continue;}
        if(Number.isSafeInteger(result.revision))profileServerRevision=result.revision;
        const nextCards=Array.isArray(result.data?.cards)?result.data.cards:[],nextDecks=Array.isArray(result.data?.favoriteDecks)?result.data.favoriteDecks:[];
        if(JSON.stringify(nextCards)===JSON.stringify(cards)&&JSON.stringify(nextDecks)===JSON.stringify(favoriteDecks))return false;
        cards=nextCards;favoriteDecks=nextDecks;
        filterAndRenderCards();renderFavoriteDecks();
        return true;
    }
}
function mcSync(){
    if(mcSyncPromise)return mcSyncPromise;
    if(!activeProfile)return Promise.resolve(null);
    const generation=mcGeneration,controller=new AbortController();mcController=controller;mcBusy=true;
    mcApplyStatus({...mcCurrentStatus,configured:mcConfigured,lastSync:mcLastSync,job:{running:true,phase:'starting',pages:0,received:0}});
    const task=(async()=>{
        try{
            await profileSaveQueue;if(generation!==mcGeneration)return null;
            const revision=profileDataRevision;
            let state=await apiRequest('/api/minecards/sync',{method:'POST',body:'{}',signal:controller.signal}),transportRetries=0;
            while(generation===mcGeneration&&state.job?.running){
                mcApplyStatus(state);
                const nextAt=state.job.retryAt?Date.parse(state.job.retryAt):Date.now()+(state.job.nextPollMs||0);
                while(nextAt>Date.now()){
                    await mcDelay(Math.min(1000,nextAt-Date.now()),controller.signal);
                    if(generation!==mcGeneration)return null;mcApplyStatus(state);
                }
                if(!state.job.id||!Number.isSafeInteger(state.job.nextPage))throw Error('Recharge la page pour activer la nouvelle synchronisation.');
                mcApplyStatus({...state,job:{...state.job,phase:'fetching',retryAt:null}});
                try{
                    state=await apiRequest('/api/minecards/sync/step',{method:'POST',body:JSON.stringify({jobId:state.job.id,page:state.job.nextPage}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
                    transportRetries=0;
                }catch(error){
                    if(controller.signal.aborted||transportRetries>=2||error.status&&![502,503,504].includes(error.status))throw error;
                    transportRetries++;mcMessage('Connexion instable : reprise de la dernière étape confirmée…',true);
                    await mcDelay(1000*transportRetries,controller.signal);
                    state=await apiRequest('/api/minecards/status',{signal:controller.signal});
                }
            }
            if(generation!==mcGeneration)return null;
            mcApplyStatus(state);
            if(state.job?.error)throw Object.assign(Error(state.job.error),{retryAfter:state.job.retryAt?Math.max(0,Math.ceil((Date.parse(state.job.retryAt)-Date.now())/1000)):null});
            if(!state.configured||state.job?.phase!=='complete')throw Error('La synchronisation a été interrompue. Relance-la depuis la connexion MineCards.');
            const changed=await mcReloadCollection(generation,state.data,revision,state.dataRevision);
            if(generation!==mcGeneration)return null;
            mcMessage(changed?'Collection actualisée depuis MineCards.':'Collection à jour : aucun changement depuis la dernière lecture.',true);
            mcNextAutoAt=Date.now()+mcAutoInterval;
            return state;
        }catch(error){
            if(generation===mcGeneration){
                mcNextAutoAt=Date.now()+Math.max(mcAutoInterval,(error.retryAfter||0)*1000);mcMessage(mcErrorMessage(error));
                if(mcCurrentStatus)mcCurrentStatus={...mcCurrentStatus,job:{...mcCurrentStatus.job,error:mcErrorMessage(error)}};
            }
            return null;
        }finally{
            if(generation===mcGeneration){mcBusy=false;mcSyncPromise=null;mcController=null;if(mcCurrentStatus)mcApplyStatus(mcCurrentStatus);}
        }
    })();
    mcSyncPromise=task;return task;
}
function mcResourceChanged(load=true){
    const resource=document.getElementById('mc-resource').value;
    for(const label of document.querySelectorAll('[data-mc-filter]'))label.classList.toggle('hidden',!mcFilters[resource].includes(label.dataset.mcFilter));
    mcPage=1;mcNextPage=null;mcHasMore=false;document.getElementById('mc-prev').disabled=true;document.getElementById('mc-next').disabled=true;document.getElementById('mc-page').textContent='Page 1';
    document.getElementById('mc-pagination').classList.toggle('hidden',resource==='boosters');
    document.getElementById('mc-detail').classList.add('hidden');
    if(load)void mcExplore();
}
function mcValue(value){
    if(value===null||value===undefined)return 'Non disponible';
    if(typeof value==='boolean')return value?'Oui':'Non';
    if(Array.isArray(value))return value.length?value.map(item=>typeof item==='object'?((item?.name||item?.card?.name||item?.username||JSON.stringify(item))+(Number.isSafeInteger(item?.power)?' ('+item.power+' pts)':'')):String(item)).join(' · '):'Aucun';
    if(typeof value==='object')return value.name||value.username||Object.entries(value).map(([k,v])=>(mcLabels[k]||k)+' : '+mcValue(v)).join(' · ');
    if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value))return new Date(value).toLocaleString('fr-FR');
    return String(value);
}
function mcRecord(item,resource,detail=false){
    const record=resource==='collection'?item.card:item;
    const artwork=resource==='auctions'?record?.card:record;
    const title=record?.name||record?.username||record?.card?.name||(resource==='boosters'?'Tes boosters':record?.id)||'Données MineCards';
    const data=resource==='collection'?{quantity:item.quantity,...record}:resource==='auctions'?{...record,power:record.card?.power,attack:record.card?.attack,defense:record.card?.defense}:record;
    const image=typeof artwork?.image==='string'&&/^https:\/\//.test(artwork.image)?`<img class="mc-remote-image" loading="lazy" src="${escapeHtml(artwork.image)}" alt="${escapeHtml(title)}">`:'';
    const entries=Object.entries(data||{}).filter(([key])=>!['image','wikiUrl','name','username','descriptionEn','nameEn'].includes(key));
    const fields=(detail?entries:entries.filter(([key])=>['power','quantity','rarity','attack','defense','category','dimension','bio','premium','score','rank','currentBid','effectiveStatus','settled','endsAt','available','capacity','nextAt','giftedStandard','giftedPremium','premiumAvailable','premiumNextAt'].includes(key))).map(([key,value])=>`<div><dt>${escapeHtml(mcLabels[key]||key)}</dt><dd>${escapeHtml(mcValue(value))}</dd></div>`).join('');
    const canDetail=!detail&&['cards','collection','profiles','arenas','auctions'].includes(resource)&&record?.id;
    const wiki=typeof record?.wikiUrl==='string'&&/^https:\/\//.test(record.wikiUrl)?`<a href="${escapeHtml(record.wikiUrl)}" target="_blank" rel="noopener noreferrer">Wiki Minecraft ↗</a>`:'';
    return `<article class="mc-record">${image}<div class="mc-record-heading"><h4>${escapeHtml(title)}</h4>${resource==='leaderboard'?'<span>#'+escapeHtml(item.rank)+'</span>':''}</div>${record?.description?'<p>'+escapeHtml(record.description)+'</p>':''}<dl>${fields}</dl><div class="mc-record-actions">${canDetail?`<button type="button" class="secondary-button" data-id="${escapeHtml(record.id)}" data-resource="${resource==='collection'?'cards':resource}" onclick="mcOpenDetail(this.dataset.resource,this.dataset.id)">Voir la fiche</button>`:''}${wiki}</div><details><summary>Données complètes de l’API</summary><pre>${escapeHtml(JSON.stringify(item,null,2))}</pre></details></article>`;
}
async function mcExplore(){
    const generation=mcGeneration,sequence=++mcExploreSequence,resource=document.getElementById('mc-resource').value;
    mcMessage('Lecture de MineCards…',true);document.getElementById('mc-prev').disabled=true;document.getElementById('mc-next').disabled=true;
    const params=new URLSearchParams();
    if(resource!=='boosters')params.set('page',mcPage);
    const ids={q:'mc-q',rarity:'mc-rarity',category:'mc-category',dimension:'mc-dimension',status:'mc-auction-status',limit:'mc-limit'};
    for(const filter of mcFilters[resource]){const value=document.getElementById(ids[filter]).value.trim();if(value)params.set(filter,value);}
    try{
        const result=await apiRequest('/api/minecards/explore/'+resource+(params.size?'?'+params:''));
        if(generation!==mcGeneration||sequence!==mcExploreSequence)return;
        const items=Array.isArray(result.data)?result.data:[result.data];
        document.getElementById('mc-results').innerHTML=items.length?items.map(item=>mcRecord(item,resource)).join(''):'<p>Aucun résultat pour ces filtres.</p>';
        mcNextPage=result.pagination?.nextPage;
        mcHasMore=!!result.pagination?.hasMore&&Number.isInteger(mcNextPage)&&mcNextPage>mcPage&&mcNextPage<=1000;
        document.getElementById('mc-page').textContent='Page '+mcPage;
        document.getElementById('mc-prev').disabled=mcPage<=1;document.getElementById('mc-next').disabled=!mcHasMore;
        mcMessage(items.length+' résultat(s) affiché(s).'+(result.pagination?.hasMore&&mcNextPage===null?' Limite de navigation MineCards atteinte : affine les filtres pour voir la suite.':''),true);
    }catch(error){if(generation===mcGeneration&&sequence===mcExploreSequence)mcMessage(mcErrorMessage(error));}
}
function mcChangePage(delta){if(delta>0&&!mcHasMore)return;mcPage=delta>0?mcNextPage:Math.max(1,mcPage-1);void mcExplore();}
async function mcOpenDetail(resource,id){
    const generation=mcGeneration,sequence=++mcExploreSequence;
    mcMessage('Chargement de la fiche…',true);
    try{const result=await apiRequest('/api/minecards/explore/'+resource+'/'+encodeURIComponent(id));if(generation!==mcGeneration||sequence!==mcExploreSequence)return;document.getElementById('mc-detail-content').innerHTML=mcRecord(result.data,resource,true);document.getElementById('mc-detail').classList.remove('hidden');document.getElementById('mc-detail').scrollIntoView({behavior:'smooth',block:'start'});mcMessage('',true);}catch(error){if(generation===mcGeneration)mcMessage(error.message);}
}
