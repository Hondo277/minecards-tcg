'use strict';

// Règles observées dans l'interface publique MineCards le 18 octobre 2026.
// Les scores de recommandation sont propres à cet outil, sans probabilité de victoire.
(function(root,factory){
    const rules=factory();
    if(typeof module==='object'&&module.exports)module.exports=rules;
    else root.ArenaRules=rules;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    const limits={budget:18,creatures:3,supports:2,maxTurns:30};
    const costs={CHARBON:2,CUIVRE:3,FER:4,OR:5,DIAMANT:6,NETHERITE:7};
    const roles={striker:'Attaquant',tank:'Protecteur',healer:'Soigneur',trickster:'Perturbateur'};
    const stances={balanced:{name:'Équilibrée',outgoing:1,incoming:1,description:'Dégâts directs et dégâts reçus sans modification.'},aggressive:{name:'Agressive',outgoing:1.2,incoming:1.15,description:'Dégâts directs +20 %, dégâts directs reçus +15 %.'},defensive:{name:'Prudente',outgoing:.85,incoming:.8,description:'Dégâts directs −15 %, dégâts directs reçus −20 %.'}};
    const environments={
        overworld:{name:'Clairière des gardiens',dimension:'Overworld',effect:'Tous les 3 tours : 6 PV rendus à la réserve vivante la plus blessée, ou au combattant actif s’il ne reste aucune réserve.',advice:'Garde une réserve vivante et alterne tes créatures blessées pour profiter des soins.'},
        nether:{name:'Bastion des braises',dimension:'Nether',effect:'Tous les 3 tours : les combattants actifs hors Nether brûlent pendant 2 tours, à raison de 6 dégâts par tour.',advice:'Une créature du Nether en tête évite cet effet. Une purification peut retirer la brûlure.'},
        end:{name:'Citadelle du vide',dimension:'End',effect:'Tous les 3 tours : le changement de créature devient gratuit en énergie.',advice:'Profite de ces tours pour alterner les rôles et protéger une créature blessée.'}
    };
    const normal=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    function model(card){
        const meta=card._minecards;
        return meta?{id:meta.cardId,name:card.nom,nameEn:meta.nameEn||'',rarity:meta.rarity,category:meta.category,dimension:meta.dimension,attack:meta.attack,defense:meta.defense,power:meta.power,active:meta.active}:{...card};
    }
    const id=card=>String(model(card).id??'');
    const cost=card=>Object.hasOwn(costs,model(card).rarity)?costs[model(card).rarity]:null;
    const creature=card=>['creatures','creature','mobs','animals'].includes(normal(model(card).category));
    function eligible(card){
        const c=model(card);
        return !!id(card)&&cost(card)!==null&&c.active===true&&typeof c.category==='string'&&!!c.category&&typeof c.dimension==='string'&&Number.isSafeInteger(c.attack)&&c.attack>=0&&Number.isSafeInteger(c.defense)&&c.defense>=0&&(!card._minecards||Number.isSafeInteger(card._minecards.quantity)&&card._minecards.quantity>0);
    }
    const search=card=>{const c=model(card);return normal(c.id+' '+c.name+' '+(c.nameEn||''));};
    function role(card){
        const text=search(card);
        if(/allay|axolotl|cow|vache|mooshroom|champimeuh|sheep|mouton|villager|villageois|pig\b|cochon|chicken|poule/.test(text))return 'healer';
        if(/golem|turtle|tortue|armadillo|tatou|ravager|ravageur|warden|panda|polar_bear|ours polaire|shulker/.test(text))return 'tank';
        if(/enderman|witch|sorciere|silverfish|poisson d'argent|endermite|fox|renard|vex|bat\b|chauve|ocelot|cat\b|chat\b|bee\b|abeille|spider|araignee/.test(text))return 'trickster';
        return 'striker';
    }
    function fighter(card){
        const c=model(card),type=role(card),rank=(cost(card)??7)-2;
        const attack=Math.min(160,Math.max(0,c.attack)),defense=Math.min(160,Math.max(0,c.defense));
        const ability=/creeper/.test(search(card))?{name:'Mèche allumée',description:'Prépare la prochaine attaque : ×2,1 + 8 dégâts, avec un recul de 22 % des PV maximum. La garde atténue l’explosion.'}:
            type==='tank'?{name:'Rempart',description:'Frappe à 75 %, rend 8 PV et réduit de 65 % les dégâts reçus pendant ce tour.'}:
            type==='healer'?{name:'Second souffle',description:'Rend à l’allié vivant le plus blessé 27 % de ses PV maximum + 8, puis frappe à 55 %.'}:
            type==='trickster'?{name:'Perturbation',description:'Frappe à 110 % sans tenir compte de l’armure et retire 1 énergie. Peut interrompre la capacité annoncée.'}:
            {name:'Frappe puissante',description:'Frappe à 165 %. Les créatures de feu ajoutent une brûlure de 2 tours.'};
        return {role:type,roleName:roles[type],cost:cost(card),hp:Math.round(76+.23*defense+3*rank+(type==='tank'?16:0)),attack:Math.round(22+.11*attack+rank+(type==='striker'?4:0)),armor:Math.round(2+.035*defense+(type==='tank'?3:0)),...ability,abilityCost:2,cooldown:2};
    }
    function support(card){
        const c=model(card),text=search(card),rank=cost(card)??7;
        let kind='energy';
        if(/water|eau|milk|lait|sponge|eponge|snowball|boule de neige/.test(text))kind='cleanse';
        else if(/tnt|fire_charge|charge de feu|end_crystal|cristal de l.end|firework|fusee/.test(text))kind='blast';
        else if(/potion|apple|pomme|bread|pain\b|carrot|carotte|potato|patate|beef|steak|porkchop|cotelette|chicken|poulet|rabbit|lapin|melon|pasteque|berries|baies|cookie|biscuit|cake|gateau|stew|soupe|honey|miel|cod|morue|salmon|saumon|beetroot|betterave/.test(text))kind='heal';
        else if(/sword|epee|axe|hache|bow|arc\b|trident|mace|masse|arrow|fleche/.test(text))kind='weapon';
        else if(normal(c.category)==='biomes'||/redstone|repeater|comparateur|comparator|lever|levier|torch|torche|clock|montre|amethyst|amethyste/.test(text))kind='energy';
        else if(['blocs','structures','equipement'].includes(normal(c.category))||/shield|bouclier|armor|armure/.test(text))kind='guard';
        const effects={heal:{name:'Ravitaillement',description:`Rend ${30+3*rank} PV au combattant actif.`},cleanse:{name:'Purification',description:`Retire la brûlure et rend ${18+2*rank} PV au combattant actif.`},blast:{name:'Explosion',description:`Inflige ${32+3*rank} dégâts avant armure ; la garde les atténue.`},guard:{name:'Abri',description:'Rend 8 PV et réduit de 65 % les dégâts reçus pendant ce tour.'},weapon:{name:'Armement',description:`Ajoute ${8+rank} dégâts à la prochaine attaque ou capacité offensive et rend 1 énergie.`},energy:{name:'Impulsion',description:'Rend 2 énergie et 8 PV ; rend la capacité immédiatement disponible.'}};
        return {kind,cost:cost(card),...effects[kind]};
    }
    function validate(fighters,supports=[]){
        if(fighters.length!==3)return 'Choisis exactement trois créatures.';
        if(supports.length>2)return 'Deux soutiens maximum sont autorisés.';
        const all=[...fighters,...supports];
        if(all.some(card=>!eligible(card)))return 'Une carte est indisponible ou ses données officielles sont incomplètes. Synchronise la collection.';
        if(fighters.some(card=>!creature(card))||supports.some(creature))return 'Les combattants doivent être des créatures et les soutiens appartenir aux autres catégories.';
        if(new Set(all.map(id)).size!==all.length)return 'Chaque carte ne peut apparaître qu’une seule fois.';
        if(all.reduce((sum,card)=>sum+cost(card),0)>limits.budget)return 'Cette équipe dépasse les 18 points disponibles.';
        return null;
    }
    // Recommandation éditoriale : statistiques normalisées, complémentarité des rôles,
    // effet du terrain et utilité des soutiens. Ce score ne simule pas un combat.
    function recommend(collection,arena='overworld',strategy='balanced',supportLimit=2){
        const unique=[...new Map(collection.filter(eligible).map(card=>[id(card),card])).values()];
        const individual=card=>{const s=fighter(card);return s.attack+s.hp*.2+s.armor*2+(arena==='nether'&&normal(model(card).dimension)==='nether'?20:0);};
        // Borne la recherche si le catalogue s'agrandit, en gardant des options de
        // chaque coût/rôle/dimension avant le classement global.
        const buckets=new Map();
        for(const card of unique.filter(creature)){
            const key=cost(card)+':'+role(card)+':'+normal(model(card).dimension),bucket=buckets.get(key)||[];
            bucket.push(card);bucket.sort((a,b)=>individual(b)-individual(a)||id(a).localeCompare(id(b)));buckets.set(key,bucket.slice(0,3));
        }
        const fighters=[...buckets.values()].flat().sort((a,b)=>individual(b)-individual(a)||id(a).localeCompare(id(b))).slice(0,120);
        if(fighters.length<3)return null;
        const utility=card=>{
            const s=support(card),base={heal:18,cleanse:arena==='nether'?30:14,blast:18,guard:19,weapon:16,energy:20}[s.kind];
            return base+((strategy==='offensive'&&['blast','weapon'].includes(s.kind))||(strategy==='defensive'&&['heal','guard'].includes(s.kind))||(strategy==='control'&&s.kind==='energy')?10:0);
        };
        const groups=new Map();
        for(const card of unique.filter(card=>!creature(card))){const key=support(card).kind+':'+cost(card);const group=groups.get(key)||[];if(group.length<2)group.push(card);groups.set(key,group);}
        const pool=[...groups.values()].flat();
        const combos=[{cards:[],cost:0,score:0}];
        if(supportLimit>0)for(let i=0;i<pool.length;i++){
            combos.push({cards:[pool[i]],cost:cost(pool[i]),score:utility(pool[i])});
            if(supportLimit>1)for(let j=i+1;j<pool.length;j++){
                const price=cost(pool[i])+cost(pool[j]);if(price<=18)combos.push({cards:[pool[i],pool[j]],cost:price,score:utility(pool[i])+utility(pool[j])+(support(pool[i]).kind!==support(pool[j]).kind?5:0)});
            }
        }
        const bestSupport=Array.from({length:19},(_,budget)=>combos.filter(c=>c.cost<=budget).sort((a,b)=>b.score-a.score||a.cost-b.cost)[0]);
        const stats=new Map(fighters.map(card=>[id(card),fighter(card)]));
        let best=null;
        for(let i=0;i<fighters.length-2;i++)for(let j=i+1;j<fighters.length-1;j++)for(let k=j+1;k<fighters.length;k++){
            const trio=[fighters[i],fighters[j],fighters[k]],price=trio.reduce((sum,card)=>sum+cost(card),0);
            if(price>18)continue;
            const extra=bestSupport[18-price],units=trio.map(card=>stats.get(id(card))),diversity=new Set(units.map(s=>s.role)).size;
            let score=units.reduce((sum,s)=>sum+(strategy==='offensive'?s.attack*1.6+s.hp*.1+s.armor:strategy==='defensive'?s.attack*.7+s.hp*.35+s.armor*3:s.attack+s.hp*.2+s.armor*2),0)+diversity*12+extra.score;
            if(arena==='nether')score+=trio.filter(card=>normal(model(card).dimension)==='nether').length*14;
            if(strategy==='control')score+=units.filter(s=>s.role==='trickster').length*18;
            if(!best||score>best.score)best={cards:trio,supports:extra.cards,teamCost:price+extra.cost,score};
        }
        if(!best)return null;
        const leadScore=card=>{const s=fighter(card);return (arena==='nether'&&normal(model(card).dimension)==='nether'?1000:0)+(strategy==='offensive'?s.attack*3:strategy==='control'&&s.role==='trickster'?500:s.role==='tank'?400:s.hp);};
        best.cards.sort((a,b)=>leadScore(b)-leadScore(a)||id(a).localeCompare(id(b)));
        return best;
    }
    return {limits,costs,roles,stances,environments,normal,model,id,cost,creature,eligible,fighter,support,validate,recommend};
});
