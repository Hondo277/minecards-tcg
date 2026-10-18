'use strict';
const crypto=require('crypto');
const storage=require('./storage');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const cardKey=card=>card._minecards?.cardId&&Number(card.id)<0?'mc:'+card._minecards.cardId:'local:'+card.id;

function collectionStats(cards){
    const groups=new Map(),remoteNames=new Set(),remoteIds=new Set(),localIds=new Set();
    for(const card of cards){
        const remote=card._minecards;
        if(!remote||typeof remote.cardId!=='string'||!Number.isSafeInteger(remote.quantity)||remote.quantity<1)continue;
        const key='mc:'+remote.cardId;groups.set(key,Math.max(groups.get(key)||0,remote.quantity));remoteNames.add(normalize(card.nom));remoteIds.add(remote.cardId);
    }
    for(const card of cards){
        if(card._minecards)continue;
        const name=normalize(card.nom),id=String(card.id),alias=({'cheval z':'zombie_horse','piglin z':'zombified_piglin','illusionnistes':'illusioner','debris antique':'ancient_debris'})[name];
        if(remoteNames.has(name)||alias&&remoteIds.has(alias)||localIds.has(id))continue;
        localIds.add(id);const key=alias?'mc:'+alias:'name:'+name;groups.set(key,(groups.get(key)||0)+1);
    }
    const quantities=[...groups.values()].filter(value=>value>0);
    return {unique:quantities.length,copies:quantities.reduce((sum,value)=>sum+value,0),duplicates:quantities.reduce((sum,value)=>sum+Math.max(0,value-1),0)};
}
function recordAudit(db,actor,action,target,details=''){
    const entry={id:crypto.randomUUID(),createdAt:new Date().toISOString(),actor:{id:actor.id,username:actor.username},action,target:target?{id:target.id,username:target.username}:null,details:String(details).slice(0,300)};
    db.auditLog=[entry,...(Array.isArray(db.auditLog)?db.auditLog:[])].slice(0,400);
}
function currentSessionHash(req){
    const match=(req.headers.cookie||'').match(/(?:^|;\s*)minecards_session=([a-f0-9]{64})(?:;|$)/);
    return match?crypto.createHash('sha256').update(match[1]).digest('hex'):null;
}
function createSession(userId,req,ttl){return {id:crypto.randomUUID(),userId,createdAt:new Date().toISOString(),expiresAt:Date.now()+ttl,client:String(req.headers['user-agent']||'Navigateur').slice(0,160)};}

function createWorkspace({readDb,writeDb,readBody,sendJson,getUserFromRequest,publicUser,sessions,minecards,collectionData}){
    async function objectBody(req,limit){const body=await readBody(req,limit);if(!body||typeof body!=='object'||Array.isArray(body))throw fail(400,'Un objet JSON est attendu.');return body;}
    const aliveSessions=userId=>[...sessions].filter(([,session])=>session.userId===userId&&session.expiresAt>Date.now());
    function revoke(userId,except=null){let count=0;for(const [hash,session]of sessions)if(session.userId===userId&&hash!==except){sessions.delete(hash);count++;}return count;}
    function member(db,id,actor){
        const target=db.users.find(item=>item.id===id);if(!target)throw fail(404,'Profil introuvable.');
        if(target.id===actor.id||target.role==='admin')throw fail(403,'Cette action est réservée aux comptes membres. Les administrateurs sont protégés.');
        return target;
    }
    function userSummary(item){
        const counts=collectionStats(collectionData(item).cards),remote=minecards.status(item.id);
        return {id:item.id,username:item.username,displayName:item.profile?.displayName||item.username,role:item.role||'user',suspended:!!item.suspended,suspensionReason:item.suspensionReason||'',createdAt:item.createdAt,lastLoginAt:item.lastLoginAt||null,cardCount:counts.unique,copyCount:counts.copies,duplicateCount:counts.duplicates,favoriteDeckCount:item.data?.favoriteDecks?.length||0,sessionCount:aliveSessions(item.id).length,connected:remote.configured,lastSync:remote.lastSync,syncJob:remote.job?{running:remote.job.running,phase:remote.job.phase,error:remote.job.error||null,pages:remote.job.pages||0}:null};
    }
    async function handle(req,res,url,user){
        if(url.pathname==='/api/site'&&req.method==='GET'){
            const settings=readDb().settings||{};
            sendJson(res,200,{message:settings.message||'',tone:settings.tone||'info',registrationsOpen:settings.registrationsOpen!==false});return true;
        }
        if(!user)return false;
        if(url.pathname==='/api/export'&&req.method==='GET'){
            const latest=readDb().users.find(item=>item.id===user.id);
            sendJson(res,200,{format:'minecards-personal-export',version:1,exportedAt:new Date().toISOString(),profile:publicUser(latest),data:collectionData(latest),notebook:latest.notebook||{}});return true;
        }
        if(url.pathname==='/api/notebook'){
            if(req.method==='GET'){sendJson(res,200,{entries:readDb().users.find(item=>item.id===user.id)?.notebook||{}});return true;}
            if(req.method==='PATCH'){
                const body=await objectBody(req,4096);
                if(typeof body.key!=='string'||!/^(mc|local):[a-zA-Z0-9_.:-]{1,120}$/.test(body.key)||typeof body.favorite!=='boolean'||typeof body.note!=='string'||body.note.length>600)throw fail(400,'Note invalide : 600 caractères maximum.');
                const db=readDb(),current=getUserFromRequest(req,db);if(!current)throw fail(401,'Connexion requise.');
                const entries={...(current.notebook||{})};
                if(!Object.hasOwn(entries,body.key)&&!collectionData(current).cards.some(card=>cardKey(card)===body.key))throw fail(404,'Cette carte ne figure pas dans ta collection.');
                const note=body.note.trim();
                if(body.favorite||note){if(!Object.hasOwn(entries,body.key)&&Object.keys(entries).length>=2000)throw fail(400,'La limite de 2 000 annotations est atteinte.');entries[body.key]={favorite:body.favorite,note,updatedAt:new Date().toISOString()};}
                else delete entries[body.key];
                current.notebook=entries;writeDb(db);sendJson(res,200,{entries});return true;
            }
        }
        if(url.pathname==='/api/sessions'&&req.method==='GET'){
            const hash=currentSessionHash(req);
            const list=aliveSessions(user.id).map(([key,session])=>{if(!session.id){session.id=crypto.randomUUID();sessions.set(key,session);}return {id:session.id,current:key===hash,createdAt:session.createdAt||null,expiresAt:new Date(session.expiresAt).toISOString(),client:session.client||'Session existante'};});
            sendJson(res,200,{sessions:list});return true;
        }
        if(url.pathname==='/api/sessions/revoke'&&req.method==='POST'){
            const body=await objectBody(req,1024),hash=currentSessionHash(req);let count=0;
            if(!getUserFromRequest(req,readDb()))throw fail(401,'Connexion requise.');
            if(body.others===true)count=revoke(user.id,hash);
            else if(typeof body.id==='string'){for(const [key,session]of aliveSessions(user.id))if(session.id===body.id&&key!==hash){sessions.delete(key);count++;}}
            else throw fail(400,'Session invalide.');
            sendJson(res,200,{ok:true,count});return true;
        }
        if(!url.pathname.startsWith('/api/admin/'))return false;
        if(user.role!=='admin')throw fail(403,'Accès réservé à l’administration.');
        if(url.pathname==='/api/admin/overview'&&req.method==='GET'){
            const db=readDb(),users=db.users.map(userSummary);
            sendJson(res,200,{users,stats:{profiles:users.length,members:users.filter(item=>item.role!=='admin').length,administrators:users.filter(item=>item.role==='admin').length,suspended:users.filter(item=>item.suspended).length,uniqueCards:users.reduce((sum,item)=>sum+item.cardCount,0),copies:users.reduce((sum,item)=>sum+item.copyCount,0),duplicates:users.reduce((sum,item)=>sum+item.duplicateCount,0),decks:users.reduce((sum,item)=>sum+item.favoriteDeckCount,0),sessions:users.reduce((sum,item)=>sum+item.sessionCount,0),connected:users.filter(item=>item.connected).length,syncing:users.filter(item=>item.syncJob?.running).length},storage:storage.isCloud?'Upstash Redis':'Fichiers locaux',settings:{message:db.settings?.message||'',tone:db.settings?.tone||'info',registrationsOpen:db.settings?.registrationsOpen!==false},generatedAt:new Date().toISOString()});return true;
        }
        if(url.pathname==='/api/admin/audit'&&req.method==='GET'){sendJson(res,200,{entries:readDb().auditLog||[]});return true;}
        if(url.pathname==='/api/admin/settings'&&req.method==='PATCH'){
            const body=await objectBody(req,4096);
            if(typeof body.message!=='string'||body.message.length>300||!['info','warning','success'].includes(body.tone)||typeof body.registrationsOpen!=='boolean')throw fail(400,'Réglages du site invalides.');
            const db=readDb(),actor=getUserFromRequest(req,db);if(actor?.role!=='admin')throw fail(403,'Accès réservé à l’administration.');
            db.settings={message:body.message.trim(),tone:body.tone,registrationsOpen:body.registrationsOpen};
            recordAudit(db,actor,'site.settings',null,body.registrationsOpen?'Inscriptions ouvertes':'Inscriptions fermées');writeDb(db);sendJson(res,200,{ok:true});return true;
        }
        const match=url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/(access|sessions\/revoke|bulk-delete)$/i);
        if(!match)return false;
        if(!((match[2]==='access'&&req.method==='PATCH')||(match[2]==='sessions/revoke'&&req.method==='POST')||(match[2]==='bulk-delete'&&req.method==='POST')))return false;
        const body=await objectBody(req,16384),db=readDb(),actor=getUserFromRequest(req,db);if(actor?.role!=='admin')throw fail(403,'Accès réservé à l’administration.');
        const target=member(db,match[1],actor);
        if(match[2]==='access'){
            if(typeof body.suspended!=='boolean'||typeof body.reason!=='string'||body.reason.length>240)throw fail(400,'Statut ou motif invalide.');
            target.suspended=body.suspended;target.suspensionReason=body.suspended?body.reason.trim():'';
            const count=body.suspended?revoke(target.id):0;
            recordAudit(db,actor,body.suspended?'user.suspend':'user.reactivate',target,target.suspensionReason);writeDb(db);sendJson(res,200,{ok:true,count});return true;
        }
        if(match[2]==='sessions/revoke'){
            const count=revoke(target.id);recordAudit(db,actor,'user.sessions.revoke',target,count+' session(s)');writeDb(db);sendJson(res,200,{ok:true,count});return true;
        }
        if(!['cards','decks'].includes(body.kind)||!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>100||body.ids.some(id=>typeof id!=='string'||id.length>100)||new Set(body.ids).size!==body.ids.length)throw fail(400,'Sélection invalide : de 1 à 100 éléments différents.');
        const field=body.kind==='cards'?'cards':'favoriteDecks',records=target.data?.[field]||[],ids=new Set(body.ids);
        const selected=records.filter(item=>ids.has(String(item.id)));
        if(selected.length!==ids.size||body.kind==='cards'&&selected.some(card=>card._minecards||Number(card.id)<0))throw fail(409,'La sélection a changé ou contient une carte MineCards protégée. Recharge le profil.');
        target.data[field]=records.filter(item=>!ids.has(String(item.id)));
        target.dataRevision=(target.dataRevision||0)+1;
        if(body.kind==='decks'&&ids.has(target.profile?.featuredDeckId))target.profile.featuredDeckId='';
        recordAudit(db,actor,'records.delete',target,body.kind+' : '+selected.length+' élément(s)');writeDb(db);sendJson(res,200,{ok:true,count:selected.length});return true;
    }
    return {handle,revoke,userSummary};
}
module.exports={createWorkspace,recordAudit,createSession};
