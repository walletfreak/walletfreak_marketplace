'use strict';
let setupStep=0,setupPerson='',setupSnapshot,setupDirty,pendingAccountId='';
const setupSteps=['Person','Cards','Rewards accounts','Review & save'];
function openWalletSetup(){
 if(!draft)return;setupSnapshot=structuredClone(draft);setupDirty=dirty;setupStep=0;setupPerson=$('#wallet-person').value||draft.people[0]?.id||'';renderSetup();$('#wallet-setup').showModal();
}
function setupRows(section){return draft[section].map((row,index)=>({row,index})).filter(({row})=>row.person_id===setupPerson);}
function setupFields(section,keys){return setupRows(section).map(({row,index})=>`<article class="setup-entry" data-section="${section}" data-index="${index}"><div class="wallet-image provider">${walletImage(section,row)}</div><div class="wallet-edit-grid">${keys.map(key=>{const col=columns[section].find(c=>c[0]===key);return `<label>${esc(col[1])}${cell(section,index,row,col)}</label>`;}).join('')}</div><button type="button" data-setup-remove="${section}" data-index="${index}">Remove</button></article>`).join('');}
function renderSetup(){
 $('#setup-progress').innerHTML=setupSteps.map((s,i)=>`<li ${i===setupStep?'aria-current="step"':''}>${i+1}. ${s}</li>`).join('');$('#setup-back').hidden=setupStep===0;$('#setup-next').textContent=setupStep===3?'Save profile':'Continue';$('#setup-error').textContent='';
 const person=draft.people.find(p=>p.id===setupPerson);
 if(setupStep===0)$('#setup-fields').innerHTML=`<h4>Whose wallet is this?</h4><label>Choose a person<select id="setup-person"><option value="">Add someone new</option>${draft.people.map(p=>`<option value="${esc(p.id)}" ${p.id===setupPerson?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>Name or alias<input id="setup-name" value="${esc(person?.name||'')}" maxlength="300" required placeholder="Alex"></label>`;
 if(setupStep===1)$('#setup-fields').innerHTML=`<h4>Cards for ${esc(person.name)}</h4><p>Search for the exact card product. You can continue without adding cards.</p>${setupFields('cards',['name'])}<button type="button" data-setup-add="cards">+ Add card</button>`;
 if(setupStep===2){
 const suggestions=[...new Set(setupRows('cards').map(({row})=>suggestedProgram(row.name)).filter(Boolean))].filter(name=>!setupRows('programs').some(({row})=>row.name===name));
 $('#setup-fields').innerHTML=`<h4>Link rewards accounts</h4><p>Add accounts you own. Leave unknown balances blank. Transfer partners are separate from earning accounts.</p><div class="actions">${suggestions.map(name=>`<button type="button" data-suggest-program="${esc(name)}">Add ${esc(name)}</button>`).join('')}</div>${setupFields('programs',['name','account_label','member_hint','balance','status'])}<button type="button" data-setup-add="programs">+ Add rewards account</button>${setupRows('cards').length?'<h4>Where each card earns</h4>':''}${setupFields('cards',['name','reward_account_id'])}<p class="muted">Add a saved sign-in from any account after saving. No login is required to set up your wallet.</p>`;
 }
 if(setupStep===3)$('#setup-fields').innerHTML=`<h4>${esc(person.name)}’s wallet</h4><p>${setupRows('cards').length} cards · ${setupRows('programs').length} rewards accounts</p><ul>${setupRows('cards').map(({row})=>{const a=draft.programs.find(a=>a.id===row.reward_account_id);return `<li>${esc(row.name)} → ${esc(a?.account_label||a?.name||'No rewards account linked')}</li>`;}).join('')}${setupRows('programs').map(({row})=>`<li>${esc(row.account_label||row.name)} · ${esc(row.name)} · ${row.balance?Number(row.balance).toLocaleString():'Balance unknown'}${row.status?' · '+esc(row.status):''}</li>`).join('')}</ul><p>Existing credits, reporting dates and saved sign-ins are retained. You can edit this wallet anytime.</p>`;
 $('#setup-person')?.addEventListener('change',e=>{setupPerson=e.target.value;$('#setup-name').value=draft.people.find(p=>p.id===setupPerson)?.name||'';});
}
function setupValid(){return [...$('#setup-fields').querySelectorAll('input,select')].every(e=>e.reportValidity());}
function cancelSetup(){draft=setupSnapshot;dirty=setupDirty;$('#wallet-setup').close();renderPeople();renderWallet();}
$('#setup-wallet').onclick=openWalletSetup;$('#setup-cancel').onclick=cancelSetup;$('#wallet-setup').addEventListener('cancel',e=>{e.preventDefault();cancelSetup();});
$('#setup-back').onclick=()=>{setupStep--;renderSetup();};
$('#setup-next').onclick=async()=>{
 if(!setupValid())return;
 if(setupStep===0){const name=$('#setup-name').value.trim();if(!name)return;const duplicate=draft.people.find(p=>p.name.toLowerCase()===name.toLowerCase()&&p.id!==setupPerson);if(duplicate){$('#setup-error').textContent='That person already exists. Choose them from the list.';return;}let person=draft.people.find(p=>p.id===setupPerson);if(!person){person={id:crypto.randomUUID(),name};draft.people.push(person);setupPerson=person.id;}else person.name=name;for(const row of [...draft.cards,...draft.programs,...draft.benefits])if(row.person_id===person.id)row.owner=name;dirty=true;}
 if(setupStep<3){setupStep++;renderSetup();return;}
 const button=$('#setup-next');button.disabled=true;try{await persistWallet();$('#wallet-setup').close();renderPeople();filterWallet();}catch(e){$('#setup-error').textContent=e.message;}finally{button.disabled=false;}
};
$('#setup-fields').addEventListener('input',e=>{const entry=e.target.closest('[data-section]');if(!entry)return;const row=draft[entry.dataset.section][Number(entry.dataset.index)];if(e.target.hasAttribute('data-program-choice')){updateProgramChoice(e.target,row);return;}if(!e.target.dataset.field)return;row[e.target.dataset.field]=e.target.value;dirty=true;if(e.target.dataset.field==='name')entry.querySelector('.wallet-image').innerHTML=walletImage(entry.dataset.section,row);});
$('#setup-fields').onclick=e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.setupAdd||b.dataset.suggestProgram){if(!setupValid())return;const section=b.dataset.setupAdd||'programs',person=draft.people.find(p=>p.id===setupPerson),row={id:crypto.randomUUID(),name:b.dataset.suggestProgram||'',person_id:person.id,owner:person.name,reported_on:'',notes:''};if(section==='programs')Object.assign(row,{account_label:row.name?`${person.name} · ${row.name}`:'',member_hint:'',balance:'',status:'',approximate:false,preserve:false});draft[section].push(row);if(b.dataset.suggestProgram)for(const {row:card} of setupRows('cards'))if(!card.reward_account_id&&suggestedProgram(card.name)===row.name)card.reward_account_id=row.id;dirty=true;renderSetup();$('#setup-fields [data-section="'+section+'"]:last-of-type '+(section==='programs'?'[data-program-choice]':'[data-field=name]'))?.focus();}
 if(b.dataset.setupRemove){const section=b.dataset.setupRemove,id=draft[section][Number(b.dataset.index)].id;draft[section].splice(Number(b.dataset.index),1);for(const row of [...draft.cards,...draft.benefits])for(const key of ['reward_account_id','card_id','program_id'])if(row[key]===id)row[key]='';dirty=true;renderSetup();}
};
async function openAccountSignin(section,id){
 try{
  if(dirty)await persistWallet();await refreshVault();
  const account=draft[section]?.find(a=>a.id===id);if(!account)return;
  if(!vaultState?.unlocked){$('#wallet-data').open=true;$('#saved-signins').open=true;$('#saved-signins').scrollIntoView();notice('Unlock saved sign-ins before linking this account.');return;}
  pendingAccountId=section+':'+id;tab('wallet');
  const saved=vaultState?.entries?.find(e=>e.id===account.credential_id);
  const provider=section==='programs'?loyaltyChoices().find(item=>item.name.toLowerCase()===account.name.toLowerCase())?.provider:/american express|amex/i.test(account.name)?'Amex Travel':/chase/i.test(account.name)?'Chase Travel':/capital one/i.test(account.name)?'Capital One Travel':/citi/i.test(account.name)?'Citi Travel':undefined;
  openCredentialDialog(saved||null);
  $('#credential-provider').value=saved?.provider||provider||account.name;
  $('#credential-provider').readOnly=true;
  $('#credential-label').value=saved?.label||account.account_label||account.nickname||'';
  $('#credential-origin').value=saved?.login_origin||'';
  $('#credential-username').value=saved?.username||'';
  $('#credential-association').hidden=false;
  $('#credential-association').textContent=`Link sign-in to ${account.nickname||account.account_label||account.name}.`;
  const existing=(vaultState?.entries||[]).filter(entry=>!saved&&entry.provider.toLowerCase()===$('#credential-provider').value.toLowerCase());
  $('#credential-existing').hidden=!existing.length;
  $('#credential-existing').innerHTML=existing.length?'<strong>Use a saved sign-in</strong>'+existing.map(entry=>`<button type="button" data-use-credential="${esc(entry.id)}">${esc(entry.label||entry.provider)} · ${esc(entry.username)}</button>`).join(''):'';
  credentialStep(3);
 }catch(e){notice(e.message,true);}
}
$('#credential-existing').onclick=async event=>{
 const button=event.target.closest('[data-use-credential]');if(!button||!pendingAccountId)return;
 const [section,id]=pendingAccountId.split(':'),row=draft[section]?.find(item=>item.id===id);
 if(!row)return;
 row.credential_id=button.dataset.useCredential;dirty=true;
 try{await persistWallet();$('#credential-dialog').close();notice('Saved sign-in linked to this wallet item.');}catch(error){notice(error.message,true);}
};
