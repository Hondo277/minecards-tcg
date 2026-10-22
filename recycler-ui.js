'use strict';
const recyclerSelection=new Map();
let recyclerWallet=null,recyclerWalletState='loading',recyclerWalletSaving=false;
const recyclerBalanceLimit=1000000000;
function recyclerWalletReceive(wallet){
    recyclerWallet=wallet;recyclerWalletState='ready';
    wn('recycler-balance').value=wallet===null?'':String(wallet.balance);
    recyclerRenderCounters();recyclerRenderSummary();
}
function recyclerRenderCounters(){
    const info=EditionRules.summary(cards),cost=EditionRules.boosterCost,points=info.potentialPoints,boosters=Math.floor(points/cost),wallet=recyclerWallet;
    const fmt=value=>value.toLocaleString('fr-FR');
    const status=wallet?'Solde manuel · '+new Date(wallet.updatedAt).toLocaleString('fr-FR'):recyclerWalletState==='loading'?'Chargement du solde…':recyclerWalletState==='error'?'Solde indisponible · réessaie ci-dessous':'À renseigner depuis MineCards';
    const partial=info.unknownCards>0?'Potentiel partiel : '+info.unknownCards+' carte(s) sans détail des finitions. ':'';
    const html=`<div class="recycle-counter"><i class="fa-solid fa-recycle" aria-hidden="true"></i><strong>${fmt(points)}</strong><span>Points obtenables avec tes doublons</span><small>${fmt(info.recyclableCopies)} standard recyclables · original conservé</small></div><div class="recycle-counter"><i class="fa-solid fa-box-open" aria-hidden="true"></i><strong>${fmt(boosters)}</strong><span>Boosters grâce à ces doublons</span><small>50 points par booster · ${fmt(points%cost)} point(s) restant(s)</small></div><div class="recycle-counter recycle-wallet"><i class="fa-solid fa-coins" aria-hidden="true"></i><strong>${wallet?fmt(wallet.balance):'—'}</strong><span>Mes points possédés · solde renseigné</span><small>${escapeHtml(status)}</small><button type="button" class="secondary-button" onclick="recyclerEditWallet()">${wallet?'Actualiser mon solde':'Renseigner mon solde'}</button></div><p>${partial}Potentiel de toute la collection, avant les protections du plan. Holographiques exclues.${wallet?' Ton solde renseigné finance '+fmt(Math.floor(wallet.balance/cost))+' booster(s) ; avec tous les doublons : '+fmt(Math.floor((wallet.balance+points)/cost))+' booster(s).':''}</p>`;
    for(const id of ['collection-recycle-counters','profile-recycle-counters','recycler-total-counters'])wn(id).innerHTML=html;
    wn('recycler-wallet-status').textContent=status+' · L’API ne fournit pas ce solde. Il reste à actualiser après tes échanges sur MineCards.';
    for(const id of ['recycler-wallet-save','recycler-wallet-clear'])wn(id).disabled=recyclerWalletSaving;
}
function recyclerEditWallet(){switchTab('recycler');wn('recycler-balance').focus();wn('recycler-balance').scrollIntoView({behavior:'smooth',block:'center'});}
async function recyclerSaveWallet(clear=false){
    if(recyclerWalletSaving||!activeProfile)return;
    const field=wn('recycler-balance'),raw=field.value,balance=clear?null:Number(raw);
    if(!clear&&(raw===''||!Number.isSafeInteger(balance)||balance<0||balance>recyclerBalanceLimit)){recyclerMessage('Saisis un solde entier entre 0 et 1 000 000 000 points.',true);field.focus();return;}
    const generation=workspaceGeneration,profileId=activeProfile.id;
    recyclerWalletSaving=true;recyclerRenderCounters();
    try{
        const result=await apiRequest('/api/recycler/wallet',{method:'PUT',body:JSON.stringify({balance})});
        if(generation!==workspaceGeneration||activeProfile?.id!==profileId)return;
        recyclerWalletReceive(result.wallet);recyclerMessage(clear?'Solde renseigné effacé.':'Solde manuel enregistré pour ton compte. Aucun point n’a été ajouté sur MineCards.');
    }catch(error){if(generation===workspaceGeneration&&activeProfile?.id===profileId)recyclerMessage(error.message,true);}
    finally{if(generation===workspaceGeneration&&activeProfile?.id===profileId){recyclerWalletSaving=false;recyclerRenderCounters();}}
}
function recyclerMessage(text,error=false){const node=wn('recycler-message');node.textContent=text;node.classList.toggle('is-error',error);}
function recyclerReset(){
    recyclerWallet=null;recyclerWalletState='loading';recyclerWalletSaving=false;
    recyclerSelection.clear();wn('recycler-balance').value='';wn('recycler-exchange-count').value='1';wn('recycler-search').value='';wn('recycler-rarity').value='all';wn('recycler-sort').value='points-desc';wn('recycler-protect-notebook').checked=true;wn('recycler-protect-decks').checked=true;
    wn('recycler-list').textContent='';wn('recycler-message').textContent='';
    for(const id of ['collection-recycle-counters','profile-recycle-counters','recycler-total-counters'])wn(id).textContent='';
    wn('recycler-wallet-status').textContent='Chargement du solde…';
    for(const id of ['recycler-wallet-save','recycler-wallet-clear'])wn(id).disabled=false;
}
function editionBadge(card){
    const info=EditionRules.finishes(card),secret=EditionRules.secret(card);
    if(!card._minecards)return '';
    if(!info.known)return '<span class="edition-badge edition-unknown">Finitions à actualiser</span>';
    return `<span class="edition-quantities"><span>Standard ×${info.standard}</span><span class="${info.holographic?'holo-label':''}">Holo ×${info.holographic}</span>${secret?'<span class="mythic-label">Secrète · Mythique</span>':''}</span>`;
}
function updateEditionStats(){
    const info=EditionRules.summary(cards),partial=info.unknownCards>0;
    const tiles=[['fa-wand-magic-sparkles',info.holographicCopies,'Exemplaires holographiques'],['fa-copy',info.recyclableCopies,'Doublons standard recyclables'],['fa-recycle',info.potentialPoints,'Points de recyclage potentiels'],['fa-gem',info.mythicCards,'Cartes Mythiques']];
    const html=tiles.map(([icon,value,label])=>`<div><i class="fa-solid ${icon}" aria-hidden="true"></i><strong>${value.toLocaleString('fr-FR')}${partial?' <small>connus</small>':''}</strong><span>${label}</span></div>`).join('')+(partial?`<p>${info.unknownCards} carte(s) importée(s) sans détail des finitions : synchronise la collection. Les potentiels ne représentent pas ton solde de points.</p>`:'<p>Finitions visuelles · holographiques protégées · les points affichés sont un potentiel, pas ton solde.</p>');
    for(const id of ['collection-edition-stats','profile-edition-stats'])wn(id).innerHTML=html;
    recyclerRenderCounters();
    recyclerRender();
}
function recyclerRows(){
    const protectedByDeck=new Set(favoriteDecks.flatMap(deck=>[...(deck.cards||[]),...(deck.supports||[])]).map(deckRemoteId).filter(Boolean));
    return EditionRules.inventory(cards).map(card=>{
        const info=EditionRules.finishes(card),rate=EditionRules.points(card),reasons=[];
        if(wn('recycler-protect-notebook').checked&&notebookEntries[workspaceCardKey(card)]?.favorite)reasons.push('Carte favorite');
        if(wn('recycler-protect-decks').checked&&protectedByDeck.has(card._minecards.cardId))reasons.push('Dans un deck favori');
        return {id:card._minecards.cardId,card,...info,rate,protected:reasons.length>0,reasons,max:rate===null?0:info.recyclable};
    }).filter(row=>row.known&&row.rate!==null&&row.max>0);
}
function recyclerFilteredRows(){
    const query=workspaceNormalize(wn('recycler-search').value),rarity=wn('recycler-rarity').value,sort=wn('recycler-sort').value;
    return recyclerRows().filter(row=>workspaceNormalize(row.card.nom+' '+row.id).includes(query)&&(rarity==='all'||EditionRules.rarity(row.card)===rarity)).sort((a,b)=>sort==='name'?a.card.nom.localeCompare(b.card.nom,'fr'):sort==='quantity'?b.max-a.max:sort==='rarity-asc'?a.rate-b.rate||a.card.nom.localeCompare(b.card.nom,'fr'):b.rate*b.max-a.rate*a.max||a.card.nom.localeCompare(b.card.nom,'fr'));
}
function recyclerRender(){
    if(!wn('recycler-list'))return;
    const candidates=new Map(recyclerRows().map(row=>[row.id,row]));let adjusted=false;
    for(const [id,quantity]of recyclerSelection){
        const row=candidates.get(id),allowed=row&&!row.protected?Math.min(quantity,row.max):0;
        if(allowed!==quantity)adjusted=true;if(allowed>0)recyclerSelection.set(id,allowed);else recyclerSelection.delete(id);
    }
    if(adjusted)recyclerMessage('Le plan a été ajusté selon le stock actuel et les protections choisies.');
    const info=EditionRules.summary(cards),rows=recyclerFilteredRows(),available=[...candidates.values()].filter(row=>!row.protected);
    wn('recycler-inventory-note').textContent=(mcLastSync?'Dernière copie : '+new Date(mcLastSync).toLocaleString('fr-FR')+'. ':'')+info.holographicCopies+' holographique(s) protégée(s). '+(info.unknownCards?info.unknownCards+' carte(s) avec finitions inconnues : une synchronisation est nécessaire.':'Les originaux standard et toutes les holographiques sont conservés.');
    wn('recycler-filter-count').textContent=rows.length+' carte(s) filtrée(s) · '+available.reduce((sum,row)=>sum+row.max,0)+' exemplaire(s) disponibles avec tes protections';
    wn('recycler-list').innerHTML=rows.map(row=>{
        const selected=recyclerSelection.get(row.id)||0;
        return `<article class="recycler-row ${row.protected?'recycler-protected':''}"><div class="recycler-card-art">${profileCardArt(row.card)}</div><div class="recycler-card-name"><strong>${escapeHtml(row.card.nom)}</strong><small>${escapeHtml(row.card.rarete)} · ${row.rate} point(s) par carte</small><span>Standard ×${row.standard} · Holo ×${row.holographic} · ${row.max} recyclable(s)</span>${row.protected?`<em><i class="fa-solid fa-lock" aria-hidden="true"></i> ${row.reasons.join(' · ')}</em>`:''}</div><label class="workspace-check"><input id="recycler-check-${escapeHtml(row.id)}" type="checkbox" data-id="${escapeHtml(row.id)}" onchange="recyclerSetQuantity(this.dataset.id,this.checked?1:0)" ${selected?'checked':''} ${row.protected?'disabled':''}> Préparer</label><label class="recycler-quantity-label">Exemplaires<input id="recycler-qty-${escapeHtml(row.id)}" type="number" min="0" max="${row.max}" step="1" value="${selected}" data-id="${escapeHtml(row.id)}" oninput="recyclerSetQuantity(this.dataset.id,this.value,this)" ${row.protected?'disabled':''}></label><strong id="recycler-points-${escapeHtml(row.id)}" class="recycler-row-points">${selected*row.rate} pts</strong></article>`;
    }).join('')||'<div class="admin-no-records">Aucun doublon standard recyclable pour ces filtres. Synchronise ta collection pour actualiser les finitions.</div>';
    recyclerRenderSummary();
}
function recyclerSetQuantity(id,value,input=null){
    const row=recyclerRows().find(item=>item.id===id),number=Number(value);
    let quantity=row&&!row.protected&&Number.isSafeInteger(number)?Math.max(0,Math.min(row.max,number)):0;
    if(quantity>0&&!recyclerSelection.has(id)&&recyclerSelection.size>=100){quantity=0;recyclerMessage('Un plan contient au maximum 100 cartes différentes.',true);}
    if(quantity)recyclerSelection.set(id,quantity);else recyclerSelection.delete(id);
    const field=input||wn('recycler-qty-'+id),check=wn('recycler-check-'+id),total=wn('recycler-points-'+id);
    if(field&&field.value!==''&&Number(field.value)!==quantity)field.value=String(quantity);
    if(field&&!input)field.value=String(quantity);
    if(check)check.checked=quantity>0;if(total)total.textContent=(quantity*(row?.rate||0))+' pts';recyclerRenderSummary();
}
function recyclerPlan(){return recyclerRows().filter(row=>!row.protected&&recyclerSelection.has(row.id)).map(row=>({...row,quantity:Math.min(row.max,recyclerSelection.get(row.id)),points:Math.min(row.max,recyclerSelection.get(row.id))*row.rate}));}
function recyclerRenderSummary(){
    const plan=recyclerPlan(),quantity=plan.reduce((sum,row)=>sum+row.quantity,0),points=plan.reduce((sum,row)=>sum+row.points,0);
    const raw=wn('recycler-balance').value,balance=raw===''?null:Number(raw),validBalance=balance!==null&&Number.isSafeInteger(balance)&&balance>=0&&balance<=recyclerBalanceLimit;
    const total=points+(validBalance?balance:0),boosters=Math.floor(total/EditionRules.boosterCost),count=Number(wn('recycler-exchange-count').value),validCount=Number.isSafeInteger(count)&&count>=0;
    wn('recycler-plan-count').textContent=quantity.toLocaleString('fr-FR');wn('recycler-plan-points').textContent=points.toLocaleString('fr-FR');wn('recycler-plan-boosters').textContent=boosters.toLocaleString('fr-FR');
    wn('recycler-projection-note').textContent=(validBalance?'Projection avec le solde saisi manuellement ('+balance+' pts).':'Solde MineCards non fourni par l’API : projection depuis la sélection uniquement.')+' '+(validCount&&count<=boosters?'Après '+count+' booster(s) à 50 points : '+(total-count*50)+' points projetés.':validCount?'Il manque '+Math.max(0,count*50-total)+' points pour '+count+' booster(s).':'Saisis un nombre entier de boosters.');
    for(const id of ['recycler-export','recycler-copy'])wn(id).disabled=plan.length===0;
}
function recyclerPrepare(mode){
    const filtered=recyclerFilteredRows().filter(row=>!row.protected);
    if(mode==='clear'){recyclerSelection.clear();recyclerRender();return;}
    for(const row of filtered){if(!recyclerSelection.has(row.id)&&recyclerSelection.size>=100)break;recyclerSelection.set(row.id,mode==='max'?row.max:Math.max(1,recyclerSelection.get(row.id)||0));}
    recyclerRender();recyclerMessage('Plan préparé : aucune carte n’a été recyclée. Vérifie-le puis effectue l’opération sur MineCards.');
}
function recyclerPrepareBooster(){
    const raw=wn('recycler-balance').value,balance=Number(raw),known=raw!==''&&Number.isSafeInteger(balance)&&balance>=0&&balance<=recyclerBalanceLimit;
    const current=recyclerPlan().reduce((sum,row)=>sum+row.points,0)+(known?balance:0);
    let needed=50-current%50;
    const available=recyclerFilteredRows().filter(row=>!row.protected).sort((a,b)=>a.rate-b.rate||a.card.nom.localeCompare(b.card.nom,'fr'));
    for(const row of available){
        const existing=recyclerSelection.get(row.id)||0;if(!existing&&recyclerSelection.size>=100)continue;
        const added=Math.min(row.max-existing,Math.ceil(needed/row.rate));if(added<=0)continue;
        recyclerSelection.set(row.id,existing+added);needed-=added*row.rate;if(needed<=0)break;
    }
    recyclerRender();recyclerMessage(needed>0?'Le stock filtré ne suffit pas à atteindre le prochain seuil de 50 points.':'Prochain seuil de 50 points préparé, en utilisant les raretés basses en premier.',needed>0);
}
function recyclerExportPlan(){
    const plan=recyclerPlan();if(!plan.length)return;
    workspaceDownload('plan-recyclage-'+activeProfile.username+'.csv',workspaceCsv([['Carte','Identifiant MineCards','Rareté','Standard disponibles','Holographiques protégées','Quantité préparée','Points par exemplaire','Points projetés'],...plan.map(row=>[row.card.nom,row.id,row.card.rarete,row.standard,row.holographic,row.quantity,row.rate,row.points])]),'text/csv;charset=utf-8');
}
async function recyclerCopyPlan(){
    const plan=recyclerPlan();if(!plan.length)return;
    const text='Plan de recyclage MineCards — simulation, à vérifier sur le site officiel\n'+plan.map(row=>row.card.nom+' : '+row.quantity+' standard → '+row.points+' points').join('\n')+'\nTotal : '+plan.reduce((sum,row)=>sum+row.points,0)+' points projetés. Un original standard par carte et toutes les holographiques sont conservés.';
    try{await navigator.clipboard.writeText(text);recyclerMessage('Plan copié. Le recyclage reste à effectuer sur MineCards.');}catch{recyclerMessage('La copie est indisponible dans ce navigateur. Utilise l’export CSV.',true);}
}
