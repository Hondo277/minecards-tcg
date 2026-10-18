'use strict';
let profileMediaDraft = {avatarImage:'',bannerImage:''};
let profileMediaPending = 0;
let profileMediaGeneration = 0;
const profileImageRequests = {avatarImage:0,bannerImage:0};

function paintProfileAvatar(container, source, avatar) {
    container.querySelectorAll('i,img.profile-avatar-image').forEach(node=>node.remove());
    const node = document.createElement(source ? 'img' : 'i');
    if (source) { node.src=source;node.alt='';node.className='profile-avatar-image'; }
    else { node.className='fa-solid '+(profileAvatarIcons[avatar]||'fa-cube');node.setAttribute('aria-hidden','true'); }
    container.prepend(node);
}

function resetProfileMedia(profile) {
    profileMediaGeneration++;
    profileMediaPending=0;
    profileMediaDraft={avatarImage:profile.avatarImage||'',bannerImage:profile.bannerImage||''};
    for (const id of ['settings-avatar-image','settings-banner-image']) document.getElementById(id).value='';
    document.querySelector('#profile-settings-form [type="submit"]').disabled=false;
}

function clearProfileImage(kind) {
    profileImageRequests[kind]++;
    profileMediaDraft[kind]='';
    document.getElementById(kind==='avatarImage'?'settings-avatar-image':'settings-banner-image').value='';
    previewProfileSettings();
}

async function chooseProfileImage(event,kind) {
    const input=event.target,file=input.files?.[0];
    if (!file || !activeProfile) return;
    const generation=profileMediaGeneration, userId=activeProfile.id, request=++profileImageRequests[kind];
    const button=document.querySelector('#profile-settings-form [type="submit"]');
    profileMediaPending++;button.disabled=true;
    let url;
    try {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('Choisis une image JPG, PNG ou WebP.');
        if (file.size>10*1024*1024) throw Error('Cette image dépasse 10 Mo. Choisis un fichier plus léger.');
        profileSettingsMessage('profile-settings-message','Préparation de l’image…',true);
        url=URL.createObjectURL(file);
        const image=new Image();
        image.src=url;
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw Error('Cette image ne peut pas être lue.');
        const canvas=document.createElement('canvas');
        canvas.width=kind==='avatarImage'?320:1200;
        canvas.height=kind==='avatarImage'?320:360;
        const context=canvas.getContext('2d');
        if (!context) throw Error('La préparation des images n’est pas disponible dans ce navigateur.');
        const scale=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
        const width=canvas.width/scale,height=canvas.height/scale;
        context.drawImage(image,(image.naturalWidth-width)/2,(image.naturalHeight-height)/2,width,height,0,0,canvas.width,canvas.height);
        const maximum=kind==='avatarImage'?80*1024:180*1024;
        let source='';
        for (const quality of [.86,.72,.58,.42,.28]) {
            source=canvas.toDataURL('image/webp',quality);
            if (source.startsWith('data:image/') && atob(source.split(',')[1]).length<=maximum) break;
        }
        if (!source.startsWith('data:image/') || atob(source.split(',')[1]).length>maximum) throw Error('Cette image reste trop lourde. Choisis une image plus simple.');
        if (generation!==profileMediaGeneration || userId!==activeProfile?.id || request!==profileImageRequests[kind]) return;
        profileMediaDraft[kind]=source;
        previewProfileSettings();
        profileSettingsMessage('profile-settings-message','Image prête. Enregistre ton profil pour la conserver.',true);
    } catch (error) {
        if (generation===profileMediaGeneration && userId===activeProfile?.id && request===profileImageRequests[kind]) {
            input.value='';
            profileSettingsMessage('profile-settings-message',error.message||'Image illisible. Essaie un autre fichier.');
        }
    } finally {
        if (url) URL.revokeObjectURL(url);
        if (generation===profileMediaGeneration) { profileMediaPending--;button.disabled=profileMediaPending>0; }
    }
}

function filterAdminCollection(input) {
    const normalize=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const query=normalize(input.value);
    const rows=document.querySelectorAll('#admin-user-detail .admin-collection-record');
    let count=0;
    for (const row of rows) {
        row.hidden=!normalize(row.dataset.search).includes(query);
        if (!row.hidden) count++;
    }
    document.getElementById('admin-card-search-count').textContent=count+' carte(s) affichée(s) sur '+rows.length;
    document.getElementById('admin-card-search-empty').hidden=count!==0 || rows.length===0;
}
