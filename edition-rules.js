(function(root,factory){
    'use strict';
    const rules=factory();
    if(typeof module==='object'&&module.exports)module.exports=rules;else root.EditionRules=rules;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    // Barème lu sur le recycleur officiel le 22 octobre 2026.
    const rates=Object.freeze({CHARBON:1,CUIVRE:2,FER:5,OR:10,DIAMANT:25,NETHERITE:50});
    const boosterCost=50;
    const rarity=card=>String(card?._minecards?.rarity||card?.rarity||card?.rarete||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    const secret=card=>card?.isSecret===true||card?._minecards?.isSecret===true||rarity(card)==='MYTHIQUE';
    const integer=value=>Number.isSafeInteger(value)&&value>=0;
    function quantities(meta){
        const total=integer(meta?.quantity)?meta.quantity:null,standard=meta?.standardQuantity,holographic=meta?.holographicQuantity;
        const known=total!==null&&integer(standard)&&integer(holographic)&&Number.isSafeInteger(standard+holographic)&&standard+holographic===total;
        return {known,total,standard:known?standard:null,holographic:known?holographic:null,recyclable:known&&!secret(meta)?Math.max(0,standard-1):0};
    }
    function finishes(card){return quantities(card?._minecards);}
    function points(card){return secret(card)?null:rates[rarity(card)]??null;}
    function hasHolo(card){return card?.finish==='HOLOGRAPHIC'||finishes(card).holographic>0;}
    function inventory(cards){
        const byId=new Map();
        for(const card of cards||[]){
            const id=card?._minecards?.cardId;if(!id)continue;
            const before=byId.get(id);
            if(!before||!finishes(before).known&&finishes(card).known||finishes(before).known===finishes(card).known&&(card._minecards.quantity||0)>(before._minecards.quantity||0))byId.set(id,card);
        }
        return [...byId.values()];
    }
    function summary(cards){
        const result={standardCopies:0,holographicCopies:0,holographicCards:0,recyclableCopies:0,potentialPoints:0,unknownCards:0,knownCards:0,mythicCards:0};
        for(const card of inventory(cards)){
            if(secret(card))result.mythicCards++;
            const info=finishes(card),rate=points(card);
            if(!info.known){result.unknownCards++;continue;}
            result.knownCards++;result.standardCopies+=info.standard;result.holographicCopies+=info.holographic;if(info.holographic>0)result.holographicCards++;
            if(rate!==null){result.recyclableCopies+=info.recyclable;result.potentialPoints+=info.recyclable*rate;}
        }
        return result;
    }
    return Object.freeze({rates,boosterCost,rarity,secret,quantities,finishes,points,hasHolo,inventory,summary});
});
