'use strict';
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {Script} = require('vm');
const root = path.resolve(__dirname,'..');
for (const file of ['server.js','storage.js','minecards.js','minecards-remote.js','minecards-sync.js','minecards-ui.js','profile-media.js','profile-showcase.js','arena-rules.js','arena-builder.js','api/index.js']) {
    execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});
}
for (const match of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) new Script(match[1],{filename:'index.html'});
}
const destination = path.join(root,'public');
fs.mkdirSync(destination,{recursive:true});
const assets = ['index.html','theme.css','minecards-ui.js','profile-media.js','profile-showcase.js','arena-rules.js','arena-builder.js'];
if (fs.readdirSync(destination).some(file=>!assets.includes(file))) {
    throw new Error('public/ contient des fichiers inattendus. Retirer ces fichiers avant de publier.');
}
// Liste explicite : aucun fichier de données ou de code serveur n’est publié.
for (const file of assets) {
    fs.copyFileSync(path.join(root,file),path.join(destination,file));
}
console.log('Interface préparée dans public/.');
