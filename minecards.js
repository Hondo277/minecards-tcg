'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storage = require('./storage');
const BASE = 'https://minecards.vercel.app/api/v1/';
const KEY_FILE = path.join(__dirname, 'data', 'minecards-connections.json');
const ROUTES = { cards:['q','rarity','category','dimension'], collection:['q','rarity','category','dimension'], boosters:[], profiles:['q'], arenas:[], auctions:['status'], leaderboard:[] };
const REMOTE = {collection:'me/cards',boosters:'me/boosters'};
const RARITIES = { CHARBON:'Charbon', CUIVRE:'Cuivre', FER:'Fer', OR:'Or', DIAMANT:'Diamant', NETHERITE:'Netherite' };
const fail = (status, message) => Object.assign(new Error(message), {status});
function readConnections() { if(storage.isCloud)return structuredClone(storage.currentState().connections); return fs.existsSync(KEY_FILE) ? JSON.parse(fs.readFileSync(KEY_FILE,'utf8')) : {}; }
function writeConnections(value) { if(storage.isCloud){storage.currentState().connections=structuredClone(value);return;} fs.writeFileSync(KEY_FILE+'.tmp',JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(KEY_FILE+'.tmp',KEY_FILE); }
const normalize = value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
// Noms du catalogue local historique, reliés aux identifiants stables de l'API.
const LEGACY_CARD_IDS = {
    'cheval z':'zombie_horse',
    'piglin z':'zombified_piglin',
    'illusionnistes':'illusioner',
    'debris antique':'ancient_debris'
};

function updateCardImages(user,catalog) {
    const byId=new Map(catalog.map(card=>[card.id,card]));
    const byName=new Map(catalog.map(card=>[normalize(card.name),card]));
    let updated=0,missing=0;
    const refresh=card=>{
        const source=byId.get(card._minecards?.cardId||LEGACY_CARD_IDS[normalize(card.nom)])||byName.get(normalize(card.nom));
        if(source&&typeof source.image==='string'&&/^https:\/\//.test(source.image)){
            if(card.image!==source.image){card.image=source.image;updated++;}
        }else missing++;
    };
    for(const card of user.data?.cards||[])refresh(card);
    for(const deck of user.data?.favoriteDecks||[])for(const card of deck.cards||[])refresh(card);
    for(const card of user.minecards?.cards||[])refresh(card);
    return {updated,missing};
}

function updateCardPowers(user,catalog) {
    const byId=new Map(catalog.map(card=>[card.id,card]));
    const byName=new Map(catalog.map(card=>[normalize(card.name),card]));
    let updated=0,missing=0,updatedDecks=0;
    const refresh=card=>{
        const source=byId.get(card._minecards?.cardId||LEGACY_CARD_IDS[normalize(card.nom)])||byName.get(normalize(card.nom));
        if(!source||!Number.isSafeInteger(source.power)){missing++;return;}
        if(card.valeur!==source.power){card.valeur=source.power;updated++;}
    };
    for(const card of user.data?.cards||[])refresh(card);
    for(const card of user.minecards?.cards||[])refresh(card);
    for(const deck of user.data?.favoriteDecks||[]){
        for(const card of deck.cards||[])refresh(card);
        const total=(deck.cards||[]).reduce((sum,card)=>sum+(Number(card.valeur)||0),0);
        if(deck.totalPower!==total){deck.totalPower=total;updatedDecks++;}
        if(Object.hasOwn(deck,'diff')&&Number.isFinite(deck.targetPower))deck.diff=Math.abs(total-deck.targetPower);
    }
    return {updated,missing,updatedDecks};
}

function collectionData(user) {
    const local = user.data || {cards:[],favoriteDecks:[]};
    const cards = (local.cards || []).map(card=>({...card}));
    const matches = new Map(cards.map(card=>[normalize(card.nom),card]));
    const byRemoteId = new Map(cards.map(card=>[card._minecards?.cardId || LEGACY_CARD_IDS[normalize(card.nom)],card]).filter(([id])=>id));
    for (const remote of user.minecards?.cards || []) {
        const existing = byRemoteId.get(remote._minecards.cardId) || matches.get(normalize(remote.nom));
        if (existing) { existing._minecards = remote._minecards;if(remote.image)existing.image=remote.image; }
        else cards.push({...remote});
    }
    return {...local,cards};
}
function localData(data) {
    if (!data || !Array.isArray(data.cards)) return data;
    return {...data,cards:data.cards.filter(card=>!(card?._minecards && Number(card.id)<0)).map(card=>{const copy={...card};delete copy._minecards;return copy;})};
}

function createMinecards({readDb,writeDb,readBody,sendJson,getUserFromRequest}) {
    const localJobs = new Map(), cache = new Map();
    const jobs = {get:id=>storage.isCloud?storage.currentState().jobs?.[id]:localJobs.get(id),set:(id,value)=>{if(storage.isCloud){const state=storage.currentState();state.jobs||={};state.jobs[id]=value;}else localJobs.set(id,value);}};
    let queue=Promise.resolve(), lastRequest=0, blockedUntil=0;
    async function request(userId,resource,params={},providedKey=null) {
        const connection=providedKey ? {key:providedKey} : readConnections()[userId];
        if (!connection) throw fail(400,'Connecte une clé MineCards dans cet espace.');
        const fingerprint=crypto.createHash('sha256').update(connection.key).digest('hex');
        const cacheKey=userId+':'+fingerprint+':'+resource+':'+JSON.stringify(params);
        const cached=cache.get(cacheKey);
        if(cached && cached.until>Date.now())return cached.payload;
        const task=queue.catch(()=>{}).then(async()=>{
            if(storage.isCloud){const limiter=storage.currentState().limiter||{};lastRequest=limiter.lastRequest||0;blockedUntil=limiter.blockedUntil||0;}
            if(blockedUntil>Date.now())throw fail(429,'Quota MineCards atteint. Réessaie dans '+Math.ceil((blockedUntil-Date.now())/1000)+' secondes.');
            const delay=lastRequest+1100-Date.now();
            if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
            lastRequest=Date.now();
            if(storage.isCloud)storage.currentState().limiter={lastRequest,blockedUntil};
            const url=new URL(resource,BASE);
            if(url.origin!=='https://minecards.vercel.app'||!url.pathname.startsWith('/api/v1/'))throw fail(400,'Route MineCards invalide.');
            for(const [key,value]of Object.entries(params))if(value!==''&&value!==undefined)url.searchParams.set(key,String(value));
            let response;
            try { response=await fetch(url,{headers:{Authorization:'Bearer '+connection.key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)}); }
            catch { throw fail(502,'MineCards est momentanément inaccessible. Les données locales sont conservées.'); }
            if(response.status===429){const seconds=Number(response.headers.get('retry-after'));blockedUntil=Date.now()+(Number.isFinite(seconds)&&seconds>0?seconds:60)*1000;if(storage.isCloud)storage.currentState().limiter={lastRequest,blockedUntil};throw fail(429,'Quota MineCards atteint. Réessaie après le délai indiqué par le service.');}
            if(response.status===401)throw fail(401,'La clé MineCards est invalide ou révoquée. Remplace-la dans la connexion.');
            if(response.status===404)throw fail(404,'Ressource MineCards introuvable ou privée.');
            if(!response.ok)throw fail(response.status===400?400:502,'MineCards a refusé cette lecture (HTTP '+response.status+').');
            let payload;try{payload=await response.json();}catch{throw fail(502,'Réponse MineCards invalide.');}
            if(!payload||!Object.hasOwn(payload,'data'))throw fail(502,'Format MineCards non reconnu.');
            cache.set(cacheKey,{payload,until:Date.now()+30000});
            if(cache.size>300)cache.delete(cache.keys().next().value);
            return payload;
        });
        queue=task;
        return task;
    }
    function status(userId) {
        const user=readDb().users.find(u=>u.id===userId);
        const connection=readConnections()[userId];
        return {configured:!!connection,apiVersion:'1.1.0',lastSync:user?.minecards?.syncedAt||null,uniqueCards:user?.minecards?.cards?.length||0,totalCards:(user?.minecards?.cards||[]).reduce((sum,c)=>sum+c._minecards.quantity,0),job:jobs.get(userId)||null,readOnly:true};
    }
    async function sync(userId) {
        if(jobs.get(userId)?.running)return;
        const started=Date.now();
        const connection=readConnections()[userId];
        if(!connection)throw fail(400,'Aucune connexion MineCards.');
        jobs.set(userId,{running:true,pages:0,error:null,startedAt:new Date(started).toISOString()});
        try {
            const owned=new Map();let page=1;
            do {
                if(storage.isCloud&&Date.now()-started>200000)throw fail(504,'La synchronisation a dépassé le délai disponible. La collection précédente est conservée.');
                const payload=await request(userId,'me/cards',{page,limit:100});
                if(!Array.isArray(payload.data))throw fail(502,'Collection MineCards invalide.');
                for(const item of payload.data){
                    if(!item?.card||typeof item.cardId!=='string'||!Number.isSafeInteger(item.quantity)||item.quantity<0)throw fail(502,'Carte MineCards invalide.');
                    if(item.quantity>0)owned.set(item.cardId,item);
                }
                jobs.get(userId).pages++;
                const next=payload.pagination?.nextPage;
                if(next==null){if(payload.pagination?.hasMore)throw fail(502,'Pagination MineCards incomplète.');break;}
                if(!Number.isSafeInteger(next)||next<=page||next>1000)throw fail(502,'Pagination MineCards invalide.');
                page=next;
            }while(true);
            const latestConnection=readConnections()[userId];
            if(!latestConnection||latestConnection.key!==connection.key)throw fail(409,'La connexion a changé pendant la synchronisation.');
            const db=readDb(),user=db.users.find(u=>u.id===userId);
            if(!user)throw fail(404,'Profil local introuvable.');
            const previous=new Map((user.minecards?.cards||[]).map(c=>[c._minecards.cardId,c.id]));
            const previousCards=new Map((user.minecards?.cards||[]).map(c=>[c._minecards.cardId,c]));
            let nextId=Math.min(0,...previous.values())-1;
            const imported=[...owned.values()].map(item=>{
                const c=item.card,attack=Number(c.attack)||0,defense=Number(c.defense)||0;
                const prior=previousCards.get(item.cardId);
                if(!Number.isSafeInteger(c.power))throw fail(502,'La puissance officielle manque dans une carte MineCards. La synchronisation est annulée pour conserver les valeurs précédentes.');
                return {id:previous.get(item.cardId)??nextId--,nom:String(c.name||item.cardId),rarete:RARITIES[c.rarity]||'Non classée',attaque:prior?.attaque??attack,defense:prior?.defense??defense,valeur:c.power,image:typeof c.image==='string'&&c.image?c.image:(prior?.image||''),_minecards:{cardId:item.cardId,quantity:item.quantity}};
            });
            user.minecards={cards:imported,syncedAt:new Date().toISOString()};
            updateCardImages(user,[...owned.values()].map(item=>item.card));
            updateCardPowers(user,[...owned.values()].map(item=>item.card));
            writeDb(db);
            jobs.set(userId,{running:false,pages:jobs.get(userId).pages,error:null,completedAt:user.minecards.syncedAt});
        } catch(error){jobs.set(userId,{running:false,pages:jobs.get(userId)?.pages||0,error:error.message});throw error;}
    }
    async function handle(req,res,url,user) {
        const route=url.pathname.replace('/api/minecards/','');
        if(req.method==='GET'&&route==='status')return sendJson(res,200,status(user.id));
        if(req.method==='POST'&&route==='connect'){
            const body=await readBody(req,2048);
            if(typeof body.key!=='string'||!/^mc_live_[A-Za-z0-9_-]{20,200}$/.test(body.key.trim()))return sendJson(res,400,{error:'Format de clé MineCards invalide.'});
            await request(user.id,'me/boosters',{},body.key.trim());
            const latest=readDb();if(!getUserFromRequest(req,latest))return sendJson(res,401,{error:'Connexion requise.'});
            const connections=readConnections();connections[user.id]={key:body.key.trim(),connectedAt:new Date().toISOString()};writeConnections(connections);
            return sendJson(res,200,status(user.id));
        }
        if(req.method==='POST'&&route==='disconnect'){
            forget(user.id);
            return sendJson(res,200,status(user.id));
        }
        if(req.method==='POST'&&route==='sync'){
            if(!readConnections()[user.id])return sendJson(res,400,{error:'Connecte d’abord une clé MineCards.'});
            if(storage.isCloud) await sync(user.id);
            else if(!jobs.get(user.id)?.running)void sync(user.id).catch(()=>{});
            return sendJson(res,storage.isCloud?200:202,status(user.id));
        }
        const match=route.match(/^explore\/(cards|collection|boosters|profiles|arenas|auctions|leaderboard)(?:\/([^/]+))?$/);
        if(req.method==='GET'&&match){
            const [,resource,id]=match;
            if(id&&!['cards','profiles','arenas','auctions'].includes(resource))return sendJson(res,400,{error:'Cette route ne possède pas de détail.'});
            const allowed=new Set(id||resource==='boosters'?[]:['page','limit',...ROUTES[resource]]);
            const params={};
            for(const [key,value]of url.searchParams){if(!allowed.has(key)||Object.hasOwn(params,key)||value.length>100)return sendJson(res,400,{error:'Paramètre MineCards invalide.'});params[key]=value;}
            if(!id&&resource!=='boosters'){params.page=params.page||'1';params.limit=params.limit||'25';if(!/^\d+$/.test(params.page)||+params.page<1||+params.page>1000||!/^\d+$/.test(params.limit)||+params.limit<1||+params.limit>100)return sendJson(res,400,{error:'Pagination invalide.'});}
            const remote=(REMOTE[resource]||resource)+(id?'/'+encodeURIComponent(decodeURIComponent(id)):'');
            return sendJson(res,200,await request(user.id,remote,params));
        }
        return sendJson(res,404,{error:'Route de connexion introuvable.'});
    }
    function forget(userId){const connections=readConnections();delete connections[userId];writeConnections(connections);for(const key of cache.keys())if(key.startsWith(userId+':'))cache.delete(key);}
    return {handle,sync,status,request,forget};
}
module.exports={createMinecards,collectionData,localData,updateCardImages,updateCardPowers};
