'use strict';
const fs = require('fs');
const path = require('path');
const {redis,stateKey} = require('../storage');

async function main() {
    const directory = path.resolve(__dirname,'..','data');
    const db = JSON.parse(fs.readFileSync(path.join(directory,'accounts.json'),'utf8'));
    if (!Array.isArray(db.users) || !db.users.length) throw new Error('La base locale doit contenir au moins un compte.');
    if (!db.users.some(user=>user.role==='admin')) throw new Error('Aucun administrateur dans la base locale.');
    const file = path.join(directory,'minecards-connections.json');
    const connections = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {};
    const state = {version:1,db,connections,sessions:[],loginFailures:[],jobs:{},limiter:{}};
    // NX interdit tout écrasement d’une base distante déjà initialisée.
    const result = await redis(['SET',stateKey,JSON.stringify(state),'NX']);
    if (result!=='OK') throw new Error('La base distante existe déjà. Aucun compte ni aucune donnée n’a été écrasé.');
    console.log('Migration terminée : '+db.users.length+' compte(s), collections, favoris et connexions transférés. Reconnexion nécessaire.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
