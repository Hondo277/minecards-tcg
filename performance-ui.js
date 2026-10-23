'use strict';

// Ces caches restent en mémoire et sont vidés au changement de compte.
const uiTasks=new Map();
let uiCollectionCache=null,uiCardNodes=new WeakMap(),uiSearchCache=new WeakMap(),uiHTMLCache=new WeakMap(),uiPaintEpoch=0,uiPaintFrame=null,uiCardObserver=null;
const uiVisibleCards=new Set();
let uiDeckWorker=null,uiWorkerSequence=0;
const uiWorkerJobs=new Map();
function uiStopDeckWorker(){
    uiDeckWorker?.terminate();uiDeckWorker=null;
    for(const job of uiWorkerJobs.values()){clearTimeout(job.timer);job.reject(new Error('Calcul interrompu.'));}uiWorkerJobs.clear();
}
function uiRecommendArena(collection,arena,strategy,supportLimit){
    if(typeof Worker!=='function')return Promise.resolve().then(()=>ArenaRules.recommend(collection,arena,strategy,supportLimit));
    if(!uiDeckWorker){
        uiDeckWorker=new Worker('/deck-worker.js');
        uiDeckWorker.onmessage=event=>{const job=uiWorkerJobs.get(event.data.id);if(!job)return;uiWorkerJobs.delete(event.data.id);clearTimeout(job.timer);if(event.data.error)job.reject(new Error(event.data.error));else job.resolve(event.data.result);};
        uiDeckWorker.onerror=()=>uiStopDeckWorker();
    }
    const id=++uiWorkerSequence;
    return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>uiStopDeckWorker(),15000);uiWorkerJobs.set(id,{resolve,reject,timer});
        try{uiDeckWorker.postMessage({id,collection,arena,strategy,supportLimit});}catch(error){clearTimeout(timer);uiWorkerJobs.delete(id);reject(error);}
    });
}
function uiCancelTask(key){const timer=uiTasks.get(key);if(timer)clearTimeout(timer.timer);uiTasks.delete(key);}
function uiSchedule(key,run,delay=110){uiCancelTask(key);uiTasks.set(key,{run,timer:setTimeout(()=>{uiTasks.delete(key);run();},delay)});}
function uiFlushTask(key){const task=uiTasks.get(key);if(task){uiCancelTask(key);task.run();}}
function scheduleCollectionFilter(){uiSchedule('collection-filter',filterAndRenderCards);}
function uiSetHTML(node,html){if(uiHTMLCache.get(node)===html)return;node.innerHTML=html;uiHTMLCache.set(node,html);}
function uiResetPerformance(){
    uiStopDeckWorker();
    uiFlushTask('library-preferences');
    for(const key of uiTasks.keys())uiCancelTask(key);
    uiPaintEpoch++;if(uiPaintFrame!==null)cancelAnimationFrame(uiPaintFrame);uiPaintFrame=null;
    uiCollectionCache=null;uiCardNodes=new WeakMap();uiSearchCache=new WeakMap();uiHTMLCache=new WeakMap();
    uiCardObserver?.disconnect();uiCardObserver=null;uiVisibleCards.clear();
    document.getElementById('cards-grid').replaceChildren();
    document.getElementById('cards-grid').removeAttribute('aria-busy');
}
function uiCollectionSnapshot(){
    if(uiCollectionCache?.source===cards&&uiCollectionCache.revision===profileDataRevision&&uiCollectionCache.profileId===activeProfile?.id)return uiCollectionCache;
    uiCardNodes=new WeakMap();uiSearchCache=new WeakMap();uiCardObserver?.disconnect();uiVisibleCards.clear();
    if(typeof IntersectionObserver==='function')uiCardObserver=new IntersectionObserver(entries=>{
        for(const entry of entries){if(entry.isIntersecting)uiVisibleCards.add(entry.target);else uiVisibleCards.delete(entry.target);}
    },{rootMargin:'120px'});
    const counts=collectionCopyStats(cards);
    return uiCollectionCache={source:cards,revision:profileDataRevision,profileId:activeProfile?.id,counts,editions:EditionRules.summary(cards),quantities:new Map(counts.entries.map(entry=>[deckIdentity(entry.card),entry.quantity])),categories:[...new Set(cards.map(card=>card._minecards?.category).filter(Boolean))].sort(),dimensions:[...new Set(cards.map(card=>card._minecards?.dimension).filter(Boolean))].sort()};
}
function uiSearchText(card){
    const note=notebookEntries[workspaceCardKey(card)]?.note||'',cached=uiSearchCache.get(card);
    if(cached?.note===note)return cached.text;
    const text=workspaceNormalize([card.nom,card._minecards?.nameEn,card._minecards?.category,card._minecards?.dimension,note].join(' '));
    uiSearchCache.set(card,{note,text});return text;
}
function uiCardNode(card,duplicateCount){
    const pinned=!!notebookEntries[workspaceCardKey(card)]?.favorite,cached=uiCardNodes.get(card);
    if(cached&&cached.duplicateCount===duplicateCount&&cached.pinned===pinned)return cached.node;
    if(cached){uiCardObserver?.unobserve(cached.node);uiVisibleCards.delete(cached.node);}
    const template=document.createElement('template');template.innerHTML=createCardHtml(card,true,duplicateCount).trim();
    const node=template.content.firstElementChild;
    uiCardNodes.set(card,{node,duplicateCount,pinned});uiCardObserver?.observe(node);return node;
}
function uiPaintCollection(list,duplicateCounts){
    const grid=document.getElementById('cards-grid'),epoch=++uiPaintEpoch,generation=workspaceGeneration;
    if(uiPaintFrame!==null)cancelAnimationFrame(uiPaintFrame);uiPaintFrame=null;
    const snapshot=uiCollectionSnapshot();
    const wanted=new Set(list);
    for(const child of [...grid.children]){
        const card=child.uiCard,cached=card&&uiCardNodes.get(card);
        if(!wanted.has(card)||cached?.node!==child||cached.duplicateCount!==(duplicateCounts?.get(card)??null)||cached.pinned!==!!notebookEntries[workspaceCardKey(card)]?.favorite)child.remove();
    }
    if(list.length===grid.children.length&&list.every((card,index)=>uiCardNodes.get(card)?.node===grid.children[index])){grid.setAttribute('aria-busy','false');return;}
    grid.setAttribute('aria-busy',String(list.length>0));
    let index=0,cursor=grid.firstElementChild;
    const paint=()=>{
        uiPaintFrame=null;if(epoch!==uiPaintEpoch||generation!==workspaceGeneration)return;
        if(snapshot!==uiCollectionSnapshot()){filterAndRenderCards();return;}
        const started=performance.now(),fragment=document.createDocumentFragment();let count=0;
        // Un lot court laisse au navigateur le temps de traiter les clics et le défilement.
        while(index<list.length&&count<32&&(count===0||performance.now()-started<7)){
            const card=list[index++],node=uiCardNode(card,duplicateCounts?.get(card)??null);node.uiCard=card;count++;
            if(cursor===node){if(fragment.childNodes.length)grid.insertBefore(fragment,cursor);cursor=cursor.nextElementSibling;}
            else if(cursor){if(fragment.childNodes.length)grid.insertBefore(fragment,cursor);grid.insertBefore(node,cursor);}
            else fragment.append(node);
        }
        if(fragment.childNodes.length)grid.append(fragment);
        if(index<list.length)uiPaintFrame=requestAnimationFrame(paint);else grid.setAttribute('aria-busy','false');
    };
    paint();
}
document.addEventListener('visibilitychange',()=>{
    document.documentElement.classList.toggle('ui-background',document.hidden);
    if(document.hidden){uiFlushTask('collection-filter');uiFlushTask('library-preferences');}
});
window.addEventListener('pagehide',()=>uiFlushTask('library-preferences'));
