'use strict';
let mcPage=1,mcNextPage=null,mcHasMore=false,mcConfigured=false,mcBusy=false,mcTimer=null,mcGeneration=0,mcExploreSequence=0,mcLastSync=null;
const mcFilters={cards:['q','rarity','category','dimension','limit'],collection:['q','rarity','category','dimension','limit'],boosters:[],profiles:['q','limit'],arenas:['limit'],auctions:['status','limit'],leaderboard:['limit']};
const mcLabels={id:'Identifiant',cardId:'Carte',name:'Nom',nameEn:'Nom anglais',description:'Description',descriptionEn:'Description anglaise',category:'Catégorie',dimension:'Dimension',minecraftVersion:'Version Minecraft',rarity:'Rareté',attack:'Attaque',defense:'Défense',active:'Disponible dans les boosters',quantity:'Exemplaires disponibles',username:'Joueur',bio:'Présentation',premium:'MineCards+',showCollection:'Collection publique',showActivity:'Activité publique',createdAt:'Création',score:'Score',rank:'Rang',available:'Boosters disponibles',capacity:'Capacité',intervalSeconds:'Intervalle (secondes)',accruedAt:'Dernière acquisition',giftedStandard:'Dons classiques',giftedPremium:'Dons premium',nextAt:'Prochain booster',premiumAvailable:'Boosters premium disponibles',premiumNextAt:'Prochain premium',premiumIntervalSeconds:'Intervalle premium (secondes)',dailyPremiumAvailable:'Premium disponible (compatibilité)',serverTime:'Heure du serveur',badge:'Badge',champion:'Champion',startingPrice:'Prix de départ',currentBid:'Offre actuelle',status:'Statut enregistré',effectiveStatus:'Statut effectif',hasEnded:'Terminée',settled:'Règlement effectué',endsAt:'Fin',settledAt:'Date du règlement',seller:'Vendeur',highestBidder:'Meilleur enchérisseur',bidCount:'Nombre d’offres',showcaseCards:'Cartes exposées',showcaseBadges:'Badges exposés',collection:'Collection publique',activity:'Activité',avatarId:'Avatar',bannerId:'Bannière'};
mcLabels.power='Puissance officielle';
function mcMessage(message,success=false){const el=document.getElementById('mc-explorer-message');el.textContent=message;el.classList.toggle('success',success);}
function mcErrorMessage(error){return error.message+(error.retryAfter?' Réessaie dans '+error.retryAfter+' secondes.':'');}
function mcAutoEnabled(){try{return localStorage.getItem('mc-auto-'+activeProfile?.id)!=='false';}catch{return true;}}
function mcSetAutoSync(){try{localStorage.setItem('mc-auto-'+activeProfile.id,String(document.getElementById('mc-auto-sync').checked));}catch{} }
function mcStop(){mcGeneration++;mcExploreSequence++;if(mcTimer)clearInterval(mcTimer);mcTimer=null;mcConfigured=false;mcBusy=false;mcLastSync=null;arenaReset();document.getElementById('mc-api-key').value='';document.getElementById('mc-results').textContent='Choisis une rubrique puis clique sur « Afficher ».';document.getElementById('mc-detail').classList.add('hidden');}
function mcApplyStatus(state){
    mcConfigured=state.configured;mcLastSync=state.lastSync;
    document.getElementById('mc-sync-button').disabled=!mcConfigured||mcBusy||state.job?.running;
    let text=mcConfigured?'Connexion active · API '+(state.apiVersion||'1.1.0')+'. ':'Aucune clé reliée à ce profil. ';
    if(state.lastSync)text+=state.uniqueCards+' cartes différentes · '+state.totalCards+' exemplaires disponibles · dernière copie le '+new Date(state.lastSync).toLocaleString('fr-FR')+'.';
    if(state.job?.running)text+=' Synchronisation en cours : '+state.job.pages+' page(s) lue(s).';
    if(state.job?.error)text+=' Dernier essai : '+state.job.error;
    if(state.job?.retryAt&&Date.parse(state.job.retryAt)>Date.now())text+=' Nouvel essai possible à '+new Date(state.job.retryAt).toLocaleTimeString('fr-FR')+'.';
    document.getElementById('mc-status').textContent=text;
}
async function mcStatus(){const generation=mcGeneration;const state=await apiRequest('/api/minecards/status');if(generation!==mcGeneration)return null;mcApplyStatus(state);return state;}
async function mcInit(){
    mcStop();const generation=mcGeneration;
    document.getElementById('mc-auto-sync').checked=mcAutoEnabled();
    try{const state=await mcStatus();if(generation!==mcGeneration||!state)return;if(state.configured&&mcAutoEnabled()&&(!state.lastSync||Date.now()-Date.parse(state.lastSync)>120000||state.job?.running))void mcSync();}
    catch(error){document.getElementById('mc-status').textContent=error.message;}
    if(generation!==mcGeneration)return;
    mcTimer=setInterval(()=>{if(activeProfile&&mcConfigured&&mcAutoEnabled()&&!mcBusy&&document.visibilityState==='visible'&&document.getElementById('card-modal').classList.contains('hidden')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&(!mcLastSync||Date.now()-Date.parse(mcLastSync)>=120000))void mcSync();},120000);
    mcResourceChanged(false);
}
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
async function mcReloadCollection(generation){
    await profileSaveQueue;
    const result=await apiRequest('/api/data');
    if(generation!==mcGeneration||!activeProfile)return;
    cards=Array.isArray(result.data?.cards)?result.data.cards:[];
    favoriteDecks=Array.isArray(result.data?.favoriteDecks)?result.data.favoriteDecks:[];
    filterAndRenderCards();renderFavoriteDecks();
}
async function mcSync(){
    if(mcBusy||!activeProfile)return;
    const generation=mcGeneration;mcBusy=true;document.getElementById('mc-sync-button').disabled=true;
    try{
        await profileSaveQueue;
        if(generation!==mcGeneration)return;
        let state=await apiRequest('/api/minecards/sync',{method:'POST',body:'{}'});
        while(generation===mcGeneration&&state.job?.running){mcApplyStatus(state);await new Promise(resolve=>setTimeout(resolve,2000));if(generation!==mcGeneration)return;state=await apiRequest('/api/minecards/status');}
        if(generation!==mcGeneration)return;
        mcApplyStatus(state);
        if(state.job?.error)throw Object.assign(Error(state.job.error),{retryAfter:state.job.retryAt?Math.max(0,Math.ceil((Date.parse(state.job.retryAt)-Date.now())/1000)):null});
        await mcReloadCollection(generation);
        mcMessage('Collection actualisée depuis MineCards. Les cartes locales et les favoris sont conservés.',true);
    }catch(error){if(generation===mcGeneration){mcMessage(mcErrorMessage(error));document.getElementById('mc-status').textContent=mcErrorMessage(error);}}
    finally{if(generation===mcGeneration){mcBusy=false;document.getElementById('mc-sync-button').disabled=!mcConfigured;}}
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
