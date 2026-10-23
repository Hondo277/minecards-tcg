'use strict';
let collectionLayout='album',collectionSelectedKey=null,collectionLayoutCards=[];
const collectionLayoutLabels={album:'Album',inventory:'Inventaire',focus:'Focus'};
function collectionResetLayout(){
    collectionSelectedKey=null;collectionLayoutCards=[];collectionSetLayout('album',false);
    for(const id of ['collection-inspector','collection-focus']){const node=document.getElementById(id);node.textContent='';node.hidden=true;}
}
function collectionSetLayout(layout,remember=true){
    collectionLayout=Object.hasOwn(collectionLayoutLabels,layout)?layout:'album';
    document.getElementById('section-collection').dataset.layout=collectionLayout;
    document.getElementById('cards-grid').classList.toggle('list-view',collectionLayout==='inventory');
    for(const [value,label]of Object.entries(collectionLayoutLabels)){
        const button=document.getElementById('layout-'+value),selected=value===collectionLayout;
        button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
        if(selected)document.getElementById('collection-layout-status').textContent='Disposition '+label;
    }
    collectionRenderSelection();if(remember)workspaceRemember();
}
function collectionUseResults(list){
    collectionLayoutCards=list;
    if(!list.some(card=>workspaceCardKey(card)===collectionSelectedKey))collectionSelectedKey=list[0]?workspaceCardKey(list[0]):null;
}
function collectionDecorateCard(node,card){
    const key=workspaceCardKey(card),selected=collectionSelectedKey===key;
    node.dataset.collectionKey=key;
    if(node.classList.contains('collection-selected')!==selected)node.classList.toggle('collection-selected',selected);
    const button=node.querySelector('[data-collection-select]');
    if(button&&button.getAttribute('aria-pressed')!==String(selected))button.setAttribute('aria-pressed',String(selected));
}
function collectionRenderSelection(){
    const card=collectionLayoutCards.find(item=>workspaceCardKey(item)===collectionSelectedKey),inventory=document.getElementById('collection-inspector'),focus=document.getElementById('collection-focus');
    inventory.hidden=collectionLayout!=='inventory'||!card;focus.hidden=collectionLayout!=='focus'||!card;
    if(card&&collectionLayout!=='album'){
        const index=collectionLayoutCards.indexOf(card),target=collectionLayout==='focus'?focus:inventory;
        const html=`<div class="collection-preview-heading"><div><span class="eyebrow">${collectionLayout==='focus'?'AU PREMIER PLAN':'CARTE SÉLECTIONNÉE'}</span><small>${index+1} / ${collectionLayoutCards.length}</small></div><div class="collection-preview-navigation"><button class="secondary-button" type="button" data-collection-step="-1" aria-label="Carte précédente" ${index===0?'disabled':''}><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><button class="secondary-button" type="button" data-collection-step="1" aria-label="Carte suivante" ${index===collectionLayoutCards.length-1?'disabled':''}><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div></div>${createCardHtml(card,true)}<p class="collection-preview-stock">${card._minecards?(EditionRules.finishes(card).known?EditionRules.finishes(card).standard+' standard · '+EditionRules.finishes(card).holographic+' holographique(s) · '+EditionRules.duplicates(card)+' doublon(s) standard':'Finitions à actualiser depuis MineCards'):(workspaceQuantities.get(deckIdentity(card))||1)+' exemplaire(s) local(aux)'}</p>`;
        uiSetHTML(target,html);
    }
    for(const node of document.getElementById('cards-grid').children)if(node.uiCard)collectionDecorateCard(node,node.uiCard);
}
function collectionSelectCard(key){
    if(!collectionLayoutCards.some(card=>workspaceCardKey(card)===key))return;
    collectionSelectedKey=key;
    if(collectionLayout==='album')collectionSetLayout('inventory');else collectionRenderSelection();
    if(collectionLayout==='focus'||window.matchMedia('(max-width:950px)').matches){
        const preview=document.getElementById(collectionLayout==='focus'?'collection-focus':'collection-inspector');
        if(!preview.hidden)preview.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'nearest'});
    }
}
document.addEventListener('click',event=>{
    const section=document.getElementById('section-collection');if(!section.contains(event.target))return;
    const select=event.target.closest('[data-collection-select]');
    if(select){collectionSelectCard(select.dataset.collectionSelect);return;}
    const step=event.target.closest('[data-collection-step]');
    if(step&&!step.disabled){const index=collectionLayoutCards.findIndex(card=>workspaceCardKey(card)===collectionSelectedKey),card=collectionLayoutCards[index+Number(step.dataset.collectionStep)];if(card)collectionSelectCard(workspaceCardKey(card));return;}
    if(collectionLayout==='album'||event.target.closest('button,a,input,select,textarea,label'))return;
    const row=event.target.closest('#cards-grid .collection-card');if(row)collectionSelectCard(row.dataset.collectionKey);
});
