'use strict';
const crypto=require('crypto');
const storage=require('./storage');
const {fetchRemote}=require('./minecards-remote');
const lifetime=15*60*1000;
const jobProtocol=3;
const fingerprint=key=>crypto.createHash('sha256').update(key).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});

function createSyncEngine({readDb,readConnections,readBody,sendJson,getUserFromRequest,jobs,reserveRequest,applyQuota,saveCollection,status,collectionData}){
    const withState=action=>storage.isCloud?storage.transaction(action):Promise.resolve().then(action);
    function terminate(job,error){
        Object.assign(job,{running:false,phase:'error',error,updatedAt:new Date().toISOString()});
        delete job.items;delete job.lease;delete job.leaseUntil;delete job.fingerprint;
        return job;
    }
    function publicJob(job){
        if(!job)return null;
        if(job.running&&(job.protocol!==jobProtocol||Date.now()-Date.parse(job.startedAt)>lifetime))return {running:false,phase:'error',pages:job.pages||0,error:'Synchronisation interrompue. Relance-la pour lire un inventaire complet avec les finitions.'};
        const result={};
        for(const name of ['id','running','phase','pages','received','nextPage','startedAt','updatedAt','completedAt','durationMs','retryAt','error'])if(job[name]!==undefined)result[name]=job[name];
        result.nextPollMs=job.lease&&job.leaseUntil>Date.now()?350:job.retryAt?Math.max(0,Date.parse(job.retryAt)-Date.now()):0;
        return result;
    }
    function start(userId){
        const connection=readConnections()[userId];if(!connection)throw fail(400,'Connecte d’abord une clé MineCards.');
        const previous=jobs.get(userId);
        if(previous?.running&&previous.protocol===jobProtocol&&Date.now()-Date.parse(previous.startedAt)<lifetime&&previous.fingerprint===fingerprint(connection.key))return;
        const now=new Date().toISOString();
        jobs.set(userId,{protocol:jobProtocol,id:crypto.randomUUID(),running:true,phase:'ready',pages:0,received:0,nextPage:1,items:[],fingerprint:fingerprint(connection.key),startedAt:now,updatedAt:now,error:null,retries:0});
    }
    function response(userId,includeData=false){
        const state=status(userId);
        if(includeData){const user=readDb().users.find(user=>user.id===userId);if(user)state.data=collectionData(user);}
        return state;
    }
    function prepare(req,input){
        const user=getUserFromRequest(req,readDb());if(!user)throw fail(401,'Connexion requise.');
        const job=jobs.get(user.id),current=response(user.id);
        if(!job||job.id!==input.jobId||!job.running||job.nextPage!==input.page)return {state:current};
        if(job.protocol!==jobProtocol){terminate(job,'Relance la synchronisation pour importer les finitions standard et holographiques.');jobs.set(user.id,job);return {state:response(user.id)};}
        if(Date.now()-Date.parse(job.startedAt)>lifetime){terminate(job,'La synchronisation a expiré. Relance-la pour lire un inventaire complet.');jobs.set(user.id,job);return {state:response(user.id)};}
        const connection=readConnections()[user.id];
        if(!connection||fingerprint(connection.key)!==job.fingerprint){terminate(job,'La connexion a changé. Relance la synchronisation.');jobs.set(user.id,job);return {state:response(user.id)};}
        if(job.lease&&job.leaseUntil>Date.now())return {state:current};
        if(job.retryAt&&Date.parse(job.retryAt)>Date.now())return {state:current};
        let delay;
        try{delay=reserveRequest();}
        catch(error){if(error.status!==429)throw error;job.phase='waiting';job.retryAt=new Date(Date.now()+error.retryAfter*1000).toISOString();job.error=error.message;jobs.set(user.id,job);return {state:response(user.id)};}
        const lease=crypto.randomUUID();
        Object.assign(job,{lease,leaseUntil:Date.now()+delay+25000,phase:'fetching',retryAt:null,error:null,updatedAt:new Date().toISOString()});jobs.set(user.id,job);
        return {userId:user.id,jobId:job.id,page:job.nextPage,lease,key:connection.key,delay};
    }
    function finish(req,ticket,result,error){
        applyQuota(result||error);
        const user=getUserFromRequest(req,readDb());if(!user||user.id!==ticket.userId)throw fail(401,'La session a changé. Reconnecte-toi pour reprendre.');
        const job=jobs.get(user.id);
        // Le couple page/bail rend un retour réseau ancien inoffensif, même si
        // une instance a redémarré ou si plusieurs onglets reprennent le travail.
        if(!job||job.id!==ticket.jobId||job.lease!==ticket.lease||job.nextPage!==ticket.page)return response(user.id);
        delete job.lease;delete job.leaseUntil;
        const connection=readConnections()[user.id];
        if(!connection||fingerprint(connection.key)!==job.fingerprint){terminate(job,'La connexion a changé. La collection précédente est conservée.');jobs.set(user.id,job);return response(user.id);}
        if(error){
            const retryable=[429,502,503].includes(error.status)&&job.retries<2;
            if(retryable){job.retries++;job.phase='waiting';job.error=error.message;job.retryAt=new Date(Date.now()+Math.max((error.retryAfter||0)*1000,1000*2**job.retries)).toISOString();job.updatedAt=new Date().toISOString();}
            else terminate(job,error.message||'La synchronisation a échoué.');
            jobs.set(user.id,job);return response(user.id);
        }
        try{
            const payload=result.payload,seen=new Set(job.items.map(item=>item.cardId)),items=[];
            for(const item of payload.data){
                const card=item?.card;
                if(!card||typeof item.cardId!=='string'||!item.cardId||card.id!==item.cardId||!Number.isSafeInteger(item.quantity)||item.quantity<0||!Number.isSafeInteger(card.power)||seen.has(item.cardId))throw fail(502,'Inventaire MineCards incohérent. La collection précédente est conservée.');
                if(!Number.isSafeInteger(item.standardQuantity)||item.standardQuantity<0||!Number.isSafeInteger(item.holographicQuantity)||item.holographicQuantity<0||item.standardQuantity+item.holographicQuantity!==item.quantity||typeof card.isSecret!=='boolean'||(card.isSecret||card.rarity==='MYTHIQUE')&&item.standardQuantity!==0)throw fail(502,'Répartition standard / holographique incohérente. La collection précédente est conservée.');
                seen.add(item.cardId);
                const compact={};for(const field of ['id','name','nameEn','image','rarity','category','dimension','attack','defense','power','active','isSecret'])compact[field]=card[field];
                items.push({cardId:item.cardId,quantity:item.quantity,standardQuantity:item.standardQuantity,holographicQuantity:item.holographicQuantity,card:compact});
            }
            const pagination=payload.pagination;
            if(pagination.hasMore&&pagination.nextPage===null)throw fail(502,'La limite de pagination empêche un import complet. La collection précédente est conservée.');
            job.items.push(...items);job.pages++;job.received+=items.filter(item=>item.quantity>0).length;job.nextPage=pagination.nextPage;job.retries=0;job.retryAt=null;job.error=null;job.updatedAt=new Date().toISOString();
            if(pagination.nextPage===null){
                saveCollection(user.id,job.items.filter(item=>item.quantity>0),job.startedAt,job.pages);
                Object.assign(job,{running:false,phase:'complete',completedAt:new Date().toISOString(),durationMs:Date.now()-Date.parse(job.startedAt)});
                delete job.items;delete job.fingerprint;
                jobs.set(user.id,job);
                return response(user.id,true);
            }
            job.phase='ready';jobs.set(user.id,job);return response(user.id);
        }catch(failure){terminate(job,failure.message);jobs.set(user.id,job);return response(user.id);}
    }
    async function handleStep(req,res){
        const input=await readBody(req,2048);
        if(typeof input?.jobId!=='string'||!/^[a-f0-9-]{36}$/.test(input.jobId)||!Number.isSafeInteger(input.page)||input.page<1||input.page>1000)return sendJson(res,400,{error:'Étape de synchronisation invalide.'});
        const ticket=await withState(()=>prepare(req,input));
        if(ticket.state)return sendJson(res,200,ticket.state);
        if(ticket.delay>0)await new Promise(resolve=>setTimeout(resolve,ticket.delay));
        let result,error;
        try{result=await fetchRemote(ticket.key,'me/cards',{page:ticket.page,limit:100});}catch(failure){error=failure;}
        const state=await withState(()=>finish(req,ticket,result,error));
        return sendJson(res,200,state);
    }
    return {start,publicJob,handleStep};
}
module.exports={createSyncEngine};
