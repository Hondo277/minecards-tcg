'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storage = require('./storage');
const { promisify } = require('util');
const { createMinecards, collectionData, localData, updateCardImages, updateCardPowers } = require('./minecards');
const ArenaRules = require('./arena-rules');
const {createWorkspace,recordAudit,createSession}=require('./workspace-service');

const scrypt = promisify(crypto.scrypt);
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'accounts.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = storage.persistentMap('sessions');
const loginFailures = storage.persistentMap('loginFailures');
const MIME_TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

if (!storage.isCloud) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!storage.isCloud && !fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }, null, 2), { mode: 0o600 });

function readDb() {
    if (storage.isCloud) return structuredClone(storage.currentState().db);
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!Array.isArray(db.users)) throw new Error('Format invalide');
        return db;
    } catch (error) {
        throw new Error('La base des profils est illisible : ' + error.message);
    }
}

function writeDb(db) {
    if (storage.isCloud) { storage.currentState().db = structuredClone(db); return; }
    const temp = DB_FILE + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(temp, DB_FILE);
}

function sendJson(res, status, payload, extraHeaders = {}) {
    res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extraHeaders });
    res.end(JSON.stringify(payload));
}

function sendApiError(res,error) {
    const retryAfter=Number.isSafeInteger(error.retryAfter)&&error.retryAfter>0?error.retryAfter:null;
    sendJson(res,error.status||500,{error:error.status?error.message:'Erreur interne du serveur.',...(retryAfter?{retryAfter}:{})},retryAfter?{'Retry-After':String(retryAfter)}:{});
}

function readBody(req, maxBytes = 4 * 1024 * 1024) {
    if (req.body !== undefined) {
        try {
            const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
            if (Buffer.byteLength(JSON.stringify(body)) > Math.min(maxBytes, 4 * 1024 * 1024)) throw Object.assign(new Error('Requête trop volumineuse.'), {status:413});
            return Promise.resolve(body || {});
        } catch (error) { return Promise.reject(error.status ? error : Object.assign(new Error('JSON invalide.'), {status:400})); }
    }
    maxBytes = Math.min(maxBytes, 4 * 1024 * 1024);
    return new Promise((resolve, reject) => {
        let body = '';
        let bytes = 0;
        req.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > maxBytes) {
                reject(Object.assign(new Error('Requête trop volumineuse.'), { status:413 }));
                req.destroy();
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { reject(Object.assign(new Error('JSON invalide.'), { status:400 })); }
        });
        req.on('error', reject);
    });
}

function sessionCookie(token) {
    return `minecards_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${storage.isCloud ? '; Secure' : ''}`;
}

function getUserFromRequest(req, db) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/(?:^|;\s*)minecards_session=([a-f0-9]{64})(?:;|$)/);
    if (!match) return null;
    const tokenHash = crypto.createHash('sha256').update(match[1]).digest('hex');
    const session = sessions.get(tokenHash);
    if (!session || session.expiresAt < Date.now()) {
        sessions.delete(tokenHash);
        return null;
    }
    return db.users.find(user => user.id === session.userId&&!user.suspended) || null;
}

const PROFILE_AVATARS = ['cube', 'dragon', 'leaf', 'shield', 'wizard', 'paw', 'gem', 'bolt'];
const PROFILE_ACCENTS = ['lime', 'amber', 'cyan', 'violet'];
function validProfileImage(value, maxBytes) {
    if (value === '') return true;
    if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4 + 40) return false;
    const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[2].length % 4 !== 0) return false;
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > maxBytes) return false;
    if (match[1] === 'jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (match[1] === 'png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    return bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
}
function publicUser(user) {
    return { id:user.id, username:user.username, role:user.role || 'user', createdAt:user.createdAt,
        profile:{ displayName:user.profile?.displayName || user.username, bio:user.profile?.bio || '',
            avatar:PROFILE_AVATARS.includes(user.profile?.avatar) ? user.profile.avatar : 'cube',
            accent:PROFILE_ACCENTS.includes(user.profile?.accent) ? user.profile.accent : 'lime',
            avatarImage:user.profile?.avatarImage || '', bannerImage:user.profile?.bannerImage || '',
            featuredDeckId:user.profile?.featuredDeckId || '' } };
}

function validData(data) {
    return data && Array.isArray(data.cards) && data.cards.length <= 1000 &&
        Array.isArray(data.favoriteDecks) && data.favoriteDecks.length <= 500 &&
        data.cards.every(card => card && typeof card.nom === 'string' && card.nom.length <= 120) &&
        data.favoriteDecks.every(deck => deck && typeof deck.name === 'string' && deck.name.length <= 120);
}

function normalizeArenaFavorites(data,user) {
    const available=new Map((user.minecards?.cards||[]).map(card=>[ArenaRules.id(card),card]));
    const signature=deck=>JSON.stringify({cards:(deck.cards||[]).map(ArenaRules.id),supports:(deck.supports||[]).map(ArenaRules.id),tactic:deck.tactic,arenaId:deck.arenaId});
    for(let index=0;index<data.favoriteDecks.length;index++){
        const deck=data.favoriteDecks[index];if(deck.mode!=='arena')continue;
        if(!Array.isArray(deck.cards)||!Array.isArray(deck.supports)||deck.cards.some(card=>!card||typeof card!=='object')||deck.supports.some(card=>!card||typeof card!=='object'))return 'Composition d’arène invalide.';
        const existing=(user.data?.favoriteDecks||[]).find(item=>item.id===deck.id&&item.mode==='arena');
        // Les favoris historiques restent consultables si une carte a quitté le stock.
        if(existing&&signature(existing)===signature(deck)){
            data.favoriteDecks[index]={...existing,name:deck.name};continue;
        }
        if(!Object.hasOwn(ArenaRules.environments,deck.arenaId)||!Object.hasOwn(ArenaRules.stances,deck.tactic))return 'Arène ou posture invalide.';
        const fighters=deck.cards.map(card=>available.get(ArenaRules.id(card))),supports=deck.supports.map(card=>available.get(ArenaRules.id(card)));
        if([...fighters,...supports].some(card=>!card))return 'Une carte de cette équipe n’est plus disponible. Synchronise ta collection.';
        const error=ArenaRules.validate(fighters,supports);if(error)return error;
        data.favoriteDecks[index]={...deck,cards:structuredClone(fighters),supports:structuredClone(supports),teamCost:[...fighters,...supports].reduce((sum,card)=>sum+ArenaRules.cost(card),0),totalPower:fighters.reduce((sum,card)=>sum+card.valeur,0),targetPower:null};
    }
    return null;
}

function hasValidOrigin(req) {
    const origin = req.headers.origin;
    return !origin||origin===`${storage.isCloud?'https':'http'}://${req.headers.host}`;
}

async function handleApi(req, res, url) {
    if(!hasValidOrigin(req))return sendJson(res,403,{error:'Origine non autorisée.'});

    const db = readDb();
    if(req.method==='GET'&&url.pathname==='/api/site')return workspace.handle(req,res,url,null);
    if (req.method === 'POST' && url.pathname === '/api/register') {
        if(db.settings?.registrationsOpen===false)return sendJson(res,403,{error:'Les inscriptions sont temporairement fermées.'});
        const body = await readBody(req, 16 * 1024);
        const username = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '');
        if (!/^[a-z0-9_]{3,24}$/.test(username)) return sendJson(res, 400, { error:'L’identifiant doit faire 3 à 24 caractères (lettres sans accent, chiffres ou _).' });
        if (password.length < 10 || password.length > 128) return sendJson(res, 400, { error:'Le mot de passe doit contenir entre 10 et 128 caractères.' });
        if (db.users.some(user => user.username === username)) return sendJson(res, 409, { error:'Cet identifiant est déjà utilisé.' });
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = (await scrypt(password, salt, 64, { N:16384, r:8, p:1 })).toString('hex');
        const user = { id:crypto.randomUUID(), username, salt, passwordHash, role:'user', data:{ cards:[], favoriteDecks:[] }, createdAt:new Date().toISOString() };
        const latest = readDb();
        if(latest.settings?.registrationsOpen===false)return sendJson(res,403,{error:'Les inscriptions sont temporairement fermées.'});
        if (latest.users.some(item => item.username === username)) return sendJson(res, 409, { error:'Cet identifiant est déjà utilisé.' });
        latest.users.push(user);
        writeDb(latest);
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(crypto.createHash('sha256').update(token).digest('hex'), createSession(user.id,req,SESSION_TTL_MS));
        return sendJson(res, 201, { user:publicUser(user) }, { 'Set-Cookie':sessionCookie(token) });
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
        const body = await readBody(req, 16 * 1024);
        const username = String(body.username || '').trim().toLowerCase();
        const key = `${(storage.isCloud ? (req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || 'unknown') : req.socket?.remoteAddress)}:${username}`;
        const failures = loginFailures.get(key) || { count:0, until:0 };
        if (failures.until > Date.now()) return sendJson(res, 429, { error:'Trop de tentatives. Réessaie dans quelques minutes.' });
        const user = db.users.find(item => item.username === username);
        const salt = user ? user.salt : '0'.repeat(32);
        const actual = await scrypt(String(body.password || ''), salt, 64, { N:16384, r:8, p:1 });
        const expected = Buffer.from(user ? user.passwordHash : '0'.repeat(128), 'hex');
        const ok = user && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
        if (!ok) {
            failures.count += 1;
            if (failures.count >= 8) { failures.count = 0; failures.until = Date.now() + 10 * 60 * 1000; }
            loginFailures.set(key, failures);
            return sendJson(res, 401, { error:'Identifiant ou mot de passe incorrect.' });
        }
        loginFailures.delete(key);
        const latest=readDb(),current=latest.users.find(item=>item.id===user.id);
        if(!current||current.passwordHash!==user.passwordHash)return sendJson(res,409,{error:'Le compte a changé. Réessaie de te connecter.'});
        if(current.suspended)return sendJson(res,403,{error:'Ce compte est suspendu. Contacte l’administrateur.'});
        current.lastLoginAt=new Date().toISOString();writeDb(latest);
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(crypto.createHash('sha256').update(token).digest('hex'), createSession(user.id,req,SESSION_TTL_MS));
        return sendJson(res, 200, { user:publicUser(current) }, { 'Set-Cookie':sessionCookie(token) });
    }

    const user = getUserFromRequest(req, db);
    if (req.method === 'GET' && url.pathname === '/api/me') {
        return user ? sendJson(res, 200, { user:publicUser(user) }) : sendJson(res, 401, { error:'Connexion requise.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
        const cookie = req.headers.cookie || '';
        const match = cookie.match(/(?:^|;\s*)minecards_session=([a-f0-9]{64})(?:;|$)/);
        if (match) sessions.delete(crypto.createHash('sha256').update(match[1]).digest('hex'));
        return sendJson(res, 200, { ok:true }, { 'Set-Cookie':'minecards_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + (storage.isCloud ? '; Secure' : '') });
    }
    if (!user) return sendJson(res, 401, { error:'Connexion requise.' });
    if(['/api/export','/api/notebook','/api/sessions','/api/sessions/revoke','/api/admin/overview','/api/admin/audit','/api/admin/settings'].includes(url.pathname)||/^\/api\/admin\/users\/[0-9a-f-]{36}\/(access|sessions\/revoke|bulk-delete)$/i.test(url.pathname)){
        if(await workspace.handle(req,res,url,user))return;
    }
    if (url.pathname.startsWith('/api/minecards/')) return minecards.handle(req,res,url,user);
    if (req.method === 'PATCH' && url.pathname === '/api/profile') {
        const body = await readBody(req, 512 * 1024);
        const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
        const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
        const avatarImage = body.avatarImage === undefined ? user.profile?.avatarImage || '' : body.avatarImage;
        const bannerImage = body.bannerImage === undefined ? user.profile?.bannerImage || '' : body.bannerImage;
        const featuredDeckId = body.featuredDeckId === undefined ? user.profile?.featuredDeckId || '' : body.featuredDeckId;
        if (typeof featuredDeckId !== 'string' || featuredDeckId.length > 80 ||
            (featuredDeckId && !(user.data?.favoriteDecks || []).some(deck=>String(deck.id)===featuredDeckId))) {
            return sendJson(res, 400, {error:'Ce deck favori n’existe plus. Choisis un autre deck à mettre en avant.'});
        }
        if (!validProfileImage(avatarImage, 80 * 1024) || !validProfileImage(bannerImage, 180 * 1024)) {
            return sendJson(res, 400, {error:'Image invalide. Utilise les fichiers JPG, PNG ou WebP proposés dans le formulaire.'});
        }
        if (!displayName || displayName.length > 40 || bio.length > 240 ||
            !PROFILE_AVATARS.includes(body.avatar) || !PROFILE_ACCENTS.includes(body.accent)) {
            return sendJson(res, 400, { error:'Profil invalide : nom de 1 à 40 caractères, présentation de 240 caractères maximum et avatar/couleur proposés.' });
        }
        const latest = readDb();
        const current = getUserFromRequest(req, latest);
        if (!current) return sendJson(res, 401, { error:'Connexion requise.' });
        current.profile = { displayName, bio, avatar:body.avatar, accent:body.accent, avatarImage, bannerImage, featuredDeckId };
        writeDb(latest);
        return sendJson(res, 200, { user:publicUser(current) });
    }
    if (req.method === 'PUT' && url.pathname === '/api/password') {
        const body = await readBody(req, 8 * 1024);
        const { currentPassword, newPassword, confirmPassword } = body;
        if (typeof currentPassword !== 'string' || currentPassword.length > 128 ||
            typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) {
            return sendJson(res, 400, { error:'Le nouveau mot de passe doit contenir entre 10 et 128 caractères.' });
        }
        if (newPassword !== confirmPassword) return sendJson(res, 400, { error:'Les nouveaux mots de passe ne correspondent pas.' });
        if (newPassword === currentPassword) return sendJson(res, 400, { error:'Choisis un mot de passe différent de l’actuel.' });
        const key = 'password:' + user.id;
        const failures = loginFailures.get(key) || { count:0, until:0 };
        if (failures.until > Date.now()) return sendJson(res, 429, { error:'Trop de tentatives. Réessaie dans quelques minutes.' });
        const actual = await scrypt(currentPassword, user.salt, 64, { N:16384, r:8, p:1 });
        const expected = Buffer.from(user.passwordHash, 'hex');
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
            failures.count += 1;
            if (failures.count >= 8) { failures.count = 0; failures.until = Date.now() + 10 * 60 * 1000; }
            loginFailures.set(key, failures);
            return sendJson(res, 400, { error:'Le mot de passe actuel est incorrect.' });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = (await scrypt(newPassword, salt, 64, { N:16384, r:8, p:1 })).toString('hex');
        const latest = readDb();
        const current = getUserFromRequest(req, latest);
        if (!current || current.passwordHash !== user.passwordHash) return sendJson(res, 409, { error:'La session a changé. Reconnecte-toi avant de réessayer.' });
        current.salt = salt;
        current.passwordHash = passwordHash;
        writeDb(latest);
        loginFailures.delete(key);
        for (const [hash, session] of sessions) if (session.userId === current.id) sessions.delete(hash);
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(crypto.createHash('sha256').update(token).digest('hex'), createSession(current.id,req,SESSION_TTL_MS));
        return sendJson(res, 200, { ok:true }, { 'Set-Cookie':sessionCookie(token) });
    }
    if (url.pathname.startsWith('/api/admin/')) {
        if ((user.role || 'user') !== 'admin') return sendJson(res, 403, { error:'Accès réservé à l’administration.' });
        if (req.method === 'GET' && url.pathname === '/api/admin/users') {
            const users = db.users.map(workspace.userSummary);
            return sendJson(res, 200, { users });
        }
        const detailMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i);
        if (req.method === 'GET' && detailMatch) {
            const target = db.users.find(item => item.id === detailMatch[1]);
            if (!target) return sendJson(res, 404, { error:'Profil introuvable.' });
            return sendJson(res, 200, { user:{ ...publicUser(target), ...workspace.userSummary(target) }, data:collectionData(target) });
        }
        if (detailMatch && req.method === 'DELETE') {
            const target = db.users.find(item => item.id === detailMatch[1]);
            if (!target) return sendJson(res, 404, { error:'Profil introuvable.' });
            if (target.id === user.id) return sendJson(res, 400, { error:'Vous ne pouvez pas supprimer votre propre compte administrateur.' });
            if ((target.role || 'user') === 'admin') return sendJson(res, 400, { error:'Un compte administrateur ne peut pas être supprimé depuis ce panneau.' });
            db.users = db.users.filter(item => item.id !== target.id);
            workspace.revoke(target.id);
            recordAudit(db,user,'user.delete',target,'Suppression définitive du compte');
            writeDb(db);
            minecards.forget(target.id);
            return sendJson(res, 200, { ok:true });
        }
        const recordMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/(cards|decks)\/([^/]+)$/i);
        if (recordMatch && req.method === 'DELETE') {
            const [, targetId, collection, recordId] = recordMatch;
            const target = db.users.find(item => item.id === targetId);
            if (!target) return sendJson(res, 404, { error:'Profil introuvable.' });
            if (target.id === user.id) return sendJson(res, 400, { error:'Cette action est réservée aux données des autres profils.' });
            const field = collection.toLowerCase() === 'cards' ? 'cards' : 'favoriteDecks';
            const records = target.data?.[field];
            if (!Array.isArray(records)) return sendJson(res, 404, { error:'Élément introuvable.' });
            const index = records.findIndex(item => String(item?.id) === recordId);
            if (index < 0) return sendJson(res, 404, { error:'Élément introuvable.' });
            records.splice(index, 1);
            target.dataRevision=(target.dataRevision||0)+1;
            if(field==='favoriteDecks'&&target.profile?.featuredDeckId===recordId)target.profile.featuredDeckId='';
            recordAudit(db,user,'record.delete',target,field+' : '+recordId);
            writeDb(db);
            return sendJson(res, 200, { ok:true });
        }
        return sendJson(res, 404, { error:'Route administrateur introuvable.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/data') return sendJson(res, 200, { data:collectionData(user),revision:user.dataRevision||0 });
    if (req.method === 'PUT' && url.pathname === '/api/data') {
        const body = await readBody(req, 20 * 1024 * 1024);
        const data = localData(body?.data);
        if (!validData(data)) return sendJson(res, 400, { error:'Données de profil invalides.' });
        const latest = readDb();
        const current = getUserFromRequest(req, latest);
        if (!current) return sendJson(res, 401, { error:'Connexion requise.' });
        if(!Number.isSafeInteger(body.revision)||body.revision!==(current.dataRevision||0))return sendJson(res,409,{error:'La collection ou les favoris ont été modifiés depuis une autre page ou par l’administration. Recharge tes données avant de réessayer.',staleData:true});
        const arenaError=normalizeArenaFavorites(data,current);
        if(arenaError)return sendJson(res,409,{error:arenaError});
        current.data = data;
        current.dataRevision=(current.dataRevision||0)+1;
        if(current.profile?.featuredDeckId&&!data.favoriteDecks.some(deck=>String(deck.id)===current.profile.featuredDeckId))current.profile.featuredDeckId='';
        // Un favori sauvegardé pendant l'import ne rétablit pas les anciennes
        // images et puissances après la validation de la nouvelle collection.
        const catalog=(current.minecards?.cards||[]).map(card=>({id:card._minecards.cardId,name:card.nom,image:card.image,...card._minecards}));
        if(catalog.length){updateCardImages(current,catalog);updateCardPowers(current,catalog);}
        writeDb(latest);
        return sendJson(res, 200, { ok:true,revision:current.dataRevision });
    }
    return sendJson(res, 404, { error:'Route introuvable.' });
}

const minecards = createMinecards({readDb,writeDb,readBody,sendJson,getUserFromRequest});
const workspace=createWorkspace({readDb,writeDb,readBody,sendJson,getUserFromRequest,publicUser,sessions,minecards,collectionData});
async function handler(req, res) {
    try {
        const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
        if(req.method==='POST'&&url.pathname==='/api/minecards/sync/step'){
            if(!hasValidOrigin(req))return sendJson(res,403,{error:'Origine non autorisée.'});
            // Les réservations et validations sont atomiques ; l'attente réseau
            // a lieu entre deux transactions, sans bloquer les autres profils.
            return await minecards.step(req,res);
        }
        if (url.pathname.startsWith('/api/')) {
            if (!storage.isCloud) return await handleApi(req, res, url);
            // Ne confirmer au navigateur qu’après la validation atomique du stockage.
            const reply = await storage.transaction(async () => {
                const buffered = {headersSent:false, writeHead(status,headers){this.status=status;this.headers=headers;}, end(body){this.body=body;this.headersSent=true;}};
                try { await handleApi(req,buffered,url); }
                catch (error) { if (!error.status) throw error; sendApiError(buffered,error); }
                return buffered;
            });
            res.writeHead(reply.status,reply.headers);
            return res.end(reply.body);
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error:'Méthode non autorisée.' });
        let pathname;
        try { pathname = decodeURIComponent(url.pathname); }
        catch { return sendJson(res, 400, { error:'URL invalide.' }); }
        const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const filePath = path.resolve(__dirname, requested);
        if (!['index.html','theme.css','minecards-ui.js','profile-media.js','profile-showcase.js','arena-rules.js','arena-builder.js','workspace-ui.js','admin-ui.js','edition-rules.js','recycler-ui.js'].includes(requested) || !filePath.startsWith(__dirname + path.sep)) return sendJson(res, 404, { error:'Fichier introuvable.' });
        fs.readFile(filePath, (error, content) => {
            if (error) return sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error:error.code === 'ENOENT' ? 'Fichier introuvable.' : 'Erreur serveur.' });
            res.writeHead(200, { 'Content-Type':MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-cache' });
            if (req.method === 'HEAD') return res.end();
            res.end(content);
        });
    } catch (error) {
        if (!error.status) console.error('Erreur interne MineCards :', error.name || 'Error');
        if (!res.headersSent) sendApiError(res,error);
        else res.destroy();
    }
}

module.exports = handler;
if (require.main === module && !storage.isCloud) {
    http.createServer(handler).listen(PORT, HOST, () => console.log(`🚀 MineCards prêt sur http://${HOST}:${PORT}`));
}
