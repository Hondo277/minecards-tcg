'use strict';

function fillProfileFeaturedDeck(value) {
    const select=document.getElementById('settings-featured-deck');
    select.innerHTML='<option value="">Dernier favori enregistré</option>'+favoriteDecks.map(deck=>`<option value="${escapeHtml(deck.id)}">${escapeHtml(deck.name)}</option>`).join('');
    select.value=favoriteDecks.some(deck=>String(deck.id)===String(value))?String(value):'';
    select.dataset.deckIds=JSON.stringify(favoriteDecks.map(deck=>[deck.id,deck.name]));
}

function profilePower(card) {
    const value=Number(card.valeur);
    return Number.isFinite(value)?value:0;
}

function strongestProfileCards() {
    return distinctDeckCards([...cards].sort((a,b)=>profilePower(b)-profilePower(a))).slice(0,3);
}

function profileCardArt(card) {
    const source=typeof card.image==='string' && /^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/.test(card.image)?card.image:'';
    return source?`<img src="${escapeHtml(source)}" alt="${escapeHtml(card.nom)}" loading="lazy">`:'<span class="profile-art-placeholder"><i class="fa-solid fa-cube" aria-hidden="true"></i></span>';
}

function profileDeckPanel({eyebrow,title,deckCards,icon,description,action,strong=false}) {
    const total=deckCards.reduce((sum,card)=>sum+profilePower(card),0);
    return `<article class="profile-deck-panel ${strong?'profile-deck-champion':''}"><div class="profile-panel-heading"><div><span class="eyebrow">${eyebrow}</span><h3>${escapeHtml(title)}</h3></div><span class="profile-panel-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span></div><p class="profile-panel-description">${escapeHtml(description)}</p><div class="profile-deck-art">${deckCards.map(card=>`<figure>${profileCardArt(card)}<figcaption><strong>${escapeHtml(card.nom)}</strong><span>${escapeHtml(profilePower(card))} pts</span></figcaption></figure>`).join('')}</div><div class="profile-deck-bottom"><div><strong>${total.toLocaleString('fr-FR')}</strong><span>puissance du trio</span></div>${action}</div></article>`;
}

function openProfileCustomization() {
    document.getElementById('profile-settings-panel').scrollIntoView({behavior:'smooth',block:'start'});
    document.getElementById('settings-display-name').focus({preventScroll:true});
}

function openStrongestProfileDeck() {
    const trio=strongestProfileCards();
    if (trio.length!==3) return;
    const total=trio.reduce((sum,card)=>sum+profilePower(card),0);
    currentGeneratedDeck={cards:trio,totalPower:total,targetPower:total,diff:0};
    document.getElementById('target-power').value=total;
    displayGeneratedDeck(currentGeneratedDeck);
    document.getElementById('deck-name-input').value='Mon trio le plus puissant';
    switchTab('builder');
}

function renderProfileShowcase() {
    if (!activeProfile || !document.getElementById('profile-showcase')) return;
    const select=document.getElementById('settings-featured-deck');
    if (select.dataset.deckIds!==JSON.stringify(favoriteDecks.map(deck=>[deck.id,deck.name]))) fillProfileFeaturedDeck(select.value||activeProfile.profile?.featuredDeckId||'');
    const collection=distinctDeckCards(cards);
    const copies=collection.reduce((sum,card)=>sum+(Number.isSafeInteger(card._minecards?.quantity)&&card._minecards.quantity>0?card._minecards.quantity:1),0);
    const strongest=strongestProfileCards();
    const strongestPower=strongest.length===3?strongest.reduce((sum,card)=>sum+profilePower(card),0):null;
    const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const rarityNames=['Charbon','Cuivre','Fer','Or','Diamant','Netherite'];
    const rarityCount=new Map();
    for (const card of collection) {const key=normalize(card.rarete);rarityCount.set(key,(rarityCount.get(key)||0)+1);}
    const stats=[['fa-layer-group',collection.length,'Cartes uniques'],['fa-clone',copies,'Exemplaires'],['fa-copy',copies-collection.length,'Doublons'],['fa-star',favoriteDecks.length,'Decks favoris'],['fa-gem',rarityCount.size,'Raretés possédées'],['fa-bolt',strongestPower,'Deck maximum']];
    document.getElementById('profile-collection-stats').innerHTML=stats.map(([icon,value,label])=>`<div><i class="fa-solid ${icon}" aria-hidden="true"></i><strong>${value===null?'—':value.toLocaleString('fr-FR')}</strong><span>${label}</span></div>`).join('');
    const created=new Date(activeProfile.createdAt);
    document.getElementById('profile-member-meta').innerHTML=`<span class="profile-collector-badge"><i class="fa-solid ${activeProfile.role==='admin'?'fa-shield-halved':'fa-gem'}" aria-hidden="true"></i> ${activeProfile.role==='admin'?'Administrateur':'Collectionneur'}</span>${Number.isNaN(created.getTime())?'':`<span><i class="fa-regular fa-calendar" aria-hidden="true"></i> Membre depuis ${escapeHtml(created.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}))}</span>`}<span><i class="fa-solid fa-lock" aria-hidden="true"></i> Espace personnel</span>`;
    const featured=favoriteDecks.find(deck=>String(deck.id)===select.value)||favoriteDecks[0];
    const empty=(icon,title,text,tab,label)=>`<article class="profile-deck-panel profile-showcase-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><h3>${title}</h3><p>${text}</p><button class="secondary-button" type="button" onclick="switchTab('${tab}')">${label}</button></article>`;
    const favoritePanel=featured?profileDeckPanel({eyebrow:'TON DECK SIGNATURE',title:featured.name,deckCards:featured.cards||[],icon:'fa-star',description:'Ton favori mis à l’honneur. Choisis le deck à exposer dans la personnalisation.',action:'<button class="secondary-button" type="button" onclick="switchTab(\'decks\')">Mes favoris <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>'}):empty('fa-star','Ton prochain deck signature','Enregistre un premier trio pour lui réserver cette place.','builder','Créer un deck');
    const bestPanel=strongest.length===3?profileDeckPanel({eyebrow:'LE SOMMET DE TA COLLECTION',title:'Ton trio le plus puissant',deckCards:strongest,icon:'fa-bolt',description:'La puissance maximale avec trois cartes différentes de ta collection actuelle.',action:'<button class="workspace-add-button" type="button" onclick="openStrongestProfileDeck()">Ouvrir dans l’atelier <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>',strong:true}):empty('fa-bolt','Une équipe à construire','Ajoute au moins trois cartes différentes pour découvrir ton meilleur trio.','collection','Voir ma collection');
    const ranked=[...collection].sort((a,b)=>rarityNames.findIndex(r=>normalize(r)===normalize(b.rarete))-rarityNames.findIndex(r=>normalize(r)===normalize(a.rarete))||profilePower(b)-profilePower(a)).slice(0,4);
    document.getElementById('profile-showcase').innerHTML=favoritePanel+bestPanel+`<article class="profile-rarity-panel"><div class="profile-panel-heading"><div><span class="eyebrow">UNE COLLECTION, MILLE NUANCES</span><h3>Ton carnet de raretés</h3></div><i class="fa-solid fa-gem" aria-hidden="true"></i></div><div class="profile-rarity-bars">${rarityNames.map((name,index)=>{const count=rarityCount.get(normalize(name))||0;return `<div style="--rarity-tone:${['#96a1b5','#d99571','#cbd5e1','#edc877','#78cde2','#bfa3ee'][index]}"><span>${name}</span><div class="profile-rarity-track"><span style="width:${collection.length?count/collection.length*100:0}%"></span></div><strong>${count}</strong></div>`;}).join('')}</div><small>Cartes différentes · les exemplaires réservés sont exclus des quantités.</small></article><article class="profile-highlight-panel"><div class="profile-panel-heading"><div><span class="eyebrow">LES PIÈCES À L’HONNEUR</span><h3>Tes cartes les plus rares</h3></div><button class="text-link" type="button" onclick="switchTab('collection')">Tout voir ↗</button></div><div class="profile-highlight-cards">${ranked.length?ranked.map(card=>`<figure>${profileCardArt(card)}<figcaption><strong>${escapeHtml(card.nom)}</strong><small>${escapeHtml(card.rarete)} · ${profilePower(card)} pts</small></figcaption></figure>`).join(''):'<p class="profile-panel-description">Tes premières cartes apparaîtront ici.</p>'}</div></article>`;
}
