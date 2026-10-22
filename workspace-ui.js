'use strict';
let notebookEntries={},workspaceGeneration=0,workspaceFilteredCards=[],workspaceQuantities=new Map(),workspaceNotebookQueue=Promise.resolve(),workspaceDeckQueue=Promise.resolve(),workspaceSiteTimer=null,workspaceCollectionSignature=null;
const comparedDecks=new Set();
const workspaceNormalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const workspaceCardKey=card=>card._minecards?.cardId&&Number(card.id)<0?'mc:'+card._minecards.cardId:'local:'+card.id;
const workspaceFilterIds=['search-input','rarity-filter','sort-select','collection-source','collection-category','collection-dimension','collection-quantity','collection-finish','collection-min','collection-max','collection-pinned'];
const wn=id=>document.getElementById(id);
function workspaceToast(message,error=false){const node=wn('workspace-feedback');node.textContent=message;node.classList.toggle('is-error',error);}
function workspaceReset(){
    recyclerReset();
    clearInterval(workspaceSiteTimer);workspaceSiteTimer=null;
    workspaceGeneration++;notebookEntries={};workspaceFilteredCards=[];comparedDecks.clear();workspaceNotebookQueue=Promise.resolve();workspaceDeckQueue=Promise.resolve();
    workspaceCollectionSignature=null;
    for(const dialog of document.querySelectorAll('dialog.workspace-dialog[open]'))dialog.close();
    wn('workspace-card-note').value='';wn('workspace-card-pin').checked=false;wn('workspace-card-content').textContent='';wn('workspace-card-note-message').textContent='';wn('deck-compare-content').textContent='';
    wn('account-sessions').textContent='';wn('workspace-feedback').textContent='';
    wn('deck-search').value='';wn('deck-kind').value='all';wn('deck-sort').value='recent';
    adminReset();
}
async function workspaceInit(user){
    workspaceReset();const generation=workspaceGeneration;
    workspaceClearFilters(false);
    try{
        const saved=JSON.parse(localStorage.getItem('mc-library-'+user.id)||'{}');
        workspacePopulateFilters();
        for(const id of workspaceFilterIds)if(Object.hasOwn(saved,id)){if(id==='collection-pinned')wn(id).checked=saved[id]===true;else{wn(id).value=String(saved[id]);if(wn(id).tagName==='SELECT'&&wn(id).selectedIndex<0)wn(id).value=id==='sort-select'?'valeur-desc':'all';}}
        setCollectionView(saved.view==='list'?'list':'grid');
    }catch{}
    const results=await Promise.allSettled([apiRequest('/api/notebook'),apiRequest('/api/site')]);
    if(generation!==workspaceGeneration||activeProfile?.id!==user.id)return;
    if(results[0].status==='fulfilled')notebookEntries=results[0].value.entries;
    else workspaceToast('Le carnet personnel n’a pas pu être chargé : '+results[0].reason.message,true);
    if(results[1].status==='fulfilled')workspacePaintSite(results[1].value);
    workspaceSiteTimer=setInterval(()=>{if(document.visibilityState==='visible')void workspaceRefreshSite();},60000);
}
async function workspaceRefreshSite(){const generation=workspaceGeneration;try{const settings=await apiRequest('/api/site');if(generation===workspaceGeneration)workspacePaintSite(settings);}catch{}}
function workspacePaintSite(settings){
    const node=wn('site-announcement');node.hidden=!settings.message;node.textContent=settings.message;node.dataset.tone=settings.tone;
    wn('auth-register-tab').disabled=settings.registrationsOpen===false;
}
function workspaceRemember(){
    if(!activeProfile)return;
    const values=Object.fromEntries(workspaceFilterIds.map(id=>[id,id==='collection-pinned'?wn(id).checked:wn(id).value]));
    values.view=wn('cards-grid').classList.contains('list-view')?'list':'grid';
    try{localStorage.setItem('mc-library-'+activeProfile.id,JSON.stringify(values));}catch{}
}
function workspacePopulateFilters(){
    workspaceQuantities=new Map(collectionCopyStats(cards).entries.map(entry=>[deckIdentity(entry.card),entry.quantity]));
    for(const [id,field]of [['collection-category','category'],['collection-dimension','dimension']]){
        const node=wn(id),values=[...new Set(cards.map(card=>card._minecards?.[field]).filter(Boolean))].sort();
        const signature=JSON.stringify(values);if(node.dataset.values===signature)continue;
        const selected=node.value;node.innerHTML='<option value="all">Toutes</option>'+values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');node.dataset.values=signature;
        node.value=values.includes(selected)?selected:'all';
    }
}
function workspaceFilterState(){
    workspacePopulateFilters();workspaceRemember();
    return {source:wn('collection-source').value,category:wn('collection-category').value,dimension:wn('collection-dimension').value,quantity:wn('collection-quantity').value,finish:wn('collection-finish').value,min:wn('collection-min').value===''?null:Number(wn('collection-min').value),max:wn('collection-max').value===''?null:Number(wn('collection-max').value),pinned:wn('collection-pinned').checked};
}
function workspaceUpdateDerived(){
    const signature=JSON.stringify(cards);if(signature===workspaceCollectionSignature)return;
    workspaceCollectionSignature=signature;updateStats();updateBuilderState();arenaRefreshCollection();updateEditionStats();
}
function workspaceMatch(card,state){
    const remote=card._minecards,quantity=workspaceQuantities.get(deckIdentity(card))||1,power=deckPower(card);
    const finish=EditionRules.finishes(card);
    const matchesFinish=state.finish==='all'||state.finish==='holographic'&&finish.holographic>0||state.finish==='standard'&&finish.standard>0||state.finish==='holo-only'&&finish.known&&finish.standard===0&&finish.holographic>0||state.finish==='recyclable'&&finish.recyclable>0&&EditionRules.points(card)!==null||state.finish==='unknown'&&!!remote&&!finish.known;
    return matchesFinish&&(state.source==='all'||(state.source==='minecards'?!!remote:!remote))&&(state.category==='all'||remote?.category===state.category)&&(state.dimension==='all'||remote?.dimension===state.dimension)&&(state.quantity==='all'||(state.quantity==='duplicates'?quantity>1:quantity===1))&&(state.min===null||power!==null&&power>=state.min)&&(state.max===null||power!==null&&power<=state.max)&&(!state.pinned||notebookEntries[workspaceCardKey(card)]?.favorite===true);
}
function workspaceSearchMatch(card,query){return workspaceNormalize([card.nom,card._minecards?.nameEn,card._minecards?.category,card._minecards?.dimension,notebookEntries[workspaceCardKey(card)]?.note].join(' ')).includes(workspaceNormalize(query));}
function workspaceClearFilters(render=true){
    for(const id of workspaceFilterIds){const node=wn(id);if(id==='collection-pinned')node.checked=false;else node.value=id==='sort-select'?'valeur-desc':['search-input','collection-min','collection-max'].includes(id)?'':'all';}
    if(render)filterAndRenderCards();
}
function workspaceCsv(rows){
    const cell=value=>{let text=String(value??'');if(/^\s*[=+\-@]|^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    return '\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
function workspaceDownload(name,content,type='application/json'){
    const url=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function workspaceExportCollection(format='csv'){
    const list=[...new Map(workspaceFilteredCards.map(card=>[deckIdentity(card),card])).values()];
    if(!list.length){workspaceToast('Aucune carte à exporter avec ces filtres.',true);return;}
    const rows=list.map(card=>({id:workspaceCardKey(card),nom:card.nom,rarete:card.rarete,puissance:deckPower(card),attaque:card.attaque,defense:card.defense,exemplaires:workspaceQuantities.get(deckIdentity(card))||1,doublons:Math.max(0,(workspaceQuantities.get(deckIdentity(card))||1)-1),standard:EditionRules.finishes(card).standard,holographique:EditionRules.finishes(card).holographic,recyclable:EditionRules.finishes(card).known?EditionRules.finishes(card).recyclable:null,secrete:EditionRules.secret(card),categorie:card._minecards?.category||'',dimension:card._minecards?.dimension||'',source:card._minecards?'MineCards':'Locale',note:notebookEntries[workspaceCardKey(card)]?.note||''}));
    const name='collection-'+activeProfile.username+'-'+new Date().toISOString().slice(0,10);
    if(format==='json')workspaceDownload(name+'.json',JSON.stringify({exportedAt:new Date().toISOString(),cards:rows},null,2));
    else workspaceDownload(name+'.csv',workspaceCsv([Object.keys(rows[0]),...rows.map(Object.values)]),'text/csv;charset=utf-8');
    workspaceToast(rows.length+' cartes différentes exportées avec les filtres actuels.');
}
async function workspaceExportAccount(){
    const profileId=activeProfile?.id;
    try{await profileSaveQueue;await workspaceNotebookQueue;const data=await apiRequest('/api/export');if(activeProfile?.id!==profileId)return;workspaceDownload('mon-compte-'+activeProfile.username+'.json',JSON.stringify(data,null,2));workspaceToast('Export personnel téléchargé : profil, collection, decks et carnet.');}catch(error){workspaceToast(error.message,true);}
}
async function workspaceReloadAccount(){
    const generation=workspaceGeneration;
    try{await workspaceDeckQueue;await profileSaveQueue;await mcReloadCollection(mcGeneration);if(generation===workspaceGeneration)workspaceToast('Collection et favoris rechargés depuis le serveur.');}catch(error){if(generation===workspaceGeneration)workspaceToast(error.message,true);}
}
function workspaceNotebookSave(key,favorite,note,button){
    const generation=workspaceGeneration;if(button)button.disabled=true;
    const saving=workspaceNotebookQueue.then(async()=>{
        if(generation!==workspaceGeneration)return;
        const result=await apiRequest('/api/notebook',{method:'PATCH',body:JSON.stringify({key,favorite,note})});
        if(generation!==workspaceGeneration)return;
        notebookEntries=result.entries;filterAndRenderCards();recyclerRender();workspaceToast('Carnet enregistré.');
    });
    workspaceNotebookQueue=saving.catch(error=>{if(generation===workspaceGeneration)workspaceToast(error.message,true);});
    return saving.finally(()=>{if(button)button.disabled=false;});
}
function workspaceCardTools(card){
    const key=workspaceCardKey(card),pinned=!!notebookEntries[key]?.favorite;
    return `<div class="collection-personal-tools"><button type="button" data-card-key="${escapeHtml(key)}" data-workspace-action="card" aria-label="Ouvrir la fiche de ${escapeHtml(card.nom)}"><i class="fa-regular fa-eye" aria-hidden="true"></i> Fiche & notes</button><button type="button" data-card-key="${escapeHtml(key)}" data-workspace-action="pin" aria-pressed="${pinned}" aria-label="${pinned?'Retirer des':'Ajouter aux'} cartes favorites"><i class="${pinned?'fa-solid':'fa-regular'} fa-heart" aria-hidden="true"></i></button></div>`;
}
function workspaceOpenCard(key){
    const card=cards.find(item=>workspaceCardKey(item)===key);if(!card)return;
    const entry=notebookEntries[key]||{},remote=card._minecards,quantity=workspaceQuantities.get(deckIdentity(card))||1;
    const used=favoriteDecks.filter(deck=>[...(deck.cards||[]),...(deck.supports||[])].some(item=>deckIdentity(item)===deckIdentity(card)));
    const dialog=wn('workspace-card-dialog');dialog.dataset.cardKey=key;
    wn('workspace-card-title').textContent=card.nom;
    wn('workspace-card-content').innerHTML=`<div class="card-detail-art">${profileCardArt(card)}</div><div><span class="eyebrow">${escapeHtml(card.rarete)} · ${remote?'MINECARDS':'CARTE LOCALE'}</span><dl class="workspace-detail-stats">${[['Puissance',deckPower(card)],['Exemplaires',quantity],['Doublons hors original',Math.max(0,quantity-1)],['Standard disponibles',EditionRules.finishes(card).standard??'À actualiser'],['Holographiques disponibles',EditionRules.finishes(card).holographic??'À actualiser'],['Doublons standard recyclables',EditionRules.finishes(card).known?EditionRules.finishes(card).recyclable:'À actualiser'],['Points par standard recyclé',EditionRules.points(card)??'Non recyclable'],['Attaque enregistrée',card.attaque],['Défense enregistrée',card.defense],['Catégorie',remote?.category||'—'],['Dimension',remote?.dimension||'—'],['Attaque officielle',remote?.attack??'—'],['Défense officielle',remote?.defense??'—']].map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHtml(value??'—')}</dd></div>`).join('')}</dl><h4>Présente dans ${used.length} deck(s) favori(s)</h4><p>${used.length?used.map(deck=>escapeHtml(deck.name)).join(' · '):'Cette carte attend sa prochaine équipe.'}</p></div>`;
    wn('workspace-card-note').value=entry.note||'';wn('workspace-card-pin').checked=!!entry.favorite;wn('workspace-card-note-message').textContent='';dialog.showModal();
}
async function workspaceSaveCardNote(event){
    event.preventDefault();const dialog=wn('workspace-card-dialog'),button=event.submitter,key=dialog.dataset.cardKey,generation=workspaceGeneration;
    try{await workspaceNotebookSave(key,wn('workspace-card-pin').checked,wn('workspace-card-note').value,button);if(generation===workspaceGeneration&&dialog.dataset.cardKey===key)wn('workspace-card-note-message').textContent='Note et favori enregistrés.';}catch(error){if(generation===workspaceGeneration)wn('workspace-card-note-message').textContent=error.message;}
}
function workspaceDeckSelection(){
    const query=workspaceNormalize(wn('deck-search').value),kind=wn('deck-kind').value,sort=wn('deck-sort').value;
    return favoriteDecks.filter(deck=>(kind==='all'||(kind==='arena')===(deck.mode==='arena'))&&workspaceNormalize([deck.name,...(deck.cards||[]).map(card=>card.nom),...(deck.supports||[]).map(card=>card.nom)].join(' ')).includes(query)).sort((a,b)=>sort==='power-desc'?Number(b.totalPower)-Number(a.totalPower):sort==='power-asc'?Number(a.totalPower)-Number(b.totalPower):sort==='name'?String(a.name).localeCompare(String(b.name),'fr'):Number(b.id)-Number(a.id));
}
function renderFavoriteDecks(){
    renderProfileShowcase();
    recyclerRender();
    for(const id of [...comparedDecks])if(!favoriteDecks.some(deck=>String(deck.id)===id))comparedDecks.delete(id);
    const list=workspaceDeckSelection();wn('no-favorites-state').classList.toggle('hidden',favoriteDecks.length>0);wn('deck-no-results').hidden=list.length>0||!favoriteDecks.length;
    wn('deck-visible-count').textContent=list.length+' / '+favoriteDecks.length+' deck(s)';
    wn('deck-compare-button').disabled=comparedDecks.size!==2;wn('deck-compare-button').textContent='Comparer ('+comparedDecks.size+'/2)';
    const owned=new Set(distinctDeckCards(cards).map(deckIdentity));
    wn('favorite-decks-grid').innerHTML=list.map(deck=>{
        const arena=deck.mode==='arena',id=String(deck.id),missing=[...(deck.cards||[]),...(deck.supports||[])].filter(card=>!owned.has(deckIdentity(card))).length;
        return `<article class="saved-deck"><div class="saved-deck-heading"><span class="saved-deck-icon"><i class="fa-solid ${arena?'fa-shield-halved':'fa-star'}" aria-hidden="true"></i></span><div><span class="eyebrow">${arena?'ÉQUIPE TACTIQUE':'TRIO FAVORI'}</span><h3>${escapeHtml(deck.name)}</h3></div><div class="saved-deck-power">${escapeHtml(deck.totalPower)}<small>puissance</small></div></div><ol class="saved-deck-cards">${(deck.cards||[]).map((card,index)=>`<li><span class="saved-card-index">0${index+1}</span><span><strong>${escapeHtml(card.nom)}</strong><small>${escapeHtml(card.rarete)}${EditionRules.hasHolo(card)?' · holo disponible':''}</small></span><b>${escapeHtml(card.valeur)}<small>pts</small></b></li>`).join('')}</ol>${arena?`<div class="saved-arena-info"><span>${escapeHtml(ArenaRules.environments[deck.arenaId]?.name||'Arène')}</span><span>${escapeHtml(ArenaRules.stances[deck.tactic]?.name||'Posture')}</span><span>${escapeHtml(deck.teamCost??'—')} / 18 points</span></div><p class="deck-support-note">Soutiens : ${(deck.supports||[]).length?deck.supports.map(card=>escapeHtml(card.nom)).join(' · '):'aucun'}</p>`:''}<p class="deck-availability ${missing?'is-error':''}">${missing?missing+' carte(s) absente(s) de la collection actuelle':'Toutes les cartes sont disponibles'}</p><div class="workspace-actions">${[['open','Ouvrir'],['rename','Renommer'],['copy','Dupliquer'],['export','Exporter']].map(([action,label])=>`<button type="button" class="secondary-button" data-workspace-action="deck-${action}" data-deck-id="${escapeHtml(id)}">${label}</button>`).join('')}</div><div class="saved-deck-footer"><label><input type="checkbox" data-workspace-action="deck-select" data-deck-id="${escapeHtml(id)}" ${comparedDecks.has(id)?'checked':''}> Comparer</label><button type="button" data-workspace-action="deck-delete" data-deck-id="${escapeHtml(id)}"><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Supprimer</button></div><small class="deck-date">Enregistré le ${escapeHtml(deck.createdAt||'—')}</small></article>`;
    }).join('');
}
function workspaceDeckEdit(change){
    const generation=workspaceGeneration;
    const saving=workspaceDeckQueue.then(async()=>{
        await profileSaveQueue;
        if(generation!==workspaceGeneration)return;
        const previous=structuredClone(favoriteDecks);change();renderFavoriteDecks();
        try{await saveDecksStorage(true);if(generation===workspaceGeneration)workspaceToast('Decks enregistrés.');}
        catch(error){if(generation===workspaceGeneration){favoriteDecks=previous;try{localStorage.setItem('tcg_favorite_decks',JSON.stringify(previous));}catch{}renderFavoriteDecks();throw error;}}
    });
    workspaceDeckQueue=saving.catch(error=>{if(generation===workspaceGeneration)workspaceToast(error.message,true);});
    return workspaceDeckQueue;
}
function deleteFavoriteDeck(id){
    const deck=favoriteDecks.find(item=>String(item.id)===String(id));if(!deck||!confirm('Supprimer le favori « '+deck.name+' » ?'))return;
    return workspaceDeckEdit(()=>{favoriteDecks=favoriteDecks.filter(item=>String(item.id)!==String(id));});
}
function workspaceOpenDeck(deck){
    if(deck.mode==='arena'){arenaOpenFavorite(String(deck.id));return;}
    const owned=new Map(distinctDeckCards(cards).map(card=>[deckIdentity(card),card]));
    const selected=(deck.cards||[]).map(card=>owned.get(deckIdentity(card)));
    if(selected.length!==3||selected.some(card=>!card)||new Set(selected.map(deckIdentity)).size!==3){workspaceToast('Certaines cartes ne sont plus disponibles. Synchronise puis recompose ce trio.',true);return;}
    const total=selected.reduce((sum,card)=>sum+deckPower(card),0),target=Number.isFinite(deck.targetPower)?deck.targetPower:total;
    setBuilderFormat('power');wn('deck-mode').value=['closest','ceiling','strongest'].includes(deck.mode)?deck.mode:'closest';builderModeChanged();
    currentGeneratedDeck={cards:selected,totalPower:total,targetPower:target,diff:Math.abs(total-target),mode:wn('deck-mode').value};wn('target-power').value=target;displayGeneratedDeck(currentGeneratedDeck);wn('deck-name-input').value=deck.name;switchTab('builder');
}
function workspaceCompareDecks(){
    const selected=[...comparedDecks].map(id=>favoriteDecks.find(deck=>String(deck.id)===id)).filter(Boolean);if(selected.length!==2)return;
    const total=(deck,field)=>(deck.cards||[]).reduce((sum,card)=>sum+(Number(card[field])||0),0);
    const common=new Set([...(selected[0].cards||[]),...(selected[0].supports||[])].map(deckIdentity));
    const shared=[...(selected[1].cards||[]),...(selected[1].supports||[])].filter(card=>common.has(deckIdentity(card))).length;
    wn('deck-compare-content').innerHTML=`<p>${shared} carte(s) en commun. Les statistiques comparent les instantanés enregistrés ; elles ne prédisent pas l'issue d'un combat.</p><div class="workspace-table-scroll"><table class="workspace-table"><thead><tr><th>Critère</th>${selected.map(deck=>`<th>${escapeHtml(deck.name)}</th>`).join('')}</tr></thead><tbody>${[['Format',deck=>deck.mode==='arena'?'Arène':'Trio'],['Puissance du trio',deck=>deck.totalPower],['Attaque enregistrée cumulée',deck=>total(deck,'attaque')],['Défense enregistrée cumulée',deck=>total(deck,'defense')],['Raretés différentes',deck=>new Set((deck.cards||[]).map(card=>card.rarete)).size],['Soutiens',deck=>(deck.supports||[]).length],['Budget tactique',deck=>deck.mode==='arena'?deck.teamCost+' / 18':'—'],['Cartes',deck=>(deck.cards||[]).map(card=>card.nom).join(', ')]].map(([label,value])=>`<tr><th>${label}</th>${selected.map(deck=>`<td>${escapeHtml(value(deck))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    wn('deck-compare-dialog').showModal();
}
async function workspaceLoadSessions(){
    const generation=workspaceGeneration,node=wn('account-sessions');node.textContent='Chargement des sessions…';
    try{const result=await apiRequest('/api/sessions');if(generation!==workspaceGeneration)return;node.innerHTML=result.sessions.map(session=>`<div class="session-row"><div><strong>${session.current?'Cette session':'Autre session'}</strong><p>${escapeHtml(session.client)}</p><small>Expiration : ${escapeHtml(new Date(session.expiresAt).toLocaleString('fr-FR'))}</small></div>${session.current?'<span class="status-pill">Actuelle</span>':`<button class="secondary-button" type="button" data-workspace-action="session-revoke" data-session-id="${escapeHtml(session.id)}">Déconnecter</button>`}</div>`).join('')||'Aucune session.';}catch(error){if(generation===workspaceGeneration)node.textContent=error.message;}
}
async function workspaceRevokeSessions(id=null){
    if(!confirm(id?'Déconnecter cette session ?':'Déconnecter toutes tes autres sessions ?'))return;
    try{const result=await apiRequest('/api/sessions/revoke',{method:'POST',body:JSON.stringify(id?{id}:{others:true})});workspaceToast(result.count+' session(s) déconnectée(s).');await workspaceLoadSessions();}catch(error){workspaceToast(error.message,true);}
}
document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-workspace-action]');if(!button)return;
    const action=button.dataset.workspaceAction;
    if(action==='card')workspaceOpenCard(button.dataset.cardKey);
    if(action==='pin'){const entry=notebookEntries[button.dataset.cardKey]||{};try{await workspaceNotebookSave(button.dataset.cardKey,!entry.favorite,entry.note||'',button);}catch{}}
    if(action==='session-revoke')await workspaceRevokeSessions(button.dataset.sessionId);
    if(!action.startsWith('deck-'))return;
    const id=button.dataset.deckId,deck=favoriteDecks.find(item=>String(item.id)===id);if(!deck)return;
    if(action==='deck-select'){if(button.checked){if(comparedDecks.size>=2){button.checked=false;workspaceToast('Choisis deux decks au maximum.',true);return;}comparedDecks.add(id);}else comparedDecks.delete(id);renderFavoriteDecks();}
    if(action==='deck-open')workspaceOpenDeck(deck);
    if(action==='deck-delete')deleteFavoriteDeck(id);
    if(action==='deck-rename'){const name=prompt('Nouveau nom du deck (120 caractères maximum)',deck.name);if(name===null)return;if(!name.trim()||name.trim().length>120){workspaceToast('Le nom doit contenir de 1 à 120 caractères.',true);return;}await workspaceDeckEdit(()=>{const current=favoriteDecks.find(item=>String(item.id)===id);if(current)current.name=name.trim();});}
    if(action==='deck-copy'){await workspaceDeckEdit(()=>{if(favoriteDecks.length>=500)throw Error('La limite de 500 favoris est atteinte.');favoriteDecks.unshift({...structuredClone(deck),id:Math.max(Date.now(),...favoriteDecks.map(item=>Number(item.id)).filter(Number.isSafeInteger))+1,name:(deck.name+' · copie').slice(0,120),createdAt:new Date().toLocaleDateString('fr-FR')});});}
    if(action==='deck-export')workspaceDownload('deck-'+String(deck.id).replace(/[^a-z0-9_-]/gi,'')+'.json',JSON.stringify({format:'minecards-deck',version:1,deck},null,2));
});
document.addEventListener('keydown',event=>{
    if(event.key==='/'&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.target.closest('input,textarea,select,[contenteditable]')&&!document.querySelector('dialog[open]')){
        const id=!wn('section-collection').classList.contains('hidden')?'search-input':!wn('section-decks').classList.contains('hidden')?'deck-search':null;
        if(id){event.preventDefault();wn(id).focus();}
    }
});
void apiRequest('/api/site').then(workspacePaintSite).catch(()=>{});
window.addEventListener('focus',()=>{if(activeProfile)void workspaceRefreshSite();});
