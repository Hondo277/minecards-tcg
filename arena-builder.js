'use strict';

let arenaTeam={cards:[],supports:[]},arenaOpponents=[],arenaFetchedAt=null,arenaEpoch=0,arenaLoading=false,arenaSaving=false;
const arenaNode=id=>document.getElementById(id);
const arenaCardName=card=>card.nom||card.name||ArenaRules.id(card);
const arenaTotal=team=>[...team.cards,...team.supports].reduce((sum,card)=>sum+(ArenaRules.cost(card)||0),0);
function arenaMessage(message,success=false){const node=arenaNode('arena-planner-message');node.textContent=message;node.classList.toggle('success',success);}
function arenaOwnedCards(){return distinctDeckCards(cards).filter(card=>card._minecards&&ArenaRules.eligible(card));}
function setBuilderFormat(format){
    const tactical=format==='arena';
    arenaNode('power-builder').classList.toggle('hidden',tactical);
    arenaNode('arena-builder').classList.toggle('hidden',!tactical);
    arenaNode('builder-format-power').setAttribute('aria-pressed',String(!tactical));
    arenaNode('builder-format-arena').setAttribute('aria-pressed',String(tactical));
    if(tactical){arenaRender();if(!arenaFetchedAt&&!arenaLoading)void arenaLoadOpponents();}
}
function arenaReset(){
    arenaEpoch++;arenaTeam={cards:[],supports:[]};arenaOpponents=[];arenaFetchedAt=null;arenaLoading=false;arenaSaving=false;
    arenaNode('arena-deck-name').value='';arenaNode('arena-target').value='overworld';arenaNode('arena-stance').value='balanced';
    arenaNode('arena-card-search').value='';arenaNode('arena-strategy').value='balanced';arenaNode('arena-support-limit').value='2';
    arenaNode('arena-load-opponents').disabled=false;arenaNode('arena-suggest').disabled=false;arenaNode('arena-save').disabled=true;
    arenaNode('arena-opponent-status').textContent='';arenaNode('arena-opponent-content').textContent='';arenaMessage('');
    for(const id of ['arena-fighter-slots','arena-support-slots','arena-card-pool','arena-team-advice','arena-card-count'])arenaNode(id).textContent='';
    arenaNode('arena-team-cost').textContent='0 / 18';arenaNode('arena-budget-progress').value=0;
    setBuilderFormat('power');
}
function arenaRefreshCollection(){
    const available=new Map(arenaOwnedCards().map(card=>[ArenaRules.id(card),card]));
    const before=JSON.stringify([...arenaTeam.cards,...arenaTeam.supports].map(card=>card._minecards));
    arenaTeam.cards=arenaTeam.cards.map(card=>available.get(ArenaRules.id(card))).filter(card=>card&&ArenaRules.creature(card));
    arenaTeam.supports=arenaTeam.supports.map(card=>available.get(ArenaRules.id(card))).filter(card=>card&&!ArenaRules.creature(card));
    if(arenaTotal(arenaTeam)>18){arenaTeam={cards:[],supports:[]};arenaMessage('Les raretés ont changé : recompose une équipe dans les 18 points.');}
    else if(before!==JSON.stringify([...arenaTeam.cards,...arenaTeam.supports].map(card=>card._minecards))&&before!=='[]')arenaMessage('Équipe actualisée avec la dernière collection disponible. Vérifie les rôles et le budget.');
    arenaRender();
}
function arenaSettingsChanged(){arenaRender();}
function arenaArt(card){
    const source=typeof card.image==='string'&&/^https:\/\//.test(card.image)?card.image:'';
    return source?`<img src="${escapeHtml(source)}" alt="${escapeHtml(arenaCardName(card))}" loading="lazy">`:'<span class="arena-art-placeholder"><i class="fa-solid fa-cube" aria-hidden="true"></i></span>';
}
function arenaCardDetails(card){
    const isCreature=ArenaRules.creature(card),stats=isCreature?ArenaRules.fighter(card):ArenaRules.support(card);
    return `<span class="arena-role">${escapeHtml(isCreature?stats.roleName:stats.name)}</span>${isCreature?`<dl class="arena-combat-stats"><div><dt>PV</dt><dd>${stats.hp}</dd></div><div><dt>ATQ</dt><dd>${stats.attack}</dd></div><div><dt>Armure</dt><dd>${stats.armor}</dd></div></dl><strong class="arena-ability">${escapeHtml(stats.name)}</strong>`:''}<p class="arena-card-effect">${escapeHtml(stats.description)}</p>`;
}
function arenaRender(){
    if(arenaNode('section-builder').classList.contains('hidden')||arenaNode('arena-builder').classList.contains('hidden'))return;
    const target=arenaNode('arena-target').value,environment=ArenaRules.environments[target];
    arenaNode('arena-environment').textContent=environment.effect;
    arenaNode('arena-stance-note').textContent=ArenaRules.stances[arenaNode('arena-stance').value].description+' Soins, brûlure et recul restent inchangés.';
    const price=arenaTotal(arenaTeam),error=ArenaRules.validate(arenaTeam.cards,arenaTeam.supports);
    arenaNode('arena-team-cost').textContent=price+' / 18';arenaNode('arena-budget-progress').value=price;
    arenaNode('arena-save').disabled=!!error||arenaSaving;arenaNode('arena-support-count').textContent=arenaTeam.supports.length+' / 2';
    arenaNode('arena-fighter-slots').innerHTML=Array.from({length:3},(_,index)=>{
        const card=arenaTeam.cards[index];
        if(!card)return `<div class="arena-team-slot arena-slot-empty"><span>0${index+1}</span><strong>${index===0?'Créature de départ':'Créature en réserve'}</strong><small>Ajoute une créature depuis ta sélection.</small></div>`;
        return `<article class="arena-team-slot"><div class="arena-slot-heading"><span>${index===0?'01 · Active au départ':'0'+(index+1)+' · En réserve'}</span><b>${ArenaRules.cost(card)} pts</b></div><div class="arena-selected-art">${arenaArt(card)}</div><h4>${escapeHtml(arenaCardName(card))}</h4>${arenaCardDetails(card)}<div class="arena-slot-actions"><button type="button" onclick="arenaMoveFighter(${index},-1)" ${index===0?'disabled':''} aria-label="Avancer ${escapeHtml(arenaCardName(card))}">←</button><button type="button" onclick="arenaMoveFighter(${index},1)" ${index===arenaTeam.cards.length-1?'disabled':''} aria-label="Reculer ${escapeHtml(arenaCardName(card))}">→</button><button type="button" data-card-id="${escapeHtml(ArenaRules.id(card))}" onclick="arenaToggleCard(this.dataset.cardId)">Retirer</button></div></article>`;
    }).join('');
    arenaNode('arena-support-slots').innerHTML=arenaTeam.supports.length?arenaTeam.supports.map(card=>`<article class="arena-support-slot"><div class="arena-support-art">${arenaArt(card)}</div><div><strong>${escapeHtml(arenaCardName(card))}</strong><span>${ArenaRules.cost(card)} points · ${escapeHtml(ArenaRules.support(card).name)}</span><p>${escapeHtml(ArenaRules.support(card).description)}</p></div><button type="button" class="text-link" data-card-id="${escapeHtml(ArenaRules.id(card))}" onclick="arenaToggleCard(this.dataset.cardId)" aria-label="Retirer le soutien ${escapeHtml(arenaCardName(card))}">Retirer</button></article>`).join(''):'<p class="arena-explanation">Aucun soutien choisi. Ils sont facultatifs : conserve des points pour tes créatures ou ajoute jusqu’à deux effets utiles.</p>';
    const selectedRoles=new Set(arenaTeam.cards.map(card=>ArenaRules.fighter(card).role));
    const advice=[environment.advice];
    if(arenaTeam.cards.length===3){advice.push(selectedRoles.size===1?'Ton trio partage le même rôle. Un soin, une protection ou une perturbation peut lui apporter une option supplémentaire.':selectedRoles.size+' rôles différents dans le trio : adapte tes actions aux capacités disponibles.');if(price===18&&!arenaTeam.supports.length)advice.push('Tes 18 points sont investis dans les créatures. Une créature moins chère peut libérer un ou deux soutiens.');}
    if(target==='nether'&&arenaTeam.cards[0]&&ArenaRules.normal(ArenaRules.model(arenaTeam.cards[0]).dimension)!=='nether')advice.push('Ta créature de départ est exposée à la brûlure du Nether. Prépare un changement ou une purification.');
    arenaNode('arena-team-advice').textContent=advice.join(' ');
    arenaRenderPool();arenaRenderOpponent();
}
function arenaRenderPool(){
    uiCancelTask('arena-search');
    const owned=arenaOwnedCards(),type=arenaNode('arena-card-type').value,filter=arenaNode('arena-card-role').value;
    const words=ArenaRules.normal(arenaNode('arena-card-search').value).split(/\s+/).filter(Boolean);
    const candidates=owned.filter(card=>{
        const creature=ArenaRules.creature(card),info=creature?ArenaRules.fighter(card):ArenaRules.support(card),model=ArenaRules.model(card);
        const haystack=ArenaRules.normal([arenaCardName(card),model.nameEn,model.id,model.category,model.dimension,creature?info.roleName:info.name].join(' '));
        return creature===(type==='creature')&&(filter==='all'||filter===(creature?info.role:info.kind))&&words.every(word=>haystack.includes(word));
    }).sort((a,b)=>type==='creature'?ArenaRules.fighter(b).attack-ArenaRules.fighter(a).attack||ArenaRules.cost(a)-ArenaRules.cost(b)||arenaCardName(a).localeCompare(arenaCardName(b)):ArenaRules.cost(a)-ArenaRules.cost(b)||arenaCardName(a).localeCompare(arenaCardName(b)));
    const incomplete=distinctDeckCards(cards).filter(card=>card._minecards&&!ArenaRules.eligible(card)).length;
    arenaNode('arena-card-count').textContent=candidates.length+' carte(s) affichée(s) · '+owned.filter(ArenaRules.creature).length+' créatures disponibles'+(incomplete?' · '+incomplete+' cartes à resynchroniser ou non éligibles':'');
    const selected=new Set([...arenaTeam.cards,...arenaTeam.supports].map(ArenaRules.id)),price=arenaTotal(arenaTeam);
    arenaNode('arena-card-pool').innerHTML=candidates.length?candidates.map(card=>{
        const key=ArenaRules.id(card),chosen=selected.has(key),isCreature=ArenaRules.creature(card);
        const reason=chosen?'':(isCreature?arenaTeam.cards.length>=3:arenaTeam.supports.length>=2)?(isCreature?'Trois créatures déjà choisies':'Deux soutiens déjà choisis'):price+ArenaRules.cost(card)>18?'Budget de 18 points dépassé':'';
        return `<article class="arena-candidate ${chosen?'arena-chosen':''}"><div class="arena-candidate-art">${arenaArt(card)}<span>${ArenaRules.cost(card)} pts</span></div><div class="arena-candidate-body"><h4>${escapeHtml(arenaCardName(card))}</h4><small>${escapeHtml(ArenaRules.model(card).dimension)} · ${escapeHtml(card.rarete)}</small>${arenaCardDetails(card)}<button type="button" class="secondary-button" aria-pressed="${chosen}" ${reason?'disabled':''} title="${escapeHtml(reason||'')}" data-card-id="${escapeHtml(key)}" onclick="arenaToggleCard(this.dataset.cardId)">${chosen?'Retirer de l’équipe':isCreature?'Ajouter la créature':'Ajouter le soutien'}</button>${reason?`<small class="arena-unavailable">${escapeHtml(reason)}</small>`:''}</div></article>`;
    }).join(''):'<p class="arena-explanation">Aucune carte éligible pour ces filtres. Actualise ta collection pour charger les catégories et statistiques officielles, puis ajuste les filtres.</p>';
}
function arenaToggleCard(id){
    const existing=arenaTeam.cards.find(card=>ArenaRules.id(card)===id)||arenaTeam.supports.find(card=>ArenaRules.id(card)===id);
    if(existing){arenaTeam.cards=arenaTeam.cards.filter(card=>ArenaRules.id(card)!==id);arenaTeam.supports=arenaTeam.supports.filter(card=>ArenaRules.id(card)!==id);arenaMessage('');arenaRender();return;}
    const card=arenaOwnedCards().find(card=>ArenaRules.id(card)===id);
    if(!card){arenaMessage('Cette carte n’est plus disponible. Actualise ta collection.');return;}
    const group=ArenaRules.creature(card)?arenaTeam.cards:arenaTeam.supports,limit=ArenaRules.creature(card)?3:2;
    if(group.length>=limit||arenaTotal(arenaTeam)+ArenaRules.cost(card)>18){arenaMessage('Retire une carte ou libère des points avant cet ajout.');return;}
    group.push(card);arenaMessage('');arenaRender();
}
function arenaMoveFighter(index,direction){const next=index+direction;if(next<0||next>=arenaTeam.cards.length)return;[arenaTeam.cards[index],arenaTeam.cards[next]]=[arenaTeam.cards[next],arenaTeam.cards[index]];arenaRender();}
function arenaClearTeam(){arenaTeam={cards:[],supports:[]};arenaMessage('');arenaRender();}
async function arenaSuggest(){
    const button=arenaNode('arena-suggest'),epoch=arenaEpoch,profileId=activeProfile?.id;
    if(button.disabled||!profileId)return;button.disabled=true;arenaMessage('Recherche d’une équipe dans les 18 points…',true);
    try{
        await new Promise(resolve=>setTimeout(resolve,0));
        if(epoch!==arenaEpoch||activeProfile?.id!==profileId)return;
        const snapshot=uiCollectionSnapshot(),target=arenaNode('arena-target').value,strategy=arenaNode('arena-strategy').value,limit=Number(arenaNode('arena-support-limit').value);
        const proposed=await uiRecommendArena(arenaOwnedCards(),target,strategy,limit);
        if(epoch!==arenaEpoch||activeProfile?.id!==profileId)return;
        if(snapshot!==uiCollectionSnapshot()||target!==arenaNode('arena-target').value||strategy!==arenaNode('arena-strategy').value||limit!==Number(arenaNode('arena-support-limit').value)){arenaMessage('La collection ou les options ont changé pendant le calcul. Relance la recherche.');return;}
        if(!proposed){arenaMessage('Il faut trois créatures éligibles dont le coût total ne dépasse pas 18 points. Actualise ta collection ou ajoute des créatures moins rares.');return;}
        arenaTeam={cards:proposed.cards,supports:proposed.supports};
        arenaMessage('Composition proposée avec '+proposed.teamCost+' points. Tu peux changer chaque carte et l’ordre des créatures.',true);arenaRender();
    }catch(error){if(epoch===arenaEpoch&&activeProfile?.id===profileId)arenaMessage(error.message);}
    finally{if(epoch===arenaEpoch)button.disabled=false;}
}
async function arenaSyncCollection(button){
    if(button.disabled)return;button.disabled=true;const epoch=arenaEpoch;
    try{
        const status=await mcStatus();if(epoch!==arenaEpoch)return;
        if(!status?.configured){arenaMessage('Relie ta clé personnelle dans « MineCards connecté », puis synchronise la collection.');return;}
        await mcSync();if(epoch!==arenaEpoch)return;
        const after=await mcStatus();if(epoch!==arenaEpoch||!after)return;
        arenaRefreshCollection();
        if(after.job?.error)arenaMessage(after.job.error);
        else arenaMessage(after.job?.running?'La synchronisation est en cours. La sélection se mettra à jour à sa fin.':'Cartes tactiques actualisées depuis MineCards.',true);
    }catch(error){if(epoch===arenaEpoch)arenaMessage(error.message);}finally{button.disabled=false;}
}
async function arenaLoadOpponents(){
    if(arenaLoading||!activeProfile)return;
    const epoch=arenaEpoch,profileId=activeProfile.id;arenaLoading=true;arenaNode('arena-load-opponents').disabled=true;
    arenaNode('arena-opponent-status').textContent='Lecture des arènes publiées…';
    try{
        const list=[];let page=1;
        do{
            const response=await apiRequest('/api/minecards/explore/arenas?limit=100&page='+page);
            if(epoch!==arenaEpoch||profileId!==activeProfile?.id)return;
            if(!Array.isArray(response.data))throw Error('Liste des arènes invalide.');
            list.push(...response.data);
            const p=response.pagination;
            if(!p||p.page!==page||typeof p.hasMore!=='boolean')throw Error('Pagination des arènes invalide.');
            if(p.nextPage===null){if(p.hasMore)throw Error('La liste des arènes est incomplète.');break;}
            if(p.nextPage!==page+1||p.nextPage>1000)throw Error('Pagination des arènes invalide.');
            page=p.nextPage;
        }while(true);
        arenaOpponents=list;arenaFetchedAt=new Date().toISOString();arenaRenderOpponent();
    }catch(error){if(epoch===arenaEpoch)arenaNode('arena-opponent-status').textContent=error.message+(error.retryAfter?' Réessaie dans '+error.retryAfter+' secondes.':'')+(arenaFetchedAt?' La précédente lecture est conservée.':'');}
    finally{if(epoch===arenaEpoch){arenaLoading=false;arenaNode('arena-load-opponents').disabled=false;}}
}
function arenaRenderOpponent(){
    if(!arenaFetchedAt)return;
    const arena=arenaOpponents.find(item=>item.id===arenaNode('arena-target').value);
    arenaNode('arena-opponent-status').textContent='Lecture du '+new Date(arenaFetchedAt).toLocaleString('fr-FR')+'. L’API publie la défense de collection ; elle ne fournit pas la posture ni les soutiens du champion.';
    const container=arenaNode('arena-opponent-content');
    if(!arena){container.textContent='Cette arène ne figure pas dans la dernière réponse de l’API.';return;}
    container.innerHTML=`<div class="arena-opponent-title"><h4>${escapeHtml(arena.name)}</h4><span>Champion : ${escapeHtml(arena.champion?.username||'Non renseigné')}${arena.champion?.isNpc?' · PNJ':''}</span><span>${escapeHtml(arena.score)} pts de collection</span></div><div class="arena-fighter-slots">${(arena.defense||[]).map(card=>`<article class="arena-team-slot"><div class="arena-selected-art">${arenaArt(card)}</div><h4>${escapeHtml(card.name)}</h4>${ArenaRules.eligible(card)&&ArenaRules.creature(card)?arenaCardDetails(card):'<p>Statistiques tactiques indisponibles.</p>'}</article>`).join('')}</div><p class="arena-explanation">Ces statistiques sont calculées à partir de la défense enregistrée par l’API. Vérifie l’équipe actuelle sur MineCards avant ton défi ; dépasser son score de collection ne garantit pas une victoire tactique.</p>`;
}
async function arenaSaveTeam(){
    const error=ArenaRules.validate(arenaTeam.cards,arenaTeam.supports);if(error){arenaMessage(error);return;}
    if(!activeProfile||arenaNode('arena-save').disabled||arenaSaving)return;
    if(favoriteDecks.length>=500){arenaMessage('La limite de 500 favoris est atteinte.');return;}
    const name=arenaNode('arena-deck-name').value.trim()||'Équipe · '+ArenaRules.environments[arenaNode('arena-target').value].name;
    if(name.length>120){arenaMessage('Le nom est limité à 120 caractères.');return;}
    const profileId=activeProfile.id,epoch=arenaEpoch,button=arenaNode('arena-save');button.disabled=true;arenaSaving=true;
    const entry={id:Date.now(),name,mode:'arena',cards:structuredClone(arenaTeam.cards),supports:structuredClone(arenaTeam.supports),arenaId:arenaNode('arena-target').value,tactic:arenaNode('arena-stance').value,teamCost:arenaTotal(arenaTeam),totalPower:arenaTeam.cards.reduce((sum,card)=>sum+deckPower(card),0),targetPower:null,createdAt:new Date().toLocaleDateString('fr-FR')};
    favoriteDecks.unshift(entry);
    try{await saveDecksStorage(true);if(profileId===activeProfile?.id&&epoch===arenaEpoch){arenaMessage('Équipe enregistrée avec ses soutiens, son ordre et sa posture.',true);renderFavoriteDecks();}}
    catch(error){if(profileId===activeProfile?.id&&epoch===arenaEpoch){favoriteDecks=favoriteDecks.filter(deck=>deck.id!==entry.id);try{localStorage.setItem('tcg_favorite_decks',JSON.stringify(favoriteDecks));}catch{}arenaMessage('Sauvegarde non confirmée : '+error.message);renderFavoriteDecks();}}
    finally{if(epoch===arenaEpoch){arenaSaving=false;button.disabled=!!ArenaRules.validate(arenaTeam.cards,arenaTeam.supports);}}
}
function arenaOpenFavorite(deckId){
    const saved=favoriteDecks.find(deck=>String(deck.id)===String(deckId)&&deck.mode==='arena');if(!saved)return;
    const owned=new Map(arenaOwnedCards().map(card=>[ArenaRules.id(card),card]));
    const fighters=(saved.cards||[]).map(card=>owned.get(ArenaRules.id(card))),supports=(saved.supports||[]).map(card=>owned.get(ArenaRules.id(card)));
    switchTab('builder');setBuilderFormat('arena');
    if([...fighters,...supports].some(card=>!card)){arenaMessage('Une carte de ce favori n’est plus disponible. Actualise la collection puis recompose l’équipe.');return;}
    const error=ArenaRules.validate(fighters,supports);if(error){arenaMessage(error);return;}
    arenaTeam={cards:fighters,supports};arenaNode('arena-target').value=ArenaRules.environments[saved.arenaId]?saved.arenaId:'overworld';arenaNode('arena-stance').value=ArenaRules.stances[saved.tactic]?saved.tactic:'balanced';arenaNode('arena-deck-name').value=saved.name;arenaRender();arenaMessage('Favori rouvert avec les statistiques de ta collection actuelle.',true);
}
async function arenaCopyTeam(){
    const error=ArenaRules.validate(arenaTeam.cards,arenaTeam.supports);if(error){arenaMessage(error);return;}
    const text=[ArenaRules.environments[arenaNode('arena-target').value].name,'Posture : '+ArenaRules.stances[arenaNode('arena-stance').value].name,'Budget : '+arenaTotal(arenaTeam)+'/18',...arenaTeam.cards.map((card,index)=>(index+1)+'. '+arenaCardName(card)+(index===0?' — active au départ':' — réserve')),'Soutiens : '+(arenaTeam.supports.map(arenaCardName).join(', ')||'aucun')].join('\n');
    try{await navigator.clipboard.writeText(text);arenaMessage('Composition copiée. Tu peux la reproduire dans MineCards.',true);}catch{arenaMessage('Le navigateur refuse la copie. Sélectionne les noms de l’équipe pour les copier manuellement.');}
}
