'use strict';
document.addEventListener('error', event => {
  if (event.target.matches?.('img.hotel-photo-image')) event.target.hidden = true;
}, true);

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, activeId = '', brands = {}, cards = [], draft, draftRevision, dirty = false, stopped = false, assetCatalog = [], vaultState, pluginInventory, currentTab = 'home';
function notice(message, error = false) { $('#notice').textContent = message; $('#notice').className = error ? 'error' : ''; }
async function api(path, body) {
  const response = await fetch('/api/' + path, body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json','X-WalletFreak':'1'}, body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
async function act(path, body) {
  try { const result = await api(path, body); if (result.message) notice(result.message); await refresh(); return result; }
  catch (error) { notice(error.message, true); await refresh(); return null; }
}
const routes = {home:'/',overview:'/travel',actions:'/actions',wallet:'/credit-cards',spending:'/spending',shopping:'/shopping',credentials:'/settings/sign-ins',plugins:'/settings/plugins'};
function openReviewLink() {
  if (location.pathname !== '/travel') return;
  const query = new URLSearchParams(location.search), review = query.get('review');
  if (!['comparison','research'].includes(review)) return;
  $('#trip-library').open = true; $('#trip-alternatives').open = true;
  requestAnimationFrame(() => (review === 'comparison' ? $('#comparison') : $('#options')).scrollIntoView({block:'start'}));
}
function tab(name, navigate=true) {
  if (!routes[name]) name='overview';
  currentTab=name; document.body.dataset.view=name; $('.workspace-more').open=false;
  if (navigate && location.pathname!==routes[name]) history.pushState(null,'',name==='overview'&&activeId?`/travel?trip=${encodeURIComponent(activeId)}`:routes[name]);
  if (name==='home') renderHome(); if (name==='overview') window.loadOverview(); if (name==='actions') window.renderActions?.(); if (name==='spending') window.loadSpending(); if (name==='shopping') window.loadShopping(); if (name==='plugins') loadPlugins(); if (name==='credentials') refreshVault();
  for (const item of document.querySelectorAll('.workspace-nav [data-tab]')) item.setAttribute('aria-pressed',String(item.dataset.tab===name));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden=panel.id!==name;
}
document.querySelectorAll('.workspace-nav [data-tab]').forEach(button => button.addEventListener('click', () => tab(button.dataset.tab)));
window.addEventListener('popstate',()=>{
  const requested = new URLSearchParams(location.search).get('trip');
  if (location.pathname==='/travel' && state?.trips.some(t=>t.id===requested)) {activeId=requested;renderFindings();}
  tab(Object.keys(routes).find(name=>routes[name]===location.pathname)||'home',false);
  openReviewLink();
});
window.selectTravelTrip = id => {
  if (!state?.trips.some(t=>t.id===id)) return;
  activeId=id;
  history.replaceState(null,'',`/travel?trip=${encodeURIComponent(id)}`);
  renderFindings(); window.loadOverview(); window.renderActions?.();
};
function renderHome() {
  if (!state) return;
  const trips=state.trips||[],featured=trips.find(t=>t.id===activeId)||trips[0];
  const photo=trip=>{const url=trip?.findings?.options?.find(o=>o.image?.url)?.image?.url;try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?url:'';}catch{return '';}};
  const title=featured?.findings?.title||'Your next trip';
  const steps=featured?.findings?.itinerary||[],dates=steps.map(item=>item.day).filter(Boolean).sort();
  const route=[...new Set(steps.map(item=>item.place?.label?.split(' · ')[0]).filter(Boolean))].slice(0,4).join(' → ');
  const open=trips.flatMap(t=>window.getTripActions?window.getTripActions(t):[]).filter(a=>!a.done);
  $('#home-hero').innerHTML=`${photo(featured)?`<img src="${esc(photo(featured))}" alt="" loading="lazy">`:''}<div class="home-hero-copy"><span class="eyebrow">${featured?'SELECTED TRIP':'PERSONAL TRAVEL'}</span><h1>${esc(title)}</h1><p>${esc(route||'Your research starts here')}</p><small>${dates.length?esc(dates[0]+' → '+dates.at(-1)):'Dates to confirm'}</small><button type="button" data-home-trip="${esc(featured?.id||'')}">${featured?'View trip':'Plan with your agent'} →</button></div>`;
  $('#home-stats').innerHTML=`<article><strong>${trips.length}</strong><span>Saved trips</span></article><article><strong>${open.length}</strong><span>Actions to review</span></article><article><strong>${state.wallet.cards.length}</strong><span>Cards tracked</span></article><article><strong>${state.wallet.programs.length}</strong><span>Reward programs</span></article>`;
  $('#home-trips').innerHTML=trips.length?trips.map(t=>`<button type="button" class="home-trip" data-home-trip="${esc(t.id)}">${photo(t)?`<img src="${esc(photo(t))}" alt="" loading="lazy">`:'<span class="home-trip-art" aria-hidden="true">↗</span>'}<span><strong>${esc(t.findings.title)}</strong><small>${esc(t.findings.itinerary?.[0]?.day||'Dates to confirm')} · ${esc(t.findings.itinerary?.length||0)} itinerary items</small></span></button>`).join(''):'<p class="note">No saved trips yet. Ask your agent to plan a trip, then it will appear here.</p>';
  $('#home-actions').innerHTML=open.length?open.slice(0,3).map(a=>`<button type="button" data-tab="actions"><span class="eyebrow">${esc(trips.find(t=>t.id===a.trip)?.findings.title||'TRIP')}</span><strong>${esc(a.title)}</strong><small>${esc(typeof a.detail==='string'?a.detail:'Review this step in Actions.')}</small></button>`).join(''):'<p class="note">No trip actions need your attention right now.</p>';
}
$('#home').addEventListener('click',event=>{const nav=event.target.closest('[data-tab]');if(nav){tab(nav.dataset.tab);return;}const target=event.target.closest('[data-home-trip]');if(!target)return;tab('overview');if(target.dataset.homeTrip)window.selectTravelTrip(target.dataset.homeTrip);});
$('#open-confirmations').onclick=()=>{$('#confirmation-import').open=true;$('#confirmation-text').focus();};
function trip() { return state?.trips.find(t => t.id === activeId); }
function logo(name) {
  if (typeof name !== 'string') return '';
  const aliases={'amex membership rewards':'amex-travel','chase ultimate rewards':'chase-travel','capital one miles':'capital-one-travel'};
  const match = aliases[name.toLowerCase()] || name.split('·')[0].trim().toLowerCase();
  const provider = state?.providers.find(p => p.id === match || p.name.toLowerCase() === match || p.programs.some(program => program.toLowerCase() === match || (p.name + ' ' + program).toLowerCase() === match || (program + ' points').toLowerCase() === match));
  const asset = brands[provider?.id];
  return asset?.path ? `<img src="/assets/${esc(asset.path)}" alt="">` : '';
}
function hotelPhoto(option) {
  const image = option?.image;
  return image ? `<figure class="hotel-photo"><img class="hotel-photo-image" src="${esc(image.url)}" alt="${esc(image.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="800" height="450"><figcaption>${sourceLinks([{label:'Hotel photo source',url:image.source_url}])}</figcaption></figure>` : '';
}

function sourceLinks(sources = []) { return sources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a>`).join(' · '); }
function paymentView(option) {
  const p=option?.payment;
  if(!p)return '<div class="payment"><strong>Payment card: To confirm</strong><p>No benefit usage recorded.</p></div>';
  const labels={'planned':'Planned · not spent','used':'Already used','not-used':'Not used','conditional':'Conditional','unavailable':'Unavailable'};
  return `<div class="payment"><strong>Pay with: ${esc(p.card)}</strong><p>${esc(p.reason)}</p>${p.benefits?.length?`<ul>${p.benefits.map(b=>`<li><span class="benefit-state ${esc(b.status)}">${labels[b.status]}</span> <strong>${esc(b.name)}</strong> — ${esc(b.detail)}${b.recorded_at?` <small>Recorded ${esc(b.recorded_at)}</small>`:''}</li>`).join('')}</ul>`:'<p>No benefit usage recorded.</p>'}</div>`;
}
function renderFindings() {
  const t = trip();
  $('#trip-library').hidden = !t; $('#result-content').hidden = !t;
  if (!t) return;
  const f = t.findings;
  const words = $('#search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const options = (f.options || []).filter(o => words.every(w=>JSON.stringify(o).toLowerCase().includes(w)) && (!$('#kind').value || o.kind === $('#kind').value) && (!$('#availability').value || o.status === $('#availability').value) && (!$('#shortlisted').checked || t.shortlist.includes(o.id)));
  $('#count').textContent = `${options.length} of ${(f.options || []).length} options · ${t.shortlist.length} shortlisted`;
  $('#options').innerHTML = options.length ? options.map(o => `<article class="option" data-option-id="${esc(o.id)}">${hotelPhoto(o)}<div class="provider">${logo(o.provider)}<span>${esc(o.provider)} · ${esc(o.kind)}</span></div><h3>${esc(o.title)}</h3><span class="status ${esc(o.status)}">${esc(o.status)} at observation</span><p class="price">${esc(o.price || 'Price unknown')}</p><p class="muted">${esc(o.program)} · Observed ${esc(o.observed_at || 'not recorded')}</p><details><summary>Card & benefits</summary>${paymentView(o)}</details><label class="check"><input type="checkbox" data-shortlist="${esc(o.id)}" ${t.shortlist.includes(o.id)?'checked':''}> Add to shortlist</label><label class="check"><input type="checkbox" data-select="${esc(o.id)}" ${t.selected.includes(o.id)?'checked':''}> Include in my comparison</label><details><summary>Evidence & restrictions</summary><dl>${['search','product','terms','benefits','uncertainty','reproduce'].map(key=>`<dt>${esc(key)}</dt><dd>${esc(o[key] || 'Not recorded')}</dd>`).join('')}</dl>${sourceLinks(o.sources)}</details></article>`).join('') : '<p class="muted">No matching findings.</p>';
  const shortlisted = (f.options || []).filter(o=>t.shortlist.includes(o.id));
  $('#comparison').innerHTML = shortlisted.length ? `<table><thead><tr><th scope="col">Compare</th>${shortlisted.map(o=>`<th scope="col">${hotelPhoto(o)}${esc(o.title)}</th>`).join('')}</tr></thead><tbody>${['provider','price','status','payment','product','terms','benefits','uncertainty'].map(key=>`<tr><th scope="row">${esc(key==='payment'?'Card & benefits':key)}</th>${shortlisted.map(o=>`<td>${key==='payment'?paymentView(o):esc(o[key] || 'Not recorded')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">Shortlist options to compare their prices, terms and benefits here.</p>';
  const totals = [...Object.entries(t.totals.cash).map(([c,v])=>`${c} ${v}`), ...Object.entries(t.totals.points).map(([p,v])=>`${v.toLocaleString()} ${p} points`)];
  $('#totals').innerHTML = `<strong>Selected items only: ${esc(totals.join(' + ') || 'No verified costs selected')}</strong><p>Partial subtotal, not a whole-trip price. Points programs and cash currencies remain separate. Conditional credits are excluded.</p>${t.totals.unknown.length ? `<p>Unpriced or unverified selections: ${esc(t.totals.unknown.join('; '))}</p>` : ''}`;
  $('#evidence').innerHTML = (f.research || []).map(i=>`<article><h4>${esc(i.title)}</h4><p>${esc(i.detail)}</p>${i.url ? sourceLinks([{label:'Official source',url:i.url}]) : ''}</article>`).join('');
  $('#gaps').innerHTML = (f.gaps || []).map(g=>`<li>${esc(g)}</li>`).join('');
}
function walletImage(section, row) {
  if (section !== 'cards') return logo(assetCatalog.find(a=>a.name===row.name)?.provider || row.name);
  const alias = {'capital one venture x;':'capital-one-venture-x-rewards-credit-card','american express platinum;':'american-express-platinum-card','hilton honors american express aspire':'hilton-honors-aspire-card-from-american-express'};
  const name=row.name.toLowerCase();
  const card = cards.find(c => c.name.toLowerCase() === name) || cards.find(c=>c.id === alias[Object.keys(alias).find(k=>name.startsWith(k))]);
  return card ? `<img class="card-art" src="/assets${esc(card.path)}" alt="${esc(card.name)} artwork">` : '<span class="card-placeholder" aria-hidden="true">▰</span>';
}
const assetKinds = {'credit':'Card credit / offer','certificate':'Free-night certificate','gift-card':'Gift card','travel-bank':'TravelBank / stored funds','travel-credit':'Airline / trip credit','companion':'Companion certificate','upgrade':'Upgrade award','lounge-pass':'Lounge visits / passes','membership':'Membership','voucher':'Voucher / award','cashback':'Cash-back balance','other':'Other asset'};
const columns = {
  cards: [['name','Card name'],['reward_account_id','Rewards account','relationship'],['person_id','Person','person'],['reported_on','Reported on','date'],['notes','Card details','textarea']],
  programs: [['name','Loyalty program'],['account_label','Account label'],['member_hint','Member ID hint (last 4)'],['credential_id','Saved sign-in','credential'],['balance','Points / miles'],['approximate','Approx.','checkbox'],['status','Elite status'],['preserve','Preserve','checkbox'],['person_id','Person','person'],['reported_on','Reported on','date'],['notes','Notes','textarea']],
  benefits: [['kind','Type','select'],['card_id','Linked card','relationship'],['program_id','Linked program','relationship'],['name','Asset name'],['remaining','Remaining / currency'],['person_id','Person','person'],['expires_on','Expires on','date'],['reported_on','Reported on','date'],['notes','Restrictions / period','textarea']]
};
function cell(section, index, row, [key,label,type='text']) {
  const attrs = `data-field="${key}" aria-label="${label} ${index+1}"`;
  if (type === 'credential') return `<select ${attrs}><option value="">Not linked</option>${(vaultState?.entries||[]).map(e=>`<option value="${esc(e.id)}" ${row[key]===e.id?'selected':''}>${esc(e.provider)} · ${esc(e.label||'Saved sign-in')}</option>`).join('')}${row[key]&&!(vaultState?.entries||[]).some(e=>e.id===row[key])?`<option value="${esc(row[key])}" selected>Saved sign-in (unlock to view)</option>`:''}</select>`;
  if (type === 'person') return `<select ${attrs}><option value="">Unassigned</option>${draft.people.map(p=>`<option value="${esc(p.id)}" ${row.person_id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
  if (type === 'relationship') {const entries=draft[key==='card_id'?'cards':'programs'];return `<select ${attrs}><option value="">Not linked</option>${entries.map(r=>`<option value="${esc(r.id)}" ${row[key]===r.id?'selected':''}>${esc(r.account_label||r.name||'Unnamed')} ${r.owner?'· '+esc(r.owner):''}</option>`).join('')}</select>`;}
  if (type === 'textarea') return `<textarea ${attrs} maxlength="4000" rows="1">${esc(row[key] || '')}</textarea>`;
  if (type === 'select') return `<select ${attrs}>${Object.entries(assetKinds).map(([id,name])=>`<option value="${id}" ${row[key]===id?'selected':''}>${name}</option>`).join('')}</select>`;
  let extra = key === 'name' ? `required list="${section==='cards'?'card-names':section==='programs'?'program-names':'asset-names'}"` : '';
  if (key === 'balance') extra = 'inputmode="numeric" pattern="[0-9]{1,13}" maxlength="13"';
  return `<input ${attrs} type="${type}" ${type==='checkbox' ? (row[key]?'checked':'') : `value="${esc(row[key] || '')}"`} ${extra} ${type==='text'&&key!=='balance'?'maxlength="300"':''}>`;
}
function renderWallet() {
  for (const section of ['cards','programs','benefits']) {
    const cols=columns[section];
    $(`#wallet-${section}`).innerHTML = `<table class="wallet-sheet"><thead><tr><th scope="col">#</th><th scope="col">${section==='cards'?'Card':'Program'}</th>${cols.map(c=>`<th scope="col">${c[1]}</th>`).join('')}<th scope="col">Remove</th></tr></thead><tbody>${draft[section].map((row,index)=>`<tr data-section="${section}" data-index="${index}"><th scope="row">${index+1}</th><td class="wallet-image provider">${walletImage(section,row)}</td>${cols.map(c=>`<td>${cell(section,index,row,c)}</td>`).join('')}<td><button type="button" data-remove="${section}" data-index="${index}" class="quiet danger" aria-label="Remove ${section==='cards'?'card':section==='programs'?'program':'asset'} ${index+1}">×</button></td></tr>`).join('')}</tbody></table>${draft[section].length?'':`<p class="muted empty-sheet">No ${section==='programs'?'loyalty programs':section==='benefits'?'assets':section} added yet.</p>`}`;
  }
  $('#wallet-preferences').value = draft.preferences;
  renderWalletTiles();filterWallet();walletStatus();
}
function filterWallet() {
  const words=$('#wallet-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  document.querySelectorAll('tr[data-section],.wallet-tile[data-section]').forEach(row=>{const entry=draft[row.dataset.section][Number(row.dataset.index)];row.hidden=($('#wallet-person').value&&entry.person_id!==$('#wallet-person').value)||!words.every(word=>JSON.stringify(entry).toLowerCase().includes(word));});
}
$('#wallet-search').oninput=filterWallet;
function walletStatus() {
  $('#wallet-status').textContent = dirty ? 'Unsaved changes' : 'Your saved wallet is up to date on this device.';
  $('#wallet-conflict').hidden = !dirty || state.wallet.revision === draftRevision;
  $('#legacy-profile').hidden = !state.legacy_profile || state.wallet.revision !== 'empty';
}
function loadWallet() {
  draft = structuredClone(state.wallet); draftRevision = draft.revision;
  delete draft.version; delete draft.revision;draft.people??=[];renderPeople(); for(const row of draft.programs) row.notes ??= ''; dirty = false; renderWallet(); $('#wallet-form').inert = false;
}
async function refresh() {
  if (stopped) return;
  try {
    const next = await api('state');
    const resultChanged = !state || JSON.stringify(state.trips) !== JSON.stringify(next.trips);
    state = next;
    $('#wallet-summary').innerHTML = `<span><strong>${state.wallet.cards.length}</strong> cards</span><span><strong>${state.wallet.programs.length}</strong> points programs</span><span><strong>${state.wallet.benefits.length}</strong> credits & assets</span><span><strong>${state.trips.length}</strong> itineraries</span>`;
    renderHome();
    if (resultChanged) {
      if (!state.trips.some(t=>t.id===activeId)) activeId = state.trips.find(t=>t.id===new URLSearchParams(location.search).get('trip'))?.id || state.trips[0]?.id || '';
      renderFindings(); window.renderActions?.(); if (currentTab==='overview') window.loadOverview();
    }
    if (!draft || (!dirty && !$('#wallet-setup').open && !$('#wallet-editor').open && draftRevision !== state.wallet.revision)) loadWallet(); else walletStatus();
    if(currentTab==='credentials') await refreshVault();
  } catch(error) { notice(error.message, true); }
}
$('#wallet-form').addEventListener('input', event => {
  const entry = event.target.closest('[data-section]');
  if (entry && event.target.dataset.field) {
    const row = draft[entry.dataset.section][Number(entry.dataset.index)];
    row[event.target.dataset.field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    if(event.target.dataset.field==='person_id')row.owner=draft.people.find(p=>p.id===row.person_id)?.name||'';
    if (event.target.dataset.field === 'name') {
      entry.querySelector('.wallet-image').innerHTML = walletImage(entry.dataset.section,row);
      if(entry.dataset.section==='benefits') { const template=assetCatalog.find(a=>a.name===row.name);if(template){row.kind=template.kind;entry.querySelector('[data-field=kind]').value=template.kind;} }
    }
  } else if (event.target.id === 'wallet-preferences') draft.preferences = event.target.value;
  dirty = true; walletStatus();
  if($('#wallet-editor').open)updateRewardSuggestion();
});
$('#wallet-form').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.add) {
    const section = button.dataset.add;
    if(!$('#wallet-person').value){openWalletSetup();return;}
    const person=draft.people.find(p=>p.id===$('#wallet-person').value);const common = {id:crypto.randomUUID(),name:'',person_id:person?.id||'',owner:person?.name||'',reported_on:''};
    draft[section].push(section === 'cards' ? {...common,notes:''} : section === 'programs' ? {...common,balance:'',status:'',approximate:false,preserve:false,notes:''} : {...common,kind:'credit',remaining:'',expires_on:'',notes:''});
    dirty = true; renderWallet();if($('#wallet-tables').hidden)editWallet(section,draft[section].length-1,true);else $(`#wallet-${section} tbody tr:last-child [data-field=name]`).focus();
  } else if (button?.dataset.remove) {
    const section=button.dataset.remove,index=Number(button.dataset.index),id=draft[section][index].id; if(!confirm('Remove this entry? Links to it will be cleared; other balances stay unchanged.'))return; draft[section].splice(index,1);for(const entry of [...draft.cards,...draft.benefits])for(const key of ['reward_account_id','card_id','program_id'])if(entry[key]===id)entry[key]=''; dirty = true; renderWallet();
  }
});
$('#wallet-form').addEventListener('keydown', event=>{
  if(event.key!=='Enter' || event.target.tagName==='TEXTAREA' || !event.target.dataset.field) return;
  event.preventDefault();const row=event.target.closest('tr');if(!row)return;const table=row.closest('tbody');
  const rows=[...table.querySelectorAll('tr')].filter(r=>!r.hidden), index=rows.indexOf(row)+(event.shiftKey?-1:1);
  rows[index]?.querySelector(`[data-field="${event.target.dataset.field}"]`)?.focus();
});
$('#import-profile').onclick=async()=>{if(dirty&&!confirm('Discard unsaved edits and load the existing profile into this empty wallet?'))return;if(await act('import-profile',{expected_revision:draftRevision}))loadWallet();};
$('#wallet-form').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;notice('Saving wallet…');
  const sent = JSON.stringify(draft);
  try {
    const result = await api('wallet',{wallet:JSON.parse(sent),expected_revision:draftRevision});
    state.wallet = result.wallet;
    if (JSON.stringify(draft) === sent) {$('#wallet-editor').close();loadWallet();}
    else { draftRevision = result.wallet.revision; walletStatus(); }
    notice(result.message);
  } catch(error) { notice(error.message,true); await refresh(); }
  button.disabled = false;
};
$('#reload-wallet').onclick = () => { if (!dirty || confirm('Discard unsaved wallet edits and reload the saved wallet?')) loadWallet(); };
$('#delete-wallet').onclick = async () => {
  if (!confirm('Delete your saved personal wallet and discard unsaved wallet edits? Trip results and downloaded files will stay.')) return;
  if (await act('delete-wallet',{expected_revision:draftRevision})) loadWallet();
};
for (const id of ['search','kind','availability','shortlisted']) $('#'+id).addEventListener('input', renderFindings);
$('#options').addEventListener('change', async event => {
  const t = trip(), target = event.target, key = target.dataset.shortlist ? 'shortlist' : 'selected', id = target.dataset.shortlist || target.dataset.select;
  if (!t || !id) return;
  const body = {id:t.id,shortlist:[...t.shortlist],selected:[...t.selected],expected_revision:t.selection_revision};
  body[key] = target.checked ? [...body[key],id] : body[key].filter(i=>i!==id);
  await act('selection',body); renderFindings();
});
$('#export').onclick = () => { if (trip()) location.href = '/api/export/' + trip().id; };
$('#delete-results').onclick = async () => {
  const t = trip();
  if (t && confirm(`Delete “${t.findings.title}” from this device? Your wallet and downloaded copies will stay.`)) await act('delete-results',{id:t.id,expected_revision:t.revision});
};
$('#stop').onclick = async () => {
  if (!confirm('Close the local server? Saved results and your wallet stay on this device. Unsaved wallet edits will be lost.')) return;
  try { const result = await api('stop',{}); stopped = true; notice(result.message); } catch(error) { notice(error.message,true); }
};
window.addEventListener('beforeunload', event => { if (dirty && !stopped) { event.preventDefault(); event.returnValue = ''; } });
(async () => {
  try {
    const token = new URLSearchParams(location.hash.slice(1)).get('key');
    if (token) { await api('session',{token}); history.replaceState(null,'',location.pathname + location.search); }
    const loaded = await Promise.all(['/assets/brands.json','/assets/cards.json','/assets/wallet-assets.json'].map(path=>fetch(path).then(r=>r.json())));
    [brands,cards] = loaded; assetCatalog=loaded[2].items;
    $('#asset-names').innerHTML=assetCatalog.map(a=>`<option value="${esc(a.name)}"></option>`).join('');
    $('#asset-catalog').innerHTML=assetCatalog.map(a=>`<p><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.name)} ↗</a> <span class="muted">${esc(a.note)}</span></p>`).join('');
    $('#card-names').innerHTML = cards.map(c=>`<option value="${esc(c.name)}"></option>`).join('');
    await refresh();
    if (location.pathname==='/travel/trips') history.replaceState(null,'',`/travel${location.search}`);
    tab(Object.keys(routes).find(name=>routes[name]===location.pathname)||'home',false);
    openReviewLink();
    window.loadOnboarding?.();
    $('#program-names').innerHTML = (state?.providers || []).flatMap(p=>p.programs).map(p=>`<option value="${esc(p)}"></option>`).join('');
    $('#provider-names').innerHTML=(state?.providers || []).map(p=>`<option value="${esc(p.name)}"></option>`).join('');
    setInterval(refresh,3000);
  } catch(error) { notice(error.message,true); }
})();

async function refreshVault() {
  try {let next=await api('vault');if(next.supported&&!next.exists)next=await api('vault/device',{});const changed=JSON.stringify(next)!==JSON.stringify(vaultState);vaultState=next;if(changed)renderVault();}catch(error){$('#vault-status').textContent=error.message;}
}
function renderVault() {
  const v=vaultState;
  $('#vault-status').textContent=!v.supported?'Encrypted sign-ins require the optional cryptography package.':v.unlocked?'Sign-ins are encrypted in local JSON. Passwords are never shown or exported.':v.exists?'Unlock the older password-protected sign-ins once to move them to device encryption.':'Sign-ins are unavailable.';
  $('#migrate-vault').hidden=!v.unlocked||v.device;$('#vault-unlock').hidden=v.unlocked || !v.supported || !v.exists;$('#vault-open').hidden=!v.unlocked;
  $('#unlock-vault').textContent='Unlock older sign-ins';
  if(!v.unlocked){$('#credential-form').reset();$('#credential-id').value='';return;}
  $('#vault-list').innerHTML=`<table><thead><tr><th>Provider</th><th>Label</th><th>Username</th><th>Password</th><th>Actions</th></tr></thead><tbody>${v.entries.map(e=>`<tr><td>${esc(e.provider)}</td><td>${esc(e.label)}</td><td>${esc(e.username)}</td><td>••••••••</td><td><button data-edit-credential="${e.id}" type="button">Replace</button> <button data-delete-credential="${e.id}" type="button">Delete</button></td></tr>`).join('')}</tbody></table>`;
}
$('#vault-unlock').onsubmit=async event=>{
  event.preventDefault();const password=$('#master-password').value;$('#master-password').value='';event.submitter.disabled=true;
  try{vaultState=await api('vault/'+(vaultState.exists?'unlock':'create'),{master_password:password});renderVault();}catch(error){$('#vault-status').textContent=error.message;}finally{event.submitter.disabled=false;}
};
$('#credential-form').onsubmit=async event=>{
  event.preventDefault();event.submitter.disabled=true;
  const body={login_origin:$('#credential-origin').value,provider:$('#credential-provider').value,label:$('#credential-label').value,username:$('#credential-username').value,password:$('#credential-password').value,expected_revision:vaultState.revision};
  if($('#credential-id').value)body.id=$('#credential-id').value;
  $('#credential-password').value='';
  try{const previousIds=new Set(vaultState.entries.map(e=>e.id));vaultState=await api('vault/save',body);if(pendingAccountId){const account=draft.programs.find(a=>a.id===pendingAccountId);const savedId=body.id||vaultState.entries.find(e=>!previousIds.has(e.id))?.id;if(account&&savedId){$('#credential-id').value=savedId;account.credential_id=savedId;dirty=true;await persistWallet();}pendingAccountId='';$('#credential-association').hidden=true;}$('#credential-form').reset();$('#credential-id').value='';renderVault();$('#vault-status').textContent='Sign-in saved in encrypted local JSON.';}catch(error){$('#vault-status').textContent=error.message;}finally{event.submitter.disabled=false;}
};
$('#new-credential').onclick=()=>{pendingAccountId='';$('#credential-association').hidden=true;$('#credential-form').reset();$('#credential-id').value='';};
$('#vault-list').onclick=async event=>{
  const button=event.target.closest('button');if(!button)return;
  const id=button.dataset.editCredential || button.dataset.deleteCredential;
  if(button.dataset.editCredential){const e=vaultState.entries.find(e=>e.id===id);for(const key of ['id','provider','label','username'])$('#credential-'+key).value=e[key];$('#credential-origin').value=e.login_origin||'';$('#credential-password').value='';$('#credential-password').focus();}
  else if(confirm('Delete this saved sign-in? The provider account will stay unchanged.')){try{vaultState=await api('vault/delete',{id,expected_revision:vaultState.revision});renderVault();if(draft.programs.some(a=>a.credential_id===id)){for(const a of draft.programs)if(a.credential_id===id)a.credential_id='';dirty=true;await persistWallet();}}catch(error){$('#vault-status').textContent=error.message;}}
};
async function loadPlugins(){$('#plugin-note').textContent='Loading installed plugins…';try{pluginInventory=await api('plugins');renderPlugins();}catch(error){$('#plugin-note').textContent=error.message;}}
function renderPlugins(){
  if(!pluginInventory)return;const words=$('#skill-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);$('#plugin-note').textContent=pluginInventory.note;
  $('#plugin-list').innerHTML=pluginInventory.plugins.map(p=>{const skills=p.skills.filter(s=>words.every(w=>(p.name+' '+s.name+' '+s.description).toLowerCase().includes(w)));if(!skills.length&&words.length)return '';return `<section class="plugin"><div class="plugin-heading"><span class="plugin-symbol">${p.name==='walletfreak'?'<img src="/assets/mascot.png" alt="">':esc(p.name.slice(0,2).toUpperCase())}</span><div><h3>${esc(p.name)}</h3><small>${esc(p.version)} · ${p.enabled?'Enabled':'Disabled'} · ${p.skills.length} skills</small></div></div><div class="skill-grid">${skills.map(s=>`<details class="skill"><summary><strong>${esc(s.name)}</strong><span>${esc(s.description)}</span></summary><pre>${esc(s.content)}</pre></details>`).join('')}</div></section>`;}).join('');
}
$('#skill-search').oninput=renderPlugins;

function setWalletView(table){$('#wallet-tables').hidden=!table;$('#wallet-tiles').hidden=table;$('#wallet-view-table').setAttribute('aria-pressed',String(table));$('#wallet-view-cards').setAttribute('aria-pressed',String(!table));}
$('#wallet-view-cards').onclick=()=>{renderWalletTiles();filterWallet();setWalletView(false);};
$('#wallet-view-table').onclick=()=>{renderWallet();setWalletView(true);};
function walletTile(section,r,i){
  const account=draft.programs.find(a=>a.id===r.reward_account_id);
  const linked=draft.cards.find(c=>c.id===r.card_id)||draft.programs.find(a=>a.id===r.program_id);
  const art=`<div class="wallet-image provider">${walletImage(section,r)}</div>`;
  let content='';
  if(section==='cards'){
    const parts=String(r.name||'').split(';'),uncertain=/^Exact product not reported/i.test(parts[0]);
    const name=uncertain?'Card to identify':parts[0].trim()||'Card to identify';
    const note=uncertain?r.name:parts.slice(1).join(';').trim();
    content=`${art}<h4>${esc(name)}</h4>${note?`<small class="wallet-qualifier">${esc(note)}</small>`:''}<p class="wallet-linked">${account?`<button type="button" data-edit-wallet="programs" data-index="${draft.programs.indexOf(account)}">${esc(account.name)} ↗</button>`:`<button type="button" data-edit-wallet="cards" data-index="${i}">Link rewards account ↗</button>`}</p><small>${draft.benefits.filter(b=>b.card_id===r.id).length} linked benefits</small><div class="wallet-tile-actions"><button type="button" data-edit-wallet="cards" data-index="${i}">Edit card</button></div>`;
  } else if(section==='programs'){
    content=`${art}<h4>${esc(r.account_label||r.name||'Rewards account')}</h4>${r.account_label?`<small>${esc(r.name)}</small>`:''}<strong class="wallet-balance">${r.balance?`${r.approximate?'≈ ':''}${Number(r.balance).toLocaleString()}`:'Balance not reported'}</strong><small>${esc(r.status||'Status not reported')} · Reported ${esc(r.reported_on||'date unknown')}</small><p class="wallet-linked">${draft.cards.filter(c=>c.reward_account_id===r.id).length} linked cards · ${r.credential_id?'Sign-in linked':'No sign-in linked'}</p><div class="wallet-tile-actions"><button type="button" data-edit-wallet="programs" data-index="${i}">Edit account</button><button type="button" data-account-signin="${esc(r.id)}">${r.credential_id?'Manage sign-in':'Add sign-in'}</button><button type="button" data-account-sync="${esc(r.id)}">Ask agent to refresh</button></div>`;
  } else {
    content=`${art}<h4>${esc(r.name||'Credit or travel fund')}</h4><strong class="wallet-balance">${esc(r.remaining||'Remaining unknown')}</strong><small>Expires ${esc(r.expires_on||'date unknown')}</small><p class="wallet-linked">${esc(linked?.name||'Not linked to a card or program')}</p><div class="wallet-tile-actions"><button type="button" data-edit-wallet="benefits" data-index="${i}">Edit asset</button></div>`;
  }
  return `<article class="wallet-tile wallet-tile-${section}" data-section="${section}" data-index="${i}">${content}</article>`;
}
function renderWalletTiles(){
  $('#setup-wallet').textContent=draft.people.length?'Manage people':'Set up a wallet';
  $('#wallet-tiles').innerHTML=['cards','programs','benefits'].map(section=>`<section class="wallet-section"><div class="section-heading"><h3>${{cards:'Cards',programs:'Rewards accounts',benefits:'Credits & travel funds'}[section]}</h3><button type="button" data-add="${section}">${{cards:'+ Add card',programs:'+ Add loyalty program',benefits:'+ Add asset'}[section]}</button></div><div class="wallet-tiles">${draft[section].map((r,i)=>walletTile(section,r,i)).join('')||'<p class="muted">Add your first entry. Unknown balances can stay blank.</p>'}</div></section>`).join('');
  $('#wallet-tiles').querySelectorAll('[data-account-signin]').forEach(b=>b.onclick=()=>openAccountSignin(b.dataset.accountSignin));
  $('#wallet-tiles').querySelectorAll('[data-account-sync]').forEach(b=>b.onclick=()=>openAccountSync(b.dataset.accountSync));
  $('#wallet-tiles').querySelectorAll('[data-edit-wallet]').forEach(b=>b.onclick=()=>editWallet(b.dataset.editWallet,Number(b.dataset.index)));
}
let editorSnapshot,editorDirty;
async function editWallet(section,index,isNew=false){
 if(section==='programs')await refreshVault();
 if(!$('#wallet-editor').open){editorSnapshot=structuredClone(draft);editorDirty=dirty;if(isNew)editorSnapshot[section].splice(index,1);}
 const row=draft[section][index];$('#wallet-editor-title').textContent={cards:'Card & rewards',programs:'Rewards account',benefits:'Credit or travel fund'}[section];
 $('#wallet-editor-fields').innerHTML=`<div data-section="${section}" data-index="${index}"><div class="wallet-image provider">${walletImage(section,row)}</div><div class="wallet-edit-grid">${columns[section].map(c=>`<label>${esc(c[1])}${cell(section,index,row,c)}</label>`).join('')}</div></div>`;
 updateRewardSuggestion();if(!$('#wallet-editor').open)$('#wallet-editor').showModal();$('#wallet-editor-fields [data-field=name]').focus();
}
function suggestedProgram(name){
 const n=name.toLowerCase();
 const pairs=[['hilton','Hilton Honors'],['hyatt','World of Hyatt'],['marriott','Marriott Bonvoy'],['united','MileagePlus'],['delta','SkyMiles'],['southwest','Rapid Rewards'],['sapphire','Chase Ultimate Rewards'],['freedom','Chase Ultimate Rewards'],['venture','Capital One Miles'],['american express platinum','Amex Membership Rewards'],['american express gold','Amex Membership Rewards']];
 return pairs.find(([key])=>n.includes(key))?.[1];
}
function updateRewardSuggestion(){const entry=$('#wallet-editor-fields [data-section]'),box=$('#reward-suggestion');box.innerHTML='';if(entry?.dataset.section!=='cards')return;const card=draft.cards[Number(entry.dataset.index)],name=suggestedProgram(card.name);if(card.reward_account_id||!name)return;box.innerHTML=`<p class="muted">Suggested earning program: ${esc(name)}. Choose an existing account above, or create a separate account below. Transfer partners are separate from the earning account.</p><button type="button" id="create-reward-account">Create ${esc(name)} account</button>`;$('#create-reward-account').onclick=()=>{const account={id:crypto.randomUUID(),name,owner:card.owner,person_id:card.person_id,balance:'',approximate:false,status:'',preserve:false,reported_on:'',notes:''};draft.programs.push(account);card.reward_account_id=account.id;dirty=true;editWallet('cards',Number(entry.dataset.index));};}
async function persistWallet(){
 notice('Saving wallet…');
 const sent=JSON.stringify(draft),result=await api('wallet',{wallet:JSON.parse(sent),expected_revision:draftRevision});state.wallet=result.wallet;
 if(JSON.stringify(draft)===sent)loadWallet();else draftRevision=result.wallet.revision;
 notice(result.message);return result;
}
function cancelWalletEditor(){draft=editorSnapshot;dirty=editorDirty;$('#wallet-editor').close();$('#wallet-editor-fields').innerHTML='';renderWallet();}
$('#wallet-editor-close').onclick=cancelWalletEditor;
$('#wallet-editor-done').onclick=async()=>{if(![...$('#wallet-editor-fields').querySelectorAll('input,select,textarea')].every(el=>el.reportValidity()))return;const button=$('#wallet-editor-done');button.disabled=true;try{await persistWallet();$('#wallet-editor').close();$('#wallet-editor-fields').innerHTML='';}catch(e){notice(e.message,true);}finally{button.disabled=false;}};
$('#wallet-editor').addEventListener('cancel',e=>{e.preventDefault();cancelWalletEditor();});

function renderPeople(){const current=$('#wallet-person').value;$('#wallet-person').innerHTML='<option value="">Everyone</option>'+draft.people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');$('#wallet-person').value=current;}
$('#wallet-person').onchange=filterWallet;
$('#migrate-vault').onclick=async()=>{try{vaultState=await api('vault/migrate-device',{});renderVault();}catch(e){notice(e.message,true);}};
