'use strict';
const {AsyncLocalStorage} = require('async_hooks');
const crypto = require('crypto');

const context = new AsyncLocalStorage();
const isCloud = process.env.VERCEL === '1';
const namespace = process.env.MINECARDS_STORAGE_PREFIX || 'minecards:production';
const stateKey = namespace + ':state';
const lockKey = namespace + ':lock';
const storageError = message => Object.assign(new Error(message), {status:503});

async function redis(command) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token || !url.startsWith('https://')) throw storageError('Configure le stockage Upstash avant de mettre le site en service.');
    let response;
    try {
        response = await fetch(url.replace(/\/$/, ''), {
            method:'POST', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'},
            body:JSON.stringify(command), signal:AbortSignal.timeout(12000), redirect:'error'
        });
    } catch { throw storageError('Le stockage est momentanément inaccessible. Aucune sauvegarde confirmée.'); }
    if (!response.ok) throw storageError('Le stockage a refusé la requête.');
    const payload = await response.json();
    if (payload.error) throw storageError('Le stockage a signalé une erreur.');
    return payload.result;
}

function currentState() {
    const state = context.getStore();
    if (!state) throw storageError('Contexte de stockage indisponible.');
    return state;
}

// Maps liées à la requête : sessions et limitations survivent aux changements d’instance.
function persistentMap(field) {
    const local = new Map();
    const target = () => isCloud ? currentState()[field] : local;
    return {
        get:key => target().get(key), set:(key,value) => target().set(key,field==='loginFailures'?{...value,updatedAt:Date.now()}:value),
        delete:key => target().delete(key),
        [Symbol.iterator]:() => target()[Symbol.iterator]()
    };
}

function serialize(state) {
    return JSON.stringify({...state, sessions:[...state.sessions], loginFailures:[...state.loginFailures]});
}

async function transaction(action) {
    const owner = crypto.randomUUID();
    let locked = false;
    // Une seule transaction à la fois, même sur plusieurs instances Vercel.
    for (let attempt=0; attempt<20; attempt++) {
        if (await redis(['SET',lockKey,owner,'NX','PX',270000])) { locked=true; break; }
        await new Promise(resolve=>setTimeout(resolve,150));
    }
    if (!locked) throw storageError('Une opération est en cours. Réessaie dans quelques secondes.');
    try {
        const raw = await redis(['GET',stateKey]);
        if (!raw) throw storageError('Importe les comptes locaux dans le stockage avant la première connexion.');
        const state = JSON.parse(raw);
        if (state.version!==1 || !Array.isArray(state.db?.users) || !state.connections) throw storageError('Format du stockage invalide.');
        state.sessions = new Map(state.sessions || []);
        state.loginFailures = new Map(state.loginFailures || []);
        for (const [key,session] of state.sessions) if (session.expiresAt<Date.now()) state.sessions.delete(key);
        for (const [key,failure] of state.loginFailures) if ((failure.until||0)<Date.now() && (failure.updatedAt||0)<Date.now()-86400000) state.loginFailures.delete(key);
        const result = await context.run(state,action);
        const committed = await redis(['EVAL',
            "if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2]) redis.call('DEL',KEYS[1]) return 1",
            2,lockKey,stateKey,owner,serialize(state)]);
        if (committed!==1) throw storageError('La sauvegarde a expiré. Recharge la page avant de réessayer.');
        locked=false;
        return result;
    } finally {
        if (locked) await redis(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lockKey,owner]).catch(()=>{});
    }
}

module.exports = {isCloud,currentState,persistentMap,transaction,redis,stateKey};
