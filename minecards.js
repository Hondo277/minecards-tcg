'use strict';
const fs = require('fs');
const path = require('path');
const storage = require('./storage');
const ArenaRules = require('./arena-rules');
const {fetchRemote}=require('./minecards-remote');
const {createSyncEngine}=require('./minecards-sync');
const API_VERSION = '1.1.0';
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
    for(const deck of user.data?.favoriteDecks||[])for(const card of [...(deck.cards||[]),...(deck.supports||[])])refresh(card);
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
        if(card._minecards)Object.assign(card._minecards,{power:source.power,category:source.category,dimension:source.dimension,attack:source.attack,defense:source.defense,active:source.active,rarity:source.rarity,nameEn:source.nameEn});
    };
    for(const card of user.data?.cards||[])refresh(card);
    for(const card of user.minecards?.cards||[])refresh(card);
    for(const deck of user.data?.favoriteDecks||[]){
        for(const card of [...(deck.cards||[]),...(deck.supports||[])])refresh(card);
        const total=(deck.cards||[]).reduce((sum,card)=>sum+(Number(card.valeur)||0),0);
        if(deck.totalPower!==total){deck.totalPower=total;updatedDecks++;}
        if(deck.mode==='arena'){
            const costs=[...(deck.cards||[]),...(deck.supports||[])].map(ArenaRules.cost);
            deck.teamCost=costs.every(Number.isSafeInteger)?costs.reduce((sum,cost)=>sum+cost,0):null;
        }
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
        if (existing) { existing._minecards = remote._minecards;existing.valeur=remote.valeur;if(remote.image)existing.image=remote.image; }
        else cards.push({...remote});
    }
    return {...local,cards};
}
function localData(data) {
    if (!data || !Array.isArray(data.cards)) return data;
    return {...data,cards:data.cards.filter(card=>!(card?._minecards && Number(card.id)<0)).map(card=>{const copy={...card};delete copy._minecards;return copy;})};
}

function createMinecards({readDb,writeDb,readBody,sendJson,getUserFromRequest}) {
    const localJobs = new Map();
    const jobs = {get:id=>storage.isCloud?storage.currentState().jobs?.[id]:localJobs.get(id),set:(id,value)=>{if(storage.isCloud){const state=storage.currentState();state.jobs||={};state.jobs[id]=value;}else localJobs.set(id,value);}};
    let queue=Promise.resolve(), lastRequest=0, blockedUntil=0;
    function limiter(){return storage.isCloud?(storage.currentState().limiter||{}):{lastRequest,blockedUntil};}
    function saveLimiter(value){if(storage.isCloud)storage.currentState().limiter=value;else{lastRequest=value.lastRequest;blockedUntil=value.blockedUntil;}}
    function reserveRequest(){
        const state=limiter(),now=Date.now();
        if(state.blockedUntil>now)throw Object.assign(fail(429,'Quota MineCards atteint. Reprise automatique après le délai du service.'),{retryAfter:Math.ceil((state.blockedUntil-now)/1000)});
        const start=Math.max(now,(state.lastRequest||0)+1100);
        saveLimiter({lastRequest:start,blockedUntil:state.blockedUntil||0});
        return start-now;
    }
    function applyQuota(observation){const state=limiter();saveLimiter({lastRequest:state.lastRequest||0,blockedUntil:Math.max(state.blockedUntil||0,observation?.quotaUntil||0)});}
    async function request(userId,resource,params={},providedKey=null){
        const connection=providedKey?{key:providedKey}:readConnections()[userId];
        if(!connection)throw fail(400,'Connecte une clé MineCards dans cet espace.');
        const task=queue.catch(()=>{}).then(async()=>{
            const delay=reserveRequest();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
            try{const result=await fetchRemote(connection.key,resource,params);applyQuota(result);return result.payload;}
            catch(error){applyQuota(error);throw error;}
        });
        queue=task;return task;
    }
    function status(userId) {
        const user=readDb().users.find(u=>u.id===userId);
        const connection=readConnections()[userId];
        return {configured:!!connection,apiVersion:API_VERSION,lastSync:user?.minecards?.syncedAt||null,uniqueCards:user?.minecards?.cards?.length||0,totalCards:(user?.minecards?.cards||[]).reduce((sum,c)=>sum+c._minecards.quantity,0),dataRevision:user?.dataRevision||0,job:syncEngine.publicJob(jobs.get(userId)),readOnly:true,syncProtocol:2,autoSyncMs:30000};
    }
    function saveSyncedCollection(userId,items,startedAt,pages){
        const db=readDb(),user=db.users.find(u=>u.id===userId);
        if(!user)throw fail(404,'Profil local introuvable.');
        const previous=new Map((user.minecards?.cards||[]).map(c=>[c._minecards.cardId,c.id]));
        const previousCards=new Map((user.minecards?.cards||[]).map(c=>[c._minecards.cardId,c]));
        let nextId=Math.min(0,...previous.values())-1;
        const imported=items.map(item=>{
            const c=item.card,attack=Number(c.attack)||0,defense=Number(c.defense)||0;
            const prior=previousCards.get(item.cardId);
            if(!Number.isSafeInteger(c.power))throw fail(502,'La puissance officielle manque dans une carte MineCards. La synchronisation est annulée pour conserver les valeurs précédentes.');
            return {id:previous.get(item.cardId)??nextId--,nom:String(c.name||item.cardId),rarete:RARITIES[c.rarity]||'Non classée',attaque:prior?.attaque??attack,defense:prior?.defense??defense,valeur:c.power,image:typeof c.image==='string'&&c.image?c.image:(prior?.image||''),_minecards:{cardId:item.cardId,quantity:item.quantity,power:c.power,category:c.category,dimension:c.dimension,attack:c.attack,defense:c.defense,active:c.active,rarity:c.rarity,nameEn:c.nameEn}};
        });
        user.minecards={cards:imported,syncedAt:new Date().toISOString(),lastDurationMs:Date.now()-Date.parse(startedAt),lastPages:pages};
        updateCardImages(user,items.map(item=>item.card));
        updateCardPowers(user,items.map(item=>item.card));
        writeDb(db);
    }
    const syncEngine=createSyncEngine({readDb,readConnections,readBody,sendJson,getUserFromRequest,jobs,reserveRequest,applyQuota,saveCollection:saveSyncedCollection,status,collectionData});
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
            syncEngine.start(user.id);
            return sendJson(res,202,status(user.id));
        }
        const match=route.match(/^explore\/(cards|collection|boosters|profiles|arenas|auctions|leaderboard)(?:\/([^/]+))?$/);
        if(req.method==='GET'&&match){
            const [,resource,id]=match;
            if(id&&!['cards','profiles','arenas','auctions'].includes(resource))return sendJson(res,400,{error:'Cette route ne possède pas de détail.'});
            const allowed=new Set(id||resource==='boosters'?[]:['page','limit',...ROUTES[resource]]);
            const params={};
            for(const [key,value]of url.searchParams){if(!allowed.has(key)||Object.hasOwn(params,key)||!value.trim()||value.length>100)return sendJson(res,400,{error:'Paramètre MineCards invalide.'});params[key]=value;}
            if(params.rarity&&!Object.hasOwn(RARITIES,params.rarity))return sendJson(res,400,{error:'Rareté MineCards invalide.'});
            if(params.status&&!['ACTIVE','SOLD','EXPIRED','CANCELLED','ALL'].includes(params.status))return sendJson(res,400,{error:'Statut d’enchère MineCards invalide.'});
            if(!id&&resource!=='boosters'){params.page=params.page||'1';params.limit=params.limit||'25';if(!/^\d+$/.test(params.page)||+params.page<1||+params.page>1000||!/^\d+$/.test(params.limit)||+params.limit<1||+params.limit>100)return sendJson(res,400,{error:'Pagination invalide.'});}
            let decodedId;
            if(id){try{decodedId=decodeURIComponent(id);}catch{return sendJson(res,400,{error:'Identifiant MineCards invalide.'});}if(!decodedId.trim()||decodedId.length>100||/[\u0000-\u001f\u007f/\\]/.test(decodedId)||['.','..'].includes(decodedId))return sendJson(res,400,{error:'Identifiant MineCards invalide.'});}
            const remote=(REMOTE[resource]||resource)+(id?'/'+encodeURIComponent(decodedId):'');
            return sendJson(res,200,await request(user.id,remote,params));
        }
        return sendJson(res,404,{error:'Route de connexion introuvable.'});
    }
    function forget(userId){const connections=readConnections();delete connections[userId];writeConnections(connections);jobs.set(userId,{running:false,phase:'idle',pages:0,error:null});}
    return {handle,sync:syncEngine.start,step:syncEngine.handleStep,status,request,forget};
}
module.exports={createMinecards,collectionData,localData,updateCardImages,updateCardPowers};
