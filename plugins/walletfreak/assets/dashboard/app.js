'use strict';
document.addEventListener('error', event => {
  if (event.target.matches?.('img.hotel-photo-image')) event.target.hidden = true;
}, true);

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, activeId = '', brands = {}, cards = [], walletPrograms = [], draft, draftRevision, dirty = false, stopped = false, assetCatalog = [], vaultState, pluginInventory, currentTab = 'home';
const programDraftCategories = new Map();
$('#signins-dialog').append($('#saved-signins'));
$('#wallet').append($('#credential-dialog'));
$('#wallet-connections').remove();
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
const routes = {home:'/',overview:'/travel',wallet:'/wallet',spending:'/spending',shopping:'/shopping',plugins:'/settings/plugins'};
const legacyRoutes = {'/actions':'overview','/credit-cards':'wallet','/settings/sign-ins':'wallet'};
function openReviewLink() {
  if (location.pathname !== '/travel') return;
  const query = new URLSearchParams(location.search), review = query.get('review');
  if (!['comparison','research'].includes(review)) return;
  $('#trip-library').open = true; $('#trip-alternatives').open = true;
  requestAnimationFrame(() => (review === 'comparison' ? $('#comparison') : $('#options')).scrollIntoView({block:'start'}));
}
function tab(name, navigate=true) {
  if (name==='credentials') name='wallet';
  if (name==='actions') name='overview';
  if (!routes[name]) name='overview';
  if (legacyRoutes[location.pathname]===name) history.replaceState(null,'',routes[name]);
  currentTab=name; document.body.dataset.view=name; $('.workspace-more').open=false;
  $('#onboarding').hidden=name!=='home'||!state?.onboarding?.show;
  if (navigate && location.pathname!==routes[name]) history.pushState(null,'',name==='overview'&&activeId?`/travel?trip=${encodeURIComponent(activeId)}`:routes[name]);
  if (name==='home') renderHome(); if (name==='overview') window.loadOverview(); if (name==='spending') window.loadSpending(); if (name==='shopping') window.loadShopping(); if (name==='plugins') loadPlugins(); if (name==='wallet') refreshVault();
  for (const item of document.querySelectorAll('.workspace-nav [data-tab]')) item.setAttribute('aria-pressed',String(item.dataset.tab===name));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden=panel.id!==name;
}
document.querySelectorAll('.workspace-nav [data-tab]').forEach(button => button.addEventListener('click', () => tab(button.dataset.tab)));
window.addEventListener('popstate',()=>{
  const requested = new URLSearchParams(location.search).get('trip');
  if (location.pathname==='/travel' && state?.trips.some(t=>t.id===requested)) {activeId=requested;renderFindings();}
  tab(Object.keys(routes).find(name=>routes[name]===location.pathname)||legacyRoutes[location.pathname]||'home',false);
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
  $('#home-stats').innerHTML=`<article><strong>${trips.length}</strong><span>Saved trips</span></article><article><strong>${open.length}</strong><span>Trip steps</span></article><article><strong>${state.wallet.cards.length}</strong><span>Cards tracked</span></article><article><strong>${state.wallet.programs.length}</strong><span>Reward programs</span></article>`;
  $('#home-trips').innerHTML=trips.length?trips.map(t=>`<button type="button" class="home-trip" data-home-trip="${esc(t.id)}">${photo(t)?`<img src="${esc(photo(t))}" alt="" loading="lazy">`:'<span class="home-trip-art" aria-hidden="true">↗</span>'}<span><strong>${esc(t.findings.title)}</strong><small>${esc(t.findings.itinerary?.[0]?.day||'Dates to confirm')} · ${esc(t.findings.itinerary?.length||0)} itinerary items</small></span></button>`).join(''):'<p class="note">No saved trips yet. Ask your agent to plan a trip, then it will appear here.</p>';
  $('#home-actions').innerHTML=open.length?open.slice(0,3).map(a=>`<button type="button" data-home-action="${esc(a.trip)}"><span class="eyebrow">${esc(trips.find(t=>t.id===a.trip)?.findings.title||'TRIP')}</span><strong>${esc(a.title)}</strong><small>${esc(typeof a.detail==='string'?a.detail:'Review this step in Travel.')}</small></button>`).join(''):'<p class="note">No trip actions need your attention right now.</p>';
}
$('#home').addEventListener('click',event=>{const nav=event.target.closest('[data-tab]');if(nav){tab(nav.dataset.tab);return;}const action=event.target.closest('[data-home-action]');if(action){tab('overview');window.selectTravelTrip(action.dataset.homeAction);requestAnimationFrame(()=>$('#travel-actions').scrollIntoView({block:'start'}));return;}const target=event.target.closest('[data-home-trip]');if(!target)return;tab('overview');if(target.dataset.homeTrip)window.selectTravelTrip(target.dataset.homeTrip);});
function trip() { return state?.trips.find(t => t.id === activeId); }
function logo(name) {
  if (typeof name !== 'string') return '';
  const aliases={'amex membership rewards':'amex-travel','chase ultimate rewards':'chase-travel','capital one miles':'capital-one-travel','citi thankyou points':'citi-travel'};
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
  const card = cards.find(c=>c.id===row.product_id) || cards.find(c => c.name.toLowerCase() === name) || cards.find(c=>c.id === alias[Object.keys(alias).find(k=>name.startsWith(k))]);
  return card ? `<img class="card-art" src="/assets${esc(card.path)}" alt="${esc(card.name)} artwork">` : '<span class="card-placeholder" aria-hidden="true">▰</span>';
}
const assetKinds = {'credit':'Card credit / offer','certificate':'Free-night certificate','gift-card':'Gift card','travel-bank':'TravelBank / stored funds','travel-credit':'Airline / trip credit','companion':'Companion certificate','upgrade':'Upgrade award','lounge-pass':'Lounge visits / passes','membership':'Membership','voucher':'Voucher / award','cashback':'Cash-back balance','other':'Other asset'};
const columns = {
  cards: [['name','Card name'],['nickname','Nickname'],['reward_account_id','Rewards account','relationship'],['credential_id','Saved sign-in','credential'],['person_id','Person','person'],['reported_on','Reported on','date'],['notes','Card details','textarea']],
  programs: [['name','Loyalty program'],['account_label','Account label'],['member_hint','Member ID hint (last 4)'],['credential_id','Saved sign-in','credential'],['balance','Points / miles'],['approximate','Approx.','checkbox'],['status','Membership tier'],['preserve','Preserve','checkbox'],['person_id','Person','person'],['reported_on','Reported on','date'],['notes','Notes','textarea']],
  benefits: [['kind','Type','select'],['card_id','Linked card','relationship'],['program_id','Linked program','relationship'],['name','Asset name'],['remaining','Remaining / currency'],['person_id','Person','person'],['expires_on','Expires on','date'],['reported_on','Reported on','date'],['notes','Restrictions / period','textarea']]
};
function loyaltyChoices(){return walletPrograms;}
function catalogProgram(row){return walletPrograms.find(p=>p.id===row.catalog_id)||walletPrograms.find(p=>[p.name,...p.aliases].some(name=>name.toLowerCase()===String(row.name||'').toLowerCase()));}
function currentTiers(program){return program?.future_tiers&&new Date().toISOString().slice(0,10)>=program.future_tiers.effective_on?program.future_tiers.tiers:program?.tiers||[];}
function programChoice(row,index){
  const category=programDraftCategories.get(row.id),choices=loyaltyChoices().filter(item=>!category||item.category===category),selected=catalogProgram(row),custom=!!row.name&&!selected;
  const groups=[...new Set(choices.map(item=>item.category))].map(category=>`<optgroup label="${esc(category==='Credit cards'?'Bank rewards':category)}">${choices.filter(item=>item.category===category).map(item=>`<option value="${esc(item.name)}" ${selected?.name===item.name?'selected':''}>${esc(item.name)}</option>`).join('')}</optgroup>`).join('');
  return `<select data-program-choice aria-label="Loyalty program ${index+1}" required><option value="" ${!row.name?'selected':''}>Choose a program</option>${groups}<option value="other" ${custom?'selected':''}>Other program…</option></select><input data-field="name" aria-label="Other loyalty program ${index+1}" type="text" maxlength="300" value="${custom?esc(row.name):''}" ${custom?'required':'hidden disabled'} placeholder="Program name">`;
}
function updateProgramChoice(select,row){
  const input=select.parentElement.querySelector('[data-field=name]'),custom=select.value==='other',previous=catalogProgram(row);
  input.hidden=!custom;input.disabled=!custom;input.required=custom;row.name=custom?input.value:select.value;
  const program=walletPrograms.find(item=>item.name===row.name);if(program)row.catalog_id=program.id;else delete row.catalog_id;
  if(previous?.id!==program?.id)row.status='';
  dirty=true;walletStatus();
  if(custom){if(previous)programDraftCategories.set(row.id,previous.category);input.focus();return;}
  editWallet('programs',Number(select.closest('[data-section]').dataset.index));
}
function cell(section, index, row, [key,label,type='text']) {
  const attrs = `data-field="${key}" aria-label="${label} ${index+1}"`;
  if(section==='programs'&&key==='name')return programChoice(row,index);
  if(section==='programs'&&key==='status'){
    const program=catalogProgram(row),tiers=currentTiers(program);
    if(!tiers.length)return `<input ${attrs} type="text" maxlength="300" value="${esc(row.status||'')}" placeholder="Optional status as reported">`;
    const legacy=row.status&&!tiers.includes(row.status)?`<option value="${esc(row.status)}" selected>${esc(row.status)} (saved)</option>`:'';
    return `<select ${attrs}><option value="" ${!row.status?'selected':''}>Not provided</option>${tiers.map(tier=>`<option value="${esc(tier)}" ${row.status===tier?'selected':''}>${esc(tier)}</option>`).join('')}${legacy}</select>`;
  }
  if (type === 'credential') return `<select ${attrs}><option value="">Not linked</option>${(vaultState?.entries||[]).map(e=>`<option value="${esc(e.id)}" ${row[key]===e.id?'selected':''}>${esc(e.provider)} · ${esc(e.label||'Saved sign-in')}</option>`).join('')}${row[key]&&!(vaultState?.entries||[]).some(e=>e.id===row[key])?`<option value="${esc(row[key])}" selected>Saved sign-in (unlock to view)</option>`:''}</select>`;
  if (type === 'person') return `<select ${attrs}><option value="">Unassigned</option>${draft.people.map(p=>`<option value="${esc(p.id)}" ${row.person_id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
  if (type === 'relationship') {let entries=draft[key==='card_id'?'cards':'programs'];const earning=section==='cards'&&key==='reward_account_id'?cards.find(card=>card.id===row.product_id)?.program_id:null;if(earning)entries=entries.filter(item=>catalogProgram(item)?.id===earning);return `<select ${attrs}><option value="">Not linked</option>${entries.map(r=>`<option value="${esc(r.id)}" ${row[key]===r.id?'selected':''}>${esc(r.account_label||r.name||'Unnamed')} ${r.owner?'· '+esc(r.owner):''}</option>`).join('')}</select>`;}
  if (type === 'textarea') return `<textarea ${attrs} maxlength="4000" rows="1">${esc(row[key] || '')}</textarea>`;
  if (type === 'select') return `<select ${attrs}>${Object.entries(assetKinds).map(([id,name])=>`<option value="${id}" ${row[key]===id?'selected':''}>${name}</option>`).join('')}</select>`;
  let extra = key === 'name' ? `required list="${section==='cards'?'card-names':section==='programs'?'program-names':'asset-names'}"` : '';
  if (key === 'balance') extra = 'inputmode="numeric" pattern="[0-9]{1,13}" maxlength="13"';
  return `<input ${attrs} type="${type}" ${type==='checkbox' ? (row[key]?'checked':'') : `value="${esc(row[key] || '')}"`} ${extra} ${type==='text'&&key!=='balance'?'maxlength="300"':''}>`;
}
function renderWallet() {
  for (const section of ['cards','programs','benefits']) {
    const rows=draft[section].map((row,index)=>{
      const account=draft.programs.find(program=>program.id===row.reward_account_id),program=catalogProgram(row),product=cards.find(card=>card.id===row.product_id);
      const name=row.nickname||row.account_label||row.name;
      const detail=section==='cards'?(account?.name||'No earning program linked'):section==='programs'?(row.balance?`${row.approximate?'≈ ':''}${Number(row.balance).toLocaleString()} points / miles`:'Balance unknown'):(row.remaining||'Amount unknown');
      const tier=section==='programs'?(program?.category==='Credit cards'?'—':row.status||'Not provided'):section==='cards'?(product?.status_benefit?`${product.status_benefit.tier} card benefit · confirm`:'—'):(row.expires_on?`Expires ${row.expires_on}`:'—');
      return `<tr><th scope="row"><span class="wallet-list-name">${walletImage(section,row)}<span>${esc(name||'Unnamed')}</span></span></th><td data-label="${section==='cards'?'Earning program':section==='programs'?'Balance':'Remaining'}">${esc(detail)}</td><td data-label="${section==='benefits'?'Expiry':'Membership tier / benefit'}">${esc(tier)}</td><td data-label="Sign-in">${section==='benefits'?'—':syncControls(section,row)}</td><td><button type="button" data-edit-wallet="${section}" data-index="${index}">Edit</button></td></tr>`;
    }).join('');
    $(`#wallet-${section}`).innerHTML=`<table class="wallet-list"><thead><tr><th scope="col">${section==='cards'?'Card':section==='programs'?'Program':'Credit'}</th><th scope="col">${section==='cards'?'Earning program':section==='programs'?'Balance':'Remaining'}</th><th scope="col">${section==='benefits'?'Expiry':'Membership tier / benefit'}</th><th scope="col">Sign-in</th><th scope="col">Action</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Nothing added yet.</td></tr>'}</tbody></table>`;
  }
  renderWalletTiles();walletStatus();
}
function walletStatus() {
  $('#wallet-status').textContent = dirty ? 'Unsaved changes' : '';
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
    const requestsChanged = !state || JSON.stringify(state.refresh_requests) !== JSON.stringify(next.refresh_requests);
    state = next;
    if ($('#trip-manager').open) renderTripManager();
    $('#wallet-summary').innerHTML = `<span><strong>${state.wallet.cards.length}</strong> cards</span><span><strong>${state.wallet.programs.length}</strong> points programs</span><span><strong>${state.wallet.benefits.length}</strong> credits & assets</span><span><strong>${state.trips.length}</strong> itineraries</span>`;
    renderHome();
    if (resultChanged) {
      if (!state.trips.some(t=>t.id===activeId)) activeId = state.trips.find(t=>t.id===new URLSearchParams(location.search).get('trip'))?.id || state.trips[0]?.id || '';
      renderFindings(); window.renderActions?.(); if (currentTab==='overview') window.loadOverview();
    }
    if (!draft || (!dirty && !$('#wallet-setup').open && !$('#wallet-editor').open && draftRevision !== state.wallet.revision)) loadWallet(); else {walletStatus();if(requestsChanged)renderWalletTiles();}
    if(currentTab==='wallet') await refreshVault();
  } catch(error) { notice(error.message, true); }
}
$('#wallet-form').addEventListener('input', event => {
  const entry = event.target.closest('[data-section]');
  if(!entry)return;
  if(entry&&event.target.hasAttribute('data-program-choice')){updateProgramChoice(event.target,draft.programs[Number(entry.dataset.index)]);return;}
  if (entry && event.target.dataset.field) {
    const row = draft[entry.dataset.section][Number(entry.dataset.index)];
    row[event.target.dataset.field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    if(event.target.dataset.field==='person_id')row.owner=draft.people.find(p=>p.id===row.person_id)?.name||'';
    if (event.target.dataset.field === 'name') {
      if(entry.dataset.section==='cards'&&row.product_id&&cards.find(card=>card.id===row.product_id)?.name!==row.name)delete row.product_id;
      entry.querySelector('.wallet-image').innerHTML = walletImage(entry.dataset.section,row);
      if(entry.dataset.section==='benefits') { const template=assetCatalog.find(a=>a.name===row.name);if(template){row.kind=template.kind;entry.querySelector('[data-field=kind]').value=template.kind;} }
    }
  }
  dirty = true; walletStatus();
  if($('#wallet-editor').open)updateRewardSuggestion();
});
function removeWalletEntry(section,index){
  const row=draft[section]?.[index];if(!row)return;
  draft[section].splice(index,1);
  for(const entry of [...draft.cards,...draft.benefits])for(const key of ['reward_account_id','card_id','program_id'])if(entry[key]===row.id)entry[key]='';
  dirty=true;renderWallet();
}
$('#wallet-form').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.add) {
    const section = button.dataset.add;
    if(section==='cards'){openCardPicker(-1);return;}
    if(section==='programs'){openProgramPicker(button.dataset.programCategory||'');return;}
    if(!draft.people.length)draft.people.push({id:crypto.randomUUID(),name:'Me'});
    const person=draft.people.find(p=>p.id===$('#wallet-person').value)||draft.people[0];const common = {id:crypto.randomUUID(),name:'',person_id:person.id,owner:person.name,reported_on:''};
    draft[section].push({...common,kind:'credit',remaining:'',expires_on:'',notes:''});
    dirty = true; renderPeople();renderWallet();editWallet(section,draft[section].length-1,true);
  } else if (button?.dataset.remove) {
    if(!confirm('Remove this entry? Links to it will be cleared; other balances stay unchanged.'))return;
    removeWalletEntry(button.dataset.remove,Number(button.dataset.index));
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
function renderTripManager(){
  const trips=state?.trips||[];
  $('#trip-manager-list').innerHTML=trips.map(t=>`<article><strong>${esc(t.findings.title)}</strong><button type="button" class="quiet danger" data-delete-trip="${esc(t.id)}">Delete</button></article>`).join('')||'<p class="muted">No saved trips.</p>';
  $('#clear-trips').disabled=!trips.length;
}
$('#manage-trips').onclick=()=>{renderTripManager();$('#trip-manager').showModal();};
$('#trip-manager-close').onclick=()=>$('#trip-manager').close();
$('#trip-manager-list').onclick=async event=>{
  const button=event.target.closest('[data-delete-trip]'),t=state?.trips.find(item=>item.id===button?.dataset.deleteTrip);
  if(!t||!confirm(`Delete “${t.findings.title}” from this device? Your wallet and downloaded copies will stay.`))return;
  button.disabled=true;await act('delete-results',{id:t.id,expected_revision:t.revision});button.disabled=false;
};
$('#clear-trips').onclick=async event=>{
  const trips=state?.trips||[];
  if(!trips.length||!confirm(`Delete all ${trips.length} saved trips from this device? Your wallet and downloaded copies will stay.`))return;
  event.target.disabled=true;
  await act('clear-results',{confirm:'clear-all-trips',expected_trips:trips.map(t=>({id:t.id,revision:t.revision}))});
  event.target.disabled=!(state?.trips||[]).length;
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
    const loaded = await Promise.all(['/assets/brands.json','/assets/cards.json','/assets/wallet-assets.json','/assets/wallet-programs.json'].map(path=>fetch(path).then(r=>r.json())));
    [brands,cards] = loaded; assetCatalog=loaded[2].items;walletPrograms=loaded[3].programs;
    $('#asset-names').innerHTML=assetCatalog.map(a=>`<option value="${esc(a.name)}"></option>`).join('');
    $('#card-names').innerHTML = cards.map(c=>`<option value="${esc(c.name)}"></option>`).join('');
    await refresh();
    if (location.pathname==='/travel/trips') history.replaceState(null,'',`/travel${location.search}`);
    tab(Object.keys(routes).find(name=>routes[name]===location.pathname)||legacyRoutes[location.pathname]||'home',false);
    openReviewLink();
    window.loadOnboarding?.();
    setInterval(refresh,3000);
  } catch(error) { notice(error.message,true); }
})();

async function refreshVault() {
  try {let next=await api('vault');if(next.supported&&!next.exists)next=await api('vault/device',{});const changed=JSON.stringify(next)!==JSON.stringify(vaultState);vaultState=next;if(changed)renderVault();}catch(error){$('#vault-status').textContent=error.message;}
}
$('#manage-signins').onclick=()=>$('#signins-dialog').showModal();
$('#close-signins').onclick=()=>$('#signins-dialog').close();
function renderVault() {
  const v=vaultState;
  $('#vault-status').textContent=!v.supported?'Encrypted sign-ins require the optional cryptography package.':v.unlocked?'Passwords are encrypted on this device and are never shown or exported.':v.exists?'Unlock the older password-protected sign-ins once to move them to device encryption.':'Sign-ins are unavailable.';
  $('#migrate-vault').hidden=!v.unlocked||v.device;$('#vault-unlock').hidden=v.unlocked || !v.supported || !v.exists;$('#vault-open').hidden=!v.unlocked;
  $('#clear-signins').hidden=!v.entries.length;$('#manage-signins').hidden=v.unlocked&&!v.entries.length;
  $('#vault-list').classList.toggle('empty',!v.entries.length);
  $('#unlock-vault').textContent='Unlock older sign-ins';
  if(!v.unlocked){$('#credential-form').reset();$('#credential-id').value='';return;}
  $('#vault-list').innerHTML=v.entries.length?`<div class="connected-list">${v.entries.map(e=>`<article class="connected-account"><span class="connected-logo">${logo(e.provider)||'✦'}</span><div><strong>${esc(e.label||e.provider)}</strong><small>${esc(e.provider)} · ${esc(e.username)}</small></div><button data-edit-credential="${e.id}" type="button">Update</button><button data-delete-credential="${e.id}" type="button" class="danger">Remove</button></article>`).join('')}</div>`:'<p class="muted">No accounts connected yet.</p>';
  if(draft)renderWalletTiles();
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
  try{const previousIds=new Set(vaultState.entries.map(e=>e.id)),linked=!!pendingAccountId;vaultState=await api('vault/save',body);if(pendingAccountId){const [section,id]=pendingAccountId.split(':'),account=draft[section]?.find(a=>a.id===id);const savedId=body.id||vaultState.entries.find(e=>!previousIds.has(e.id))?.id;if(account&&savedId){account.credential_id=savedId;dirty=true;await persistWallet();}pendingAccountId='';$('#credential-association').hidden=true;}$('#credential-form').reset();$('#credential-id').value='';$('#credential-dialog').close();renderVault();notice(linked?'Sign-in saved and linked to this wallet item.':'Sign-in saved. Link it from a card or loyalty account.');}catch(error){notice(error.message,true);}finally{event.submitter.disabled=false;}
};
const credentialGroups=[['Hotels','Hotel loyalty','Hotels and stays'],['Flights','Airline loyalty','Flights and upcoming trips'],['Credit cards','Card portal','Travel portals and rewards']];
let credentialGroup='';
function credentialStep(step){
  $('#credential-categories').hidden=step!==1;$('#credential-providers').hidden=step!==2;$('#credential-form').hidden=step!==3;
  $('#credential-step-label').textContent=step===1?'1 OF 3 · CHOOSE ACCOUNT TYPE':step===2?'2 OF 3 · CHOOSE PROVIDER':'3 OF 3 · ACCOUNT DETAILS';
  if(step===2){$('#credential-providers').innerHTML=(state.providers||[]).filter(p=>p.category===credentialGroup).map(p=>`<button type="button" data-provider="${esc(p.name)}"><span>${logo(p.name)||'✦'}</span><strong>${esc(p.name)}</strong></button>`).join('')+'<button type="button" data-provider="other"><span>＋</span><strong>Other provider</strong></button>';}
  if(step===3)$('#credential-username').focus();
}
function openCredentialDialog(entry){
  $('#credential-provider').readOnly=true;$('#credential-form').reset();$('#credential-id').value='';$('#credential-association').hidden=!pendingAccountId;$('#credential-existing').hidden=true;
  if(entry){for(const key of ['id','provider','label','username'])$('#credential-'+key).value=entry[key]||'';$('#credential-origin').value=entry.login_origin||'';}
  $('#credential-back').hidden=!!entry||!!pendingAccountId;
  $('#credential-dialog').showModal();credentialStep(entry?3:1);
}
$('#credential-categories').innerHTML=credentialGroups.map(([id,title,caption])=>`<button type="button" data-category="${esc(id)}"><span class="choice-icon">${id==='Hotels'?'⌂':id==='Flights'?'✈':'▤'}</span><strong>${title}</strong><small>${caption}</small></button>`).join('');
$('#credential-categories').onclick=e=>{const button=e.target.closest('[data-category]');if(!button)return;credentialGroup=button.dataset.category;credentialStep(2);};
$('#credential-providers').onclick=e=>{const button=e.target.closest('[data-provider]');if(!button)return;const other=button.dataset.provider==='other';$('#credential-provider').readOnly=!other;$('#credential-provider').value=other?'':button.dataset.provider;credentialStep(3);if(other)$('#credential-provider').focus();};
$('#credential-back').onclick=()=>credentialStep(2);
$('#credential-close').onclick=()=>$('#credential-dialog').close();
$('#credential-dialog').addEventListener('close',()=>{pendingAccountId='';$('#credential-password').value='';});
async function unlinkSavedSignins(ids){
  if(![...draft.cards,...draft.programs].some(account=>ids.has(account.credential_id)))return;
  if(dirty)throw new Error('Save or reload wallet edits before removing linked sign-ins.');
  for(const account of [...draft.cards,...draft.programs])if(ids.has(account.credential_id))account.credential_id='';
  dirty=true;renderWallet();await persistWallet();
}
$('#vault-list').onclick=async event=>{
  const button=event.target.closest('button');if(!button)return;
  const id=button.dataset.editCredential || button.dataset.deleteCredential;
  if(button.dataset.editCredential){const e=vaultState.entries.find(e=>e.id===id);pendingAccountId='';openCredentialDialog(e);}
  else if(confirm('Delete this saved sign-in and unlink it from rewards accounts? The accounts and balances will stay.')){try{await unlinkSavedSignins(new Set([id]));vaultState=await api('vault/delete',{id,expected_revision:vaultState.revision});renderVault();notice('Saved sign-in deleted.');}catch(error){$('#vault-status').textContent=error.message;await refreshVault();}}
};
$('#clear-signins').onclick=async()=>{
  const entries=vaultState?.entries||[];
  if(!entries.length||!confirm(`Delete all ${entries.length} saved sign-ins and unlink them from rewards accounts? Account balances will stay.`))return;
  try{await unlinkSavedSignins(new Set(entries.map(entry=>entry.id)));vaultState=await api('vault/clear',{confirm:'clear-all-sign-ins',expected_revision:vaultState.revision});renderVault();notice('All saved sign-ins deleted.');}catch(error){$('#vault-status').textContent=error.message;await refreshVault();}
};
async function loadPlugins(){$('#plugin-note').textContent='Loading installed plugins…';try{pluginInventory=await api('plugins');renderPlugins();}catch(error){$('#plugin-note').textContent=error.message;}}
function renderPlugins(){
  if(!pluginInventory)return;const words=$('#skill-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);$('#plugin-note').textContent=pluginInventory.note;
  $('#plugin-list').innerHTML=pluginInventory.plugins.map(p=>{const skills=p.skills.filter(s=>words.every(w=>(p.name+' '+s.name+' '+s.description).toLowerCase().includes(w)));if(!skills.length&&words.length)return '';return `<section class="plugin"><div class="plugin-heading"><span class="plugin-symbol">${p.name==='walletfreak'?'<img src="/assets/mascot.png" alt="">':esc(p.name.slice(0,2).toUpperCase())}</span><div><h3>${esc(p.name)}</h3><small>${esc(p.version)} · ${p.enabled?'Enabled':'Disabled'} · ${p.skills.length} skills</small></div></div><div class="skill-grid">${skills.map(s=>`<details class="skill"><summary><strong>${esc(s.name)}</strong><span>${esc(s.description)}</span></summary><pre>${esc(s.content)}</pre></details>`).join('')}</div></section>`;}).join('');
}
$('#skill-search').oninput=renderPlugins;

function setWalletView(table){$('#wallet-tables').hidden=!table;$('#wallet-tiles').hidden=table;$('#wallet-view-table').setAttribute('aria-pressed',String(table));$('#wallet-view-cards').setAttribute('aria-pressed',String(!table));}
$('#wallet-view-cards').onclick=()=>{renderWalletTiles();setWalletView(false);};
$('#wallet-view-table').onclick=()=>{renderWallet();setWalletView(true);};
function loyaltyGroup(row){
  const name=String(row.name||'').toLowerCase(),known=catalogProgram(row);
  if(known)return known.category;
  if(/hilton|hyatt|marriott|ihg|accor|wyndham|choice hotels|best western|radisson/.test(name))return 'Hotels';
  if(/delta|skymiles|united|mileageplus|american airlines|aadvantage|southwest|rapid rewards|alaska|atmos|jetblue|trueblue|qantas|turkish|air canada|aeroplan/.test(name))return 'Flights';
  return 'Credit cards';
}
function syncControls(section,row){
  const saved=!!row.credential_id,visible=vaultState?.entries?.some(entry=>entry.id===row.credential_id);
  const pending=state?.refresh_requests?.some(request=>request.section===section&&request.id===row.id);
  return `<div class="wallet-sync-actions"><button type="button" class="wallet-signin ${visible?'is-saved':''}" data-account-signin="${section}:${esc(row.id)}">${saved?visible?'● Sign-in saved':'Sign-in needs attention':'Connect sign-in'}</button>${visible?`<button type="button" data-refresh-account="${section}:${esc(row.id)}" title="Ask your agent to refresh this account on its next turn" ${pending?'disabled':''}>${pending?'Requested':'↻ Refresh'}</button>`:''}</div>`;
}
function walletTile(section,r,i){
  const account=draft.programs.find(a=>a.id===r.reward_account_id);
  const linked=draft.cards.find(c=>c.id===r.card_id)||draft.programs.find(a=>a.id===r.program_id);
  const art=`<div class="wallet-image provider">${walletImage(section,r)}</div>`;
  let content='';
  if(section==='cards'){
    const parts=String(r.name||'').split(';'),uncertain=/^Exact product not reported/i.test(parts[0]);
    const name=uncertain?'Card to identify':parts[0].trim()||'Card to identify';
    const note=uncertain?r.name:parts.slice(1).join(';').trim();
    const benefit=cards.find(card=>card.id===r.product_id)?.status_benefit;
    content=`<div class="wallet-tile-main">${art}<div class="wallet-tile-copy"><h4>${esc(r.nickname||name)}</h4>${r.nickname?`<small>${esc(name)}</small>`:note?`<small class="wallet-qualifier">${esc(note)}</small>`:''}${account?`<p class="wallet-linked">Earns · <button type="button" data-edit-wallet="programs" data-index="${draft.programs.indexOf(account)}">${esc(account.name)} ↗</button></p>`:''}${benefit?`<small class="wallet-status-benefit">${esc(benefit.tier)} card benefit · confirm in account</small>`:''}</div></div><div class="wallet-tile-bottom">${syncControls('cards',r)}<details class="wallet-tile-menu"><summary aria-label="Options for ${esc(r.nickname||name)}">•••</summary><div><button type="button" data-edit-wallet="cards" data-index="${i}">Edit card</button>${account?`<button type="button" data-unlink-wallet="cards" data-index="${i}">Unlink rewards</button>`:''}<button type="button" class="danger" data-remove-tile="cards" data-index="${i}">Remove card</button></div></details></div>`;
  } else if(section==='programs'){
    content=`<div class="wallet-tile-main">${art}<div class="wallet-tile-copy"><h4>${esc(r.account_label||r.name||'Rewards account')}</h4>${r.account_label?`<small>${esc(r.name)}</small>`:''}<p class="wallet-balance">${r.balance?`${r.approximate?'≈ ':''}${Number(r.balance).toLocaleString()} points`:'Balance unknown'}</p>${r.status&&loyaltyGroup(r)!=='Credit cards'?`<small>${esc(r.status)} membership tier</small>`:''}${r.synced_at||r.reported_on?`<small>${r.synced_at?'Synced '+esc(r.synced_at.slice(0,10)):'Reported '+esc(r.reported_on)}</small>`:''}</div></div><div class="wallet-tile-bottom">${syncControls('programs',r)}<details class="wallet-tile-menu"><summary aria-label="Options for ${esc(r.account_label||r.name)}">•••</summary><div><button type="button" data-edit-wallet="programs" data-index="${i}">Edit account</button>${r.credential_id?`<button type="button" data-unlink-wallet="programs" data-index="${i}">Unlink sign-in</button>`:''}<button type="button" class="danger" data-remove-tile="programs" data-index="${i}">Remove account</button></div></details></div>`;
  } else {
    content=`<div class="wallet-tile-main">${art}<div class="wallet-tile-copy"><h4>${esc(r.name||'Travel credit or certificate')}</h4><p class="wallet-balance">${esc(r.remaining||'Amount to confirm')}</p>${r.expires_on?`<small>Expires ${esc(r.expires_on)}</small>`:''}${linked?`<small>${esc(linked.name)}</small>`:''}</div></div><div class="wallet-tile-bottom"><span></span><details class="wallet-tile-menu"><summary aria-label="Options for ${esc(r.name||'travel credit')}">•••</summary><div><button type="button" data-edit-wallet="benefits" data-index="${i}">Edit credit</button><button type="button" class="danger" data-remove-tile="benefits" data-index="${i}">Remove credit</button></div></details></div>`;
  }
  return `<article class="wallet-tile wallet-tile-${section}" data-section="${section}" data-index="${i}">${content}</article>`;
}
function renderWalletTiles(){
  $('#setup-wallet').textContent='Manage legacy profiles';$('#setup-wallet').hidden=true;
  const sections=[['cards','Credit cards','Add credit card',''],['programs','Airline loyalty','Add airline loyalty','Flights'],['programs','Hotel loyalty','Add hotel loyalty','Hotels'],['programs','Card rewards','Add card rewards','Credit cards'],['benefits','Travel credits & certificates','Add travel credit','']];
  $('#wallet-tiles').innerHTML=sections.map(([section,title,add,category])=>`<section class="wallet-section"><div class="section-heading"><h3>${title}</h3></div><div class="wallet-tiles">${draft[section].map((r,i)=>section==='programs'&&loyaltyGroup(r)!==category?'':walletTile(section,r,i)).join('')}<button type="button" class="wallet-add-tile" data-add="${section}" ${category?`data-program-category="${category}"`:''}><span aria-hidden="true">＋</span><strong>${add}</strong></button></div></section>`).join('');
  $('#wallet-tiles').querySelectorAll('[data-account-signin]').forEach(b=>b.onclick=()=>{const [section,id]=b.dataset.accountSignin.split(':');openAccountSignin(section,id);});
  $('#wallet-tiles').querySelectorAll('[data-refresh-account]').forEach(b=>b.onclick=async()=>{const [section,id]=b.dataset.refreshAccount.split(':');try{await api('refresh-account',{section,id});await refresh();notice('Refresh requested. Ask your agent to process pending Wallet refreshes.');}catch(error){notice(error.message,true);}});
  $('#wallet-tiles').querySelectorAll('[data-edit-wallet]').forEach(b=>b.onclick=()=>editWallet(b.dataset.editWallet,Number(b.dataset.index)));
}
$('#wallet-tables').onclick=async event=>{
  const button=event.target.closest('[data-edit-wallet],[data-account-signin],[data-refresh-account]');if(!button)return;
  if(button.dataset.editWallet){editWallet(button.dataset.editWallet,Number(button.dataset.index));return;}
  const [section,id]=(button.dataset.accountSignin||button.dataset.refreshAccount).split(':');
  if(button.dataset.accountSignin){openAccountSignin(section,id);return;}
  try{await api('refresh-account',{section,id});await refresh();notice('Refresh requested. Ask your agent to process pending Wallet refreshes.');}catch(error){notice(error.message,true);}
};
$('#wallet-tiles').addEventListener('click',async event=>{
  const button=event.target.closest('[data-unlink-wallet],[data-remove-tile]');if(!button)return;
  const section=button.dataset.unlinkWallet||button.dataset.removeTile,index=Number(button.dataset.index),row=draft[section]?.[index];if(!row)return;
  if(dirty&&!confirm('Save your other unsaved wallet edits with this change?'))return;
  const removing=button.hasAttribute('data-remove-tile');
  if(!confirm(removing?`Remove “${row.account_label||row.name}” and save the wallet? Linked records will stay but their links will be cleared.`:section==='cards'?'Unlink this card from its rewards account? The account and balance will stay.':'Unlink this saved sign-in? The encrypted sign-in will stay in Wallet.'))return;
  if(removing)removeWalletEntry(section,index);
  else {row[section==='cards'?'reward_account_id':'credential_id']='';dirty=true;renderWallet();}
  try{await persistWallet();}catch(error){notice(error.message,true);}
});
let editorSnapshot,editorDirty;
async function editWallet(section,index,isNew=false){
 if(section==='programs')await refreshVault();
 if(!$('#wallet-editor').open){editorSnapshot=structuredClone(draft);editorDirty=dirty;if(isNew)editorSnapshot[section].splice(index,1);}
 const row=draft[section][index];$('#wallet-editor-title').textContent={cards:'Card & rewards',programs:'Rewards account',benefits:'Credit or travel fund'}[section];
 const showTier=section==='programs'&&(programDraftCategories.get(row.id)||loyaltyGroup(row))!=='Credit cards';
 const basic=(section==='programs'?columns.programs.filter(c=>['name','account_label','balance','person_id',...(showTier?['status']:[])].includes(c[0])):section==='cards'?columns.cards.filter(c=>!['name','person_id','credential_id'].includes(c[0])):columns[section]).filter(c=>draft.people.length>1||c[0]!=='person_id');
 const more=section==='programs'?columns.programs.filter(c=>!basic.includes(c)&&c[0]!=='status'&&(draft.people.length>1||c[0]!=='person_id')):[];
 const fields=items=>items.map(c=>`<label>${esc(c[1])}${cell(section,index,row,c)}</label>`).join('');
 const known=cards.some(c=>c.name.toLowerCase()===row.name.toLowerCase()),cardTitle=known?row.name:/^Exact product not reported/i.test(row.name)?'Card to identify':row.name||'Choose a card';
 const cardChoice=section==='cards'?`<button type="button" id="choose-card" class="card-choice">${walletImage('cards',row)}<span><strong>${esc(cardTitle)}</strong><small>Choose from card gallery</small></span></button><details class="wallet-extra"><summary>Card not in the gallery?</summary>${fields([columns.cards[0]])}</details>`:'';
 $('#wallet-editor-fields').innerHTML=`<div data-section="${section}" data-index="${index}">${cardChoice||`<div class="wallet-image provider">${walletImage(section,row)}</div>`}<div class="wallet-edit-grid">${fields(basic)}</div>${more.length?`<details class="wallet-extra"><summary>More account details</summary><div class="wallet-edit-grid">${fields(more)}</div></details>`:''}</div>`;
 if(section==='cards')$('#choose-card').onclick=()=>openCardPicker(index);
 updateRewardSuggestion();if(!$('#wallet-editor').open)$('#wallet-editor').showModal();
 $('#wallet-editor-fields '+(section==='programs'?'[data-field=account_label]':section==='cards'?'[data-field=nickname]':'[data-field=name]')).focus();
}
let cardPickerIndex=-1;
function openCardPicker(index){
 cardPickerIndex=index;$('#card-picker-search').value='';renderCardPicker();$('#card-picker').showModal();$('#card-picker-search').focus();
}
function renderCardPicker(){
 const q=$('#card-picker-search').value.trim().toLowerCase();
 const featured=['delta-skymiles-gold-american-express-card','united-explorer-card','united-quest-card','united-gateway-card','chase-sapphire-reserve','american-express-platinum-card','capital-one-venture-x-rewards-credit-card','hilton-honors-aspire-card-from-american-express'];
 const results=q?cards.filter(c=>c.name.toLowerCase().includes(q)).slice(0,48):featured.map(id=>cards.find(c=>c.id===id)).filter(Boolean);
 $('#card-picker-results').innerHTML=results.map(c=>`<button type="button" data-card-id="${esc(c.id)}"><img src="/assets${esc(c.path)}" alt="" loading="${q?'lazy':'eager'}"><span>${esc(c.name)}</span>${c.program_id?`<small>Earns ${esc(walletPrograms.find(p=>p.id===c.program_id)?.name||'rewards')}</small>`:''}</button>`).join('')||'<p>No matching card. Use “Card not in the gallery” below.</p>';
 $('#card-picker-count').textContent=q?`${results.length} matches shown`:`Popular cards · search ${cards.length} products`;
}
$('#card-picker-search').oninput=renderCardPicker;
$('#card-picker-close').onclick=()=>$('#card-picker').close();
function newWalletRow(section){
  if(!draft.people.length)draft.people.push({id:crypto.randomUUID(),name:'Me'});
  const person=draft.people.find(p=>p.id===$('#wallet-person').value)||draft.people[0];
  return {id:crypto.randomUUID(),name:'',person_id:person.id,owner:person.name,reported_on:'',...(section==='cards'?{notes:''}:{balance:'',status:'',approximate:false,preserve:false,notes:''})};
}
function chooseCard(card){
  const isNew=cardPickerIndex<0,index=isNew?draft.cards.length:cardPickerIndex;
  if(isNew)draft.cards.push(newWalletRow('cards'));
  const row=draft.cards[index],old=cards.find(c=>c.id===row.product_id);
  if(old?.program_id!==card?.program_id)row.reward_account_id='';
  row.name=card?.name||'';if(card)row.product_id=card.id;else delete row.product_id;
  dirty=true;$('#card-picker').close();renderPeople();renderWallet();editWallet('cards',index,isNew);walletStatus();
}
$('#card-picker-results').onclick=e=>{const button=e.target.closest('[data-card-id]');if(!button)return;const card=cards.find(c=>c.id===button.dataset.cardId);if(card)chooseCard(card);};
$('#card-picker-other').onclick=()=>chooseCard(null);
function updateRewardSuggestion(){
  const entry=$('#wallet-editor-fields [data-section]'),box=$('#reward-suggestion');box.innerHTML='';if(entry?.dataset.section!=='cards')return;
  const row=draft.cards[Number(entry.dataset.index)],product=cards.find(c=>c.id===row.product_id),program=walletPrograms.find(p=>p.id===product?.program_id);
  if(program)box.innerHTML=`<p class="muted">${esc(program.name)} will be linked when you save. Its balance stays unknown until you add it or sync.</p>${product.status_benefit?`<p class="muted">Card benefit: ${esc(product.status_benefit.tier)}. Confirm the active tier in your loyalty account.</p>`:''}`;
}
function linkEarningProgram(row){
  const product=cards.find(card=>card.id===row.product_id),program=walletPrograms.find(item=>item.id===product?.program_id);
  if(!program||row.reward_account_id)return;
  const matches=draft.programs.filter(item=>item.person_id===row.person_id&&catalogProgram(item)?.id===program.id);
  if(matches.length>1)throw new Error(`Several ${program.name} accounts exist. Choose the right rewards account before saving this card.`);
  if(!matches.length)draft.programs.push({...newWalletRow('programs'),name:program.name,catalog_id:program.id,person_id:row.person_id,owner:row.owner});
  row.reward_account_id=(matches[0]||draft.programs.at(-1)).id;
  dirty=true;
}
let programPickerCategory='';
function openProgramPicker(category){programPickerCategory=category;$('#program-picker-title').textContent=category==='Flights'?'Add airline loyalty':category==='Hotels'?'Add hotel loyalty':category==='Credit cards'?'Add card rewards':'Add loyalty or rewards';$('#program-picker-search').value='';renderProgramPicker();$('#program-picker').showModal();$('#program-picker-search').focus();}
function renderProgramPicker(){
  const q=$('#program-picker-search').value.trim().toLowerCase(),items=walletPrograms.filter(p=>(!programPickerCategory||p.category===programPickerCategory)&&(!q||p.name.toLowerCase().includes(q)));
  $('#program-picker-results').innerHTML=items.map(p=>`<button type="button" data-program-id="${esc(p.id)}">${logo(p.provider_id)||'<span aria-hidden="true">✦</span>'}<strong>${esc(p.name)}</strong><small>${esc(p.category==='Credit cards'?'Card rewards':p.category==='Flights'?'Airline loyalty':'Hotel loyalty')}</small></button>`).join('')||'<p>No matching program. Use “Program not listed” below.</p>';
}
$('#program-picker-search').oninput=renderProgramPicker;
$('#program-picker-close').onclick=()=>$('#program-picker').close();
function chooseProgram(program){
  const row=newWalletRow('programs');if(program){row.name=program.name;row.catalog_id=program.id;}else programDraftCategories.set(row.id,programPickerCategory);
  const existing=program&&draft.programs.find(item=>item.person_id===row.person_id&&catalogProgram(item)?.id===program.id);
  if(existing){$('#program-picker').close();editWallet('programs',draft.programs.indexOf(existing));return;}
  draft.programs.push(row);dirty=true;$('#program-picker').close();renderPeople();renderWallet();editWallet('programs',draft.programs.length-1,true);
}
$('#program-picker-results').onclick=e=>{const button=e.target.closest('[data-program-id]');if(button)chooseProgram(walletPrograms.find(p=>p.id===button.dataset.programId));};
$('#program-picker-other').onclick=()=>chooseProgram(null);
async function persistWallet(){
 notice('Saving wallet…');
 const sent=JSON.stringify(draft),result=await api('wallet',{wallet:JSON.parse(sent),expected_revision:draftRevision});state.wallet=result.wallet;
 if(JSON.stringify(draft)===sent){programDraftCategories.clear();loadWallet();}else draftRevision=result.wallet.revision;
 notice(result.message);return result;
}
function cancelWalletEditor(){draft=editorSnapshot;dirty=editorDirty;programDraftCategories.clear();$('#wallet-editor').close();$('#wallet-editor-fields').innerHTML='';renderWallet();}
$('#wallet-editor-close').onclick=cancelWalletEditor;
$('#wallet-editor-done').onclick=async()=>{const entry=$('#wallet-editor-fields [data-section]');if(entry?.dataset.section==='cards'&&!draft.cards[Number(entry.dataset.index)].name.trim()){openCardPicker(Number(entry.dataset.index));return;}if(![...$('#wallet-editor-fields').querySelectorAll('input,select,textarea')].every(el=>el.reportValidity()))return;const button=$('#wallet-editor-done');button.disabled=true;try{if(entry?.dataset.section==='cards')linkEarningProgram(draft.cards[Number(entry.dataset.index)]);await persistWallet();$('#wallet-editor').close();$('#wallet-editor-fields').innerHTML='';}catch(e){notice(e.message,true);}finally{button.disabled=false;}};
$('#wallet-editor').addEventListener('cancel',e=>{e.preventDefault();cancelWalletEditor();});

function renderPeople(){$('#wallet-person').innerHTML='<option value="">My wallet</option>'+draft.people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');$('#wallet-person').value='';$('.people-toolbar').hidden=true;}
$('#migrate-vault').onclick=async()=>{try{vaultState=await api('vault/migrate-device',{});renderVault();}catch(e){notice(e.message,true);}};
