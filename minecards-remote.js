'use strict';

const BASE='https://minecards.vercel.app/api/v1/';
const fail=(status,message,quotaUntil=0)=>Object.assign(new Error(message),{status,quotaUntil});

// Lecture réseau pure : aucun verrou Redis n'est retenu par cette fonction.
async function fetchRemote(key,resource,params={}) {
    const url=new URL(resource,BASE);
    if(url.origin!=='https://minecards.vercel.app'||!url.pathname.startsWith('/api/v1/'))throw fail(400,'Route MineCards invalide.');
    for(const [name,value]of Object.entries(params))if(value!==''&&value!==undefined)url.searchParams.set(name,String(value));
    let response;
    try{response=await fetch(url,{headers:{Authorization:'Bearer '+key,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}
    catch{throw fail(502,'MineCards est momentanément inaccessible. La collection précédente est conservée.');}
    let quotaUntil=0;
    const remaining=response.headers.get('x-ratelimit-remaining'),reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
    if(remaining!==null&&Number(remaining)===0&&Number.isFinite(reset)&&reset>Date.now())quotaUntil=reset;
    if(response.status===429){
        const value=response.headers.get('retry-after'),seconds=value===null?NaN:Number(value),date=Date.parse(value||'');
        const retryAt=Number.isFinite(seconds)&&seconds>0?Date.now()+seconds*1000:Number.isFinite(date)&&date>Date.now()?date:Date.now()+60000;
        quotaUntil=Math.max(quotaUntil,retryAt);
        throw Object.assign(fail(429,'Quota MineCards atteint. La synchronisation reprendra après le délai indiqué.',quotaUntil),{retryAfter:Math.max(1,Math.ceil((quotaUntil-Date.now())/1000))});
    }
    if(response.status===401)throw fail(401,'La clé MineCards est invalide ou révoquée. Remplace-la dans la connexion.',quotaUntil);
    if(response.status===404)throw fail(404,'Ressource MineCards introuvable ou privée.',quotaUntil);
    if(response.status===503)throw fail(503,'Le service MineCards est temporairement indisponible.',quotaUntil);
    if(!response.ok)throw fail(response.status===400?400:502,'MineCards a refusé cette lecture (HTTP '+response.status+').',quotaUntil);
    let payload;try{payload=await response.json();}catch{throw fail(502,'Réponse MineCards invalide.',quotaUntil);}
    if(!payload||typeof payload!=='object'||!Object.hasOwn(payload,'data')||payload.data===null)throw fail(502,'Format MineCards non reconnu.',quotaUntil);
    const isList=['cards','me/cards','profiles','arenas','auctions','leaderboard'].includes(resource);
    if(isList){
        const p=payload.pagination,page=Number(params.page||1),limit=Number(params.limit||25);
        if(!Array.isArray(payload.data)||payload.data.length>limit||!p||p.page!==page||p.limit!==limit||typeof p.hasMore!=='boolean'||!(p.nextPage===null||(Number.isInteger(p.nextPage)&&p.nextPage===page+1&&p.nextPage<=1000))||(!p.hasMore&&p.nextPage!==null)||(p.hasMore&&p.nextPage===null&&page<1000))throw fail(502,'Pagination MineCards invalide. Les données précédentes sont conservées.',quotaUntil);
    }else if(typeof payload.data!=='object'||Array.isArray(payload.data))throw fail(502,'Détail MineCards invalide.',quotaUntil);
    return {payload,quotaUntil};
}

module.exports={fetchRemote};
