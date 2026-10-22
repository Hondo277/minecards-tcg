'use strict';
let adminPanelVersion=0,adminDetailVersion=0,adminSelectedData=null,adminOverview=null,adminAuditEntries=[],adminCardPage=1;
const adminSelectedCards=new Set(),adminSelectedDecks=new Set();
const adminActions={'site.settings':'Réglages du site','user.suspend':'Suspension','user.reactivate':'Réactivation','user.sessions.revoke':'Sessions déconnectées','user.delete':'Compte supprimé','record.delete':'Élément supprimé','records.delete':'Suppression groupée'};
const adminDate=value=>value?new Date(value).toLocaleString('fr-FR'):'Jamais / inconnu';
function adminReset(){
    adminPanelVersion++;adminDetailVersion++;adminSelectedData=null;adminOverview=null;adminAuditEntries=[];adminUsers=[];selectedAdminUserId=null;adminSelectedCards.clear();adminSelectedDecks.clear();
    wn('admin-user-detail').innerHTML='<p class="admin-no-records">Sélectionne un profil.</p>';
    for(const id of ['admin-users-list','admin-stats','admin-audit-list','admin-runtime-summary','admin-feedback','admin-user-count','admin-audit-count'])wn(id).textContent='';
    wn('admin-search').value='';wn('admin-audit-search').value='';wn('admin-site-settings').reset();
    for(const id of ['admin-role-filter','admin-state-filter','admin-audit-action'])wn(id).value='all';wn('admin-user-sort').value='name';
}
function adminFeedback(message,error=false){const node=wn('admin-feedback');node.textContent=message;node.classList.toggle('is-error',error);}
async function renderAdminPanel(){
    if(activeProfile?.role!=='admin')return;
    const version=++adminPanelVersion;
    try{
        const result=await apiRequest('/api/admin/overview');if(version!==adminPanelVersion||activeProfile?.role!=='admin')return;
        adminOverview=result;adminUsers=result.users;
        const stats=result.stats;
        wn('admin-stats').innerHTML=[['fa-users','Profils',stats.profiles],['fa-layer-group','Cartes uniques cumulées',stats.uniqueCards],['fa-clone','Exemplaires',stats.copies],['fa-copy','Doublons hors originaux',stats.duplicates],['fa-star','Decks favoris',stats.decks],['fa-link','Comptes reliés à MineCards',stats.connected],['fa-desktop','Sessions actives',stats.sessions],['fa-user-lock','Comptes suspendus',stats.suspended],['fa-wand-magic-sparkles','Holographiques connues',result.editions.holographicCopies||0],['fa-recycle','Standard recyclables connus',result.editions.recyclableCopies||0],['fa-coins','Points potentiels connus',result.editions.potentialPoints||0],['fa-gem','Mythiques découvertes',result.editions.mythicCards||0]].map(([icon,label,value])=>`<div class="admin-stat-tile glass-panel"><i class="fa-solid ${icon}" aria-hidden="true"></i><strong>${Number(value).toLocaleString('fr-FR')}</strong><span>${label}</span></div>`).join('');
        wn('admin-runtime-summary').textContent=result.storage+' · '+stats.administrators+' administrateur(s) · '+stats.syncing+' synchronisation(s) en cours · actualisé le '+adminDate(result.generatedAt);
        const form=wn('admin-site-settings');form.elements.message.value=result.settings.message;form.elements.tone.value=result.settings.tone;form.elements.registrationsOpen.checked=result.settings.registrationsOpen;
        renderAdminUsers();
        const selected=adminUsers.find(user=>user.id===selectedAdminUserId)||adminUsers[0];
        if(selected)await openAdminUser(selected.id);else wn('admin-user-detail').textContent='Aucun compte.';
        if(version===adminPanelVersion)await adminLoadAudit();
    }catch(error){if(version===adminPanelVersion)adminFeedback(error.message,true);}
}
function renderAdminUsers(){
    const query=workspaceNormalize(wn('admin-search').value),role=wn('admin-role-filter').value,state=wn('admin-state-filter').value,sort=wn('admin-user-sort').value;
    const list=adminUsers.filter(user=>workspaceNormalize(user.username+' '+user.displayName).includes(query)&&(role==='all'||user.role===role)&&(state==='all'||(state==='suspended'?user.suspended:state==='active'?!user.suspended:user.connected))).sort((a,b)=>sort==='cards'?b.cardCount-a.cardCount:sort==='duplicates'?b.duplicateCount-a.duplicateCount:sort==='recent'?String(b.createdAt).localeCompare(String(a.createdAt)):a.username.localeCompare(b.username,'fr'));
    wn('admin-user-count').textContent=list.length+' / '+adminUsers.length+' profil(s)';
    wn('admin-users-list').innerHTML=list.length?list.map(user=>`<button class="admin-user-row ${selectedAdminUserId===user.id?'selected':''}" type="button" data-admin-action="select-user" data-user-id="${escapeHtml(user.id)}"><span><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.username)} · ${user.role==='admin'?'Admin':user.suspended?'Suspendu':'Membre'}</small><small>${user.copyCount} exemplaires · ${user.duplicateCount} doublons</small></span><span class="admin-user-count">${user.cardCount} cartes</span></button>`).join(''):'<p class="admin-no-records">Aucun profil pour ces filtres.</p>';
}
async function openAdminUser(userId){
    const version=++adminDetailVersion;selectedAdminUserId=userId;adminSelectedCards.clear();adminSelectedDecks.clear();adminCardPage=1;renderAdminUsers();
    wn('admin-user-detail').innerHTML='<p class="admin-no-records">Chargement du profil…</p>';
    try{
        const result=await apiRequest('/api/admin/users/'+encodeURIComponent(userId));if(version!==adminDetailVersion||activeProfile?.role!=='admin')return;
        adminSelectedData=result;const user=result.user,canManage=user.id!==activeProfile.id&&user.role!=='admin';
        const canDeleteRecords=user.id!==activeProfile.id;
        wn('admin-user-detail').innerHTML=`<div class="admin-detail-header"><div><span class="eyebrow">FICHE DU COMPTE</span><h3>${escapeHtml(user.profile?.displayName||user.username)}</h3><p>${escapeHtml(user.username)} · créé le ${escapeHtml(adminDate(user.createdAt))}</p></div><span class="status-pill ${user.suspended?'is-error':''}">${user.role==='admin'?'Administrateur':user.suspended?'Suspendu':'Actif'}</span></div><div class="admin-detail-metrics">${[['Cartes uniques',user.cardCount],['Exemplaires',user.copyCount],['Doublons',user.duplicateCount],['Favoris',user.favoriteDeckCount],['Holographiques connues',user.editions.holographicCopies],['Standard recyclables',user.editions.recyclableCopies]].map(([label,value])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><dl class="admin-account-meta"><div><dt>Dernière connexion</dt><dd>${escapeHtml(adminDate(user.lastLoginAt))}</dd></div><div><dt>Sessions actives</dt><dd>${user.sessionCount}</dd></div><div><dt>MineCards</dt><dd>${user.connected?'Clé reliée':'Non connecté'}</dd></div><div><dt>Dernière copie API</dt><dd>${escapeHtml(adminDate(user.lastSync))}</dd></div></dl>${user.syncJob?.error?`<p class="admin-inline-warning">Synchronisation : ${escapeHtml(user.syncJob.error)}</p>`:''}${user.suspended?`<p class="admin-inline-warning">Motif : ${escapeHtml(user.suspensionReason||'Non précisé')}</p>`:''}${canManage?`<div class="workspace-actions admin-account-actions"><button class="secondary-button" type="button" data-admin-action="access">${user.suspended?'Réactiver le compte':'Suspendre le compte'}</button><button class="secondary-button" type="button" data-admin-action="revoke">Déconnecter ses sessions</button><button class="admin-delete-button" type="button" data-admin-action="delete-user">Supprimer le compte</button></div>`:'<p class="admin-search-count">Les actions sur l’accès sont réservées aux comptes membres des autres utilisateurs.</p>'}<section class="admin-data-section"><div class="admin-section-heading"><h4>Collection</h4><button class="secondary-button" type="button" data-admin-action="export-cards">Exporter le CSV filtré</button></div><div class="admin-record-filters"><label>Recherche<input id="admin-card-search" type="search" placeholder="Nom, rareté, puissance…" oninput="adminCardPage=1;adminRenderCards()"></label><label>Origine<select id="admin-card-source" onchange="adminCardPage=1;adminRenderCards()"><option value="all">Toutes</option><option value="minecards">MineCards</option><option value="local">Locales</option></select></label><label>Finition<select id="admin-card-finish" onchange="adminCardPage=1;adminRenderCards()"><option value="all">Toutes</option><option value="holo">Avec holographiques</option><option value="standard">Avec standards</option><option value="recyclable">Recyclables</option><option value="unknown">À actualiser</option></select></label><label>Classement<select id="admin-card-sort" onchange="adminCardPage=1;adminRenderCards()"><option value="name">Nom A → Z</option><option value="power">Puissance décroissante</option><option value="duplicates">Doublons décroissants</option></select></label><label class="workspace-check"><input id="admin-only-duplicates" type="checkbox" onchange="adminCardPage=1;adminRenderCards()"> Doublons uniquement</label></div><div class="admin-bulk-bar">${canManage?'<button class="secondary-button" type="button" data-admin-action="select-cards">Sélectionner les locales visibles</button><button class="admin-delete-button" type="button" data-admin-action="bulk-cards">Supprimer la sélection</button>':''}<span id="admin-card-search-count" role="status"></span></div><div id="admin-card-list" class="admin-record-list admin-paged-list"></div><div class="admin-pagination"><button class="secondary-button" type="button" data-admin-action="prev-page">Précédent</button><span id="admin-card-page"></span><button class="secondary-button" type="button" data-admin-action="next-page">Suivant</button></div></section><section class="admin-data-section"><h4>Decks favoris</h4><label class="admin-collection-search">Recherche de deck<input id="admin-deck-search" type="search" placeholder="Nom du deck ou d’une carte…" oninput="adminRenderDecks()"></label>${canManage?'<div class="admin-bulk-bar"><button class="secondary-button" type="button" data-admin-action="select-decks">Sélectionner les decks visibles</button><button class="admin-delete-button" type="button" data-admin-action="bulk-decks">Supprimer la sélection</button><span id="admin-deck-selected"></span></div>':''}<div id="admin-deck-list" class="admin-record-list"></div></section>`;
        wn('admin-user-detail').dataset.canManage=String(canManage);wn('admin-user-detail').dataset.canDeleteRecords=String(canDeleteRecords);adminRenderCards();adminRenderDecks();
    }catch(error){if(version===adminDetailVersion)wn('admin-user-detail').innerHTML='<p class="admin-no-records">'+escapeHtml(error.message)+'</p>';}
}
function adminFilteredCards(){
    if(!adminSelectedData||!wn('admin-card-search'))return [];
    const all=adminSelectedData.data.cards||[],counts=collectionCopyStats(all),quantities=new Map(counts.entries.map(entry=>[deckIdentity(entry.card),entry.quantity]));
    const query=workspaceNormalize(wn('admin-card-search').value),source=wn('admin-card-source').value,duplicates=wn('admin-only-duplicates').checked,sort=wn('admin-card-sort').value,finish=wn('admin-card-finish').value;
    return all.filter(card=>{const info=EditionRules.finishes(card);return finish==='all'||finish==='holo'&&info.holographic>0||finish==='standard'&&info.standard>0||finish==='recyclable'&&info.recyclable>0&&EditionRules.points(card)!==null||finish==='unknown'&&!!card._minecards&&!info.known;}).filter(card=>workspaceNormalize(card.nom+' '+card.rarete+' '+card.valeur).includes(query)&&(source==='all'||(source==='minecards')===!!card._minecards)&&(!duplicates||(quantities.get(deckIdentity(card))||1)>1)).map(card=>({card,quantity:quantities.get(deckIdentity(card))||1})).sort((a,b)=>sort==='power'?Number(b.card.valeur)-Number(a.card.valeur):sort==='duplicates'?b.quantity-a.quantity||a.card.nom.localeCompare(b.card.nom,'fr'):a.card.nom.localeCompare(b.card.nom,'fr'));
}
function adminRenderCards(){
    const filtered=adminFilteredCards(),pages=Math.max(1,Math.ceil(filtered.length/40));adminCardPage=Math.max(1,Math.min(adminCardPage,pages));
    const canManage=wn('admin-user-detail').dataset.canManage==='true',canDelete=wn('admin-user-detail').dataset.canDeleteRecords==='true';
    wn('admin-card-list').innerHTML=filtered.slice((adminCardPage-1)*40,adminCardPage*40).map(({card,quantity})=>{
        const local=Number(card.id)>=0;
        return `<div class="admin-record">${canManage&&local?`<input type="checkbox" aria-label="Sélectionner ${escapeHtml(card.nom)}" data-admin-action="check-card" data-record-id="${escapeHtml(card.id)}" ${adminSelectedCards.has(String(card.id))?'checked':''}>`:''}<span class="admin-record-main"><strong>${escapeHtml(card.nom)}</strong><small>${escapeHtml(card.rarete)} · ×${quantity} · ${Math.max(0,quantity-1)} doublon(s)</small><small>${EditionRules.finishes(card).known?'Standard ×'+EditionRules.finishes(card).standard+' · Holo ×'+EditionRules.finishes(card).holographic+' · '+EditionRules.finishes(card).recyclable+' recyclable(s)':card._minecards?'Finitions à actualiser':'Carte locale'}</small></span><div class="admin-record-actions"><span>${escapeHtml(card.valeur)} pts</span>${local&&canDelete?`<button type="button" class="admin-delete-button" data-admin-action="delete-card" data-record-id="${escapeHtml(card.id)}" aria-label="Supprimer ${escapeHtml(card.nom)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`:'<small>'+(local?'Locale':'MineCards')+'</small>'}</div></div>`;
    }).join('')||'<p class="admin-no-records">Aucune carte pour ces filtres.</p>';
    wn('admin-card-page').textContent='Page '+adminCardPage+' / '+pages;wn('admin-card-search-count').textContent=filtered.length+' carte(s) filtrée(s) · '+adminSelectedCards.size+' sélectionnée(s)';
    wn('admin-user-detail').querySelector('[data-admin-action="prev-page"]').disabled=adminCardPage<=1;wn('admin-user-detail').querySelector('[data-admin-action="next-page"]').disabled=adminCardPage>=pages;
}
function adminFilteredDecks(){const query=workspaceNormalize(wn('admin-deck-search')?.value);return (adminSelectedData?.data.favoriteDecks||[]).filter(deck=>workspaceNormalize([deck.name,...(deck.cards||[]).map(card=>card.nom)].join(' ')).includes(query));}
function adminRenderDecks(){
    const canManage=wn('admin-user-detail').dataset.canManage==='true',canDelete=wn('admin-user-detail').dataset.canDeleteRecords==='true';
    wn('admin-deck-list').innerHTML=adminFilteredDecks().map(deck=>`<div class="admin-record">${canManage?`<input type="checkbox" aria-label="Sélectionner ${escapeHtml(deck.name)}" data-admin-action="check-deck" data-record-id="${escapeHtml(deck.id)}" ${adminSelectedDecks.has(String(deck.id))?'checked':''}>`:''}<span class="admin-record-main"><strong>${escapeHtml(deck.name)}</strong><small>${deck.mode==='arena'?'Arène':'Trio'} · ${(deck.cards||[]).map(card=>escapeHtml(card.nom)).join(' · ')}</small></span><div class="admin-record-actions"><span>${escapeHtml(deck.totalPower)} pts</span>${canDelete?`<button class="admin-delete-button" type="button" data-admin-action="delete-deck" data-record-id="${escapeHtml(deck.id)}" aria-label="Supprimer ${escapeHtml(deck.name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`:''}</div></div>`).join('')||'<p class="admin-no-records">Aucun deck pour cette recherche.</p>';
    if(wn('admin-deck-selected'))wn('admin-deck-selected').textContent=adminSelectedDecks.size+' sélectionné(s)';
}
async function adminMutate(path,method,body,button){
    if(button)button.disabled=true;const version=workspaceGeneration;
    try{const result=await apiRequest(path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})});if(version!==workspaceGeneration)return;adminFeedback('Action enregistrée'+(result.count!==undefined?' · '+result.count+' élément(s) concernés.':'.'));await renderAdminPanel();}
    catch(error){if(version===workspaceGeneration)adminFeedback(error.message,true);}
    finally{if(button?.isConnected)button.disabled=false;}
}
async function adminDeleteAccount(userId,username,button){if(confirm('Supprimer définitivement le compte « '+username+' », sa collection et ses favoris ?'))await adminMutate('/api/admin/users/'+encodeURIComponent(userId),'DELETE',undefined,button);}
async function adminDeleteRecord(userId,kind,id,button){if(confirm('Supprimer définitivement cet élément du compte sélectionné ?'))await adminMutate('/api/admin/users/'+encodeURIComponent(userId)+'/'+kind+'/'+encodeURIComponent(id),'DELETE',undefined,button);}
function adminExportUsers(){
    if(!adminUsers.length)return;
    const keys=['username','displayName','role','suspended','cardCount','copyCount','duplicateCount','favoriteDeckCount','sessionCount','connected','lastSync','lastLoginAt','createdAt'];
    workspaceDownload('administration-profils.csv',workspaceCsv([keys,...adminUsers.map(user=>keys.map(key=>user[key]))]),'text/csv;charset=utf-8');
}
async function adminLoadAudit(){
    const version=adminPanelVersion;
    try{const result=await apiRequest('/api/admin/audit');if(version!==adminPanelVersion||activeProfile?.role!=='admin')return;adminAuditEntries=result.entries;adminRenderAudit();}catch(error){if(version===adminPanelVersion)wn('admin-audit-list').textContent=error.message;}
}
function adminFilteredAudit(){const query=workspaceNormalize(wn('admin-audit-search').value),action=wn('admin-audit-action').value;return adminAuditEntries.filter(entry=>(action==='all'||entry.action===action)&&workspaceNormalize([entry.actor.username,entry.target?.username,entry.details,adminActions[entry.action]].join(' ')).includes(query));}
function adminRenderAudit(){
    const list=adminFilteredAudit();wn('admin-audit-count').textContent=list.length+' / '+adminAuditEntries.length+' action(s) · 400 dernières conservées';
    wn('admin-audit-list').innerHTML=list.slice(0,100).map(entry=>`<div class="audit-entry"><time>${escapeHtml(adminDate(entry.createdAt))}</time><div><strong>${escapeHtml(adminActions[entry.action]||entry.action)}</strong><p>${escapeHtml(entry.actor.username)}${entry.target?' → '+escapeHtml(entry.target.username):''}</p><small>${escapeHtml(entry.details)}</small></div></div>`).join('')||'<p class="admin-no-records">Aucune action enregistrée pour ces filtres.</p>';
}
function adminExportAudit(){const list=adminFilteredAudit();workspaceDownload('journal-administration.csv',workspaceCsv([['Date','Action','Administrateur','Compte concerné','Détails'],...list.map(entry=>[entry.createdAt,adminActions[entry.action]||entry.action,entry.actor.username,entry.target?.username||'',entry.details])]),'text/csv;charset=utf-8');}
async function adminSaveSettings(event){
    event.preventDefault();const form=event.currentTarget,message=form.elements.message.value.trim(),tone=form.elements.tone.value,registrationsOpen=form.elements.registrationsOpen.checked;
    if(!registrationsOpen&&adminOverview?.settings.registrationsOpen&&!confirm('Fermer les nouvelles inscriptions ? Les comptes existants pourront toujours se connecter.'))return;
    const button=event.submitter;button.disabled=true;
    try{await apiRequest('/api/admin/settings',{method:'PATCH',body:JSON.stringify({message,tone,registrationsOpen})});workspacePaintSite({message,tone,registrationsOpen});adminFeedback('Annonce et réglages enregistrés.');await renderAdminPanel();}catch(error){adminFeedback(error.message,true);}finally{button.disabled=false;}
}
document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-admin-action]');if(!button||activeProfile?.role!=='admin')return;
    const action=button.dataset.adminAction;
    if(action==='select-user'){await openAdminUser(button.dataset.userId);return;}
    const result=adminSelectedData;if(!result)return;const user=result.user,path='/api/admin/users/'+encodeURIComponent(user.id);
    if(action==='prev-page'||action==='next-page'){adminCardPage+=action==='next-page'?1:-1;adminRenderCards();}
    if(action==='check-card'||action==='check-deck'){
        const selected=action==='check-card'?adminSelectedCards:adminSelectedDecks,id=button.dataset.recordId;
        if(button.checked){if(selected.size>=100){button.checked=false;adminFeedback('100 éléments maximum par suppression groupée.',true);return;}selected.add(id);}else selected.delete(id);
        if(action==='check-card')adminRenderCards();else adminRenderDecks();
    }
    if(action==='select-cards'){
        const visible=adminFilteredCards().slice((adminCardPage-1)*40,adminCardPage*40).filter(({card})=>Number(card.id)>=0).map(({card})=>String(card.id));
        const clear=visible.length&&visible.every(id=>adminSelectedCards.has(id));for(const id of visible){if(clear)adminSelectedCards.delete(id);else if(adminSelectedCards.size<100)adminSelectedCards.add(id);}adminRenderCards();
    }
    if(action==='select-decks'){const visible=adminFilteredDecks().map(deck=>String(deck.id)),clear=visible.length&&visible.every(id=>adminSelectedDecks.has(id));for(const id of visible){if(clear)adminSelectedDecks.delete(id);else if(adminSelectedDecks.size<100)adminSelectedDecks.add(id);}adminRenderDecks();}
    if(action==='bulk-cards'||action==='bulk-decks'){
        const selected=action==='bulk-cards'?adminSelectedCards:adminSelectedDecks;
        if(!selected.size){adminFeedback('Sélectionne au moins un élément.',true);return;}
        if(confirm('Supprimer définitivement '+selected.size+' élément(s) du compte « '+user.username+' » ?'))await adminMutate(path+'/bulk-delete','POST',{kind:action==='bulk-cards'?'cards':'decks',ids:[...selected]},button);
    }
    if(action==='access'){
        let reason='';if(!user.suspended){reason=prompt('Motif de suspension (240 caractères maximum, optionnel)','');if(reason===null)return;if(reason.length>240){adminFeedback('Le motif doit faire 240 caractères maximum.',true);return;}}
        if(confirm((user.suspended?'Réactiver':'Suspendre')+' le compte « '+user.username+' » ?'))await adminMutate(path+'/access','PATCH',{suspended:!user.suspended,reason},button);
    }
    if(action==='revoke'&&confirm('Déconnecter toutes les sessions de « '+user.username+' » ?'))await adminMutate(path+'/sessions/revoke','POST',{},button);
    if(action==='delete-user')await adminDeleteAccount(user.id,user.username,button);
    if(action==='delete-card'||action==='delete-deck')await adminDeleteRecord(user.id,action==='delete-card'?'cards':'decks',button.dataset.recordId,button);
    if(action==='export-cards'){
        const list=[...new Map(adminFilteredCards().map(entry=>[deckIdentity(entry.card),entry])).values()];workspaceDownload('collection-'+user.username+'.csv',workspaceCsv([['Nom','Rareté','Puissance','Exemplaires','Doublons','Origine','Standard','Holographiques','Standard recyclables'],...list.map(({card,quantity})=>[card.nom,card.rarete,card.valeur,quantity,Math.max(0,quantity-1),card._minecards?'MineCards':'Locale',EditionRules.finishes(card).standard,EditionRules.finishes(card).holographic,EditionRules.finishes(card).known?EditionRules.finishes(card).recyclable:null])]),'text/csv;charset=utf-8');
    }
});
