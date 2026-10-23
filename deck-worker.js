'use strict';
importScripts('/arena-rules.js');
self.onmessage=event=>{
    const {id,collection,arena,strategy,supportLimit}=event.data;
    try{self.postMessage({id,result:ArenaRules.recommend(collection,arena,strategy,supportLimit)});}
    catch{self.postMessage({id,error:'La recherche d’équipe n’a pas pu aboutir. Réessaie avec la collection actualisée.'});}
};
