'use strict';
document.addEventListener('error', event => {
  if (event.target.matches?.('img.hotel-photo-image')) event.target.hidden = true;
}, true);

const cards = [...document.querySelectorAll('.option')];
const search = document.querySelector('#search');
const kind = document.querySelector('#kind');
const status = document.querySelector('#status');
const sort = document.querySelector('#sort');
const only = document.querySelector('#only-shortlist');
const filters = document.querySelector('.filters');
const compared = new Set();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds = ['flight','hotel','lounge','transport','other'].filter(value => cards.some(card => card.dataset.kind === value));
function renderTabs() {
  document.querySelector('#export-tabs').innerHTML = kinds.map(value => `<button type="button" role="tab" data-kind="${value}" aria-selected="${kind.value===value}">${value==='flight'?'Flights':value==='hotel'?'Stays':value==='lounge'?'Lounges':value==='transport'?'Transport':'Other'} <span>${cards.filter(card=>card.dataset.kind===value).length}</span></button>`).join('');
}
function renderComparison() {
  const selected = cards.filter(card => card.dataset.kind === kind.value && compared.has(card.id));
  document.querySelector('#export-tray').hidden = !selected.length;
  document.querySelector('#export-compare-count').textContent = `${selected.length} ${kind.value} option${selected.length===1?'':'s'} selected`;
  document.querySelector('#export-compare-open').disabled = selected.length < 2;
  const table = document.querySelector('#export-comparison .table-scroll');
  if (selected.length < 2) {table.innerHTML = '<p>Choose at least two options in this category.</p>';return;}
  const group = card => card.dataset.amount && card.dataset.group ? `${card.dataset.group}|${card.dataset.currency}` : '';
  table.innerHTML = `<table><thead><tr><th>Option</th><th>Observed quote</th><th>Vs comparable lowest</th><th>Terms & uncertainty</th></tr></thead><tbody>${selected.map(card => {
    const peers = selected.filter(other => group(card) && group(card) === group(other));
    const amount = Number(card.dataset.amount), lowest = Math.min(...peers.map(peer => Number(peer.dataset.amount)));
    const delta = peers.length < 2 ? 'Not directly comparable' : amount === lowest ? 'Lowest comparable quote' : '+ ' + new Intl.NumberFormat('en-US',{style:'currency',currency:card.dataset.currency}).format(amount-lowest);
    return `<tr><th>${esc(card.querySelector('h3').textContent)}</th><td>${esc(card.querySelector('.quote strong').textContent)}</td><td>${esc(delta)}</td><td>${esc(card.querySelector('dd:nth-of-type(3)')?.textContent || 'Terms not recorded')}<br><small>${esc(card.querySelector('.caution').textContent)}</small></td></tr>`;
  }).join('')}</tbody></table><p class="compare-note">Differences use only complete, available quotes in the same choice group and currency. Points, conditional credits and unknown costs are excluded.</p>`;
}
function update() {
  const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const ordered = [...cards];
  if (sort.value === 'name') ordered.sort((a,b)=>a.querySelector('h3').textContent.localeCompare(b.querySelector('h3').textContent));
  if (sort.value === 'price') ordered.sort((a,b)=>(a.dataset.currency||'ZZZ').localeCompare(b.dataset.currency||'ZZZ') || (a.dataset.amount?Number(a.dataset.amount):Infinity)-(b.dataset.amount?Number(b.dataset.amount):Infinity));
  document.querySelector('.options').append(...ordered);
  let visible = 0, shortlisted = 0;
  for (const card of cards) {
    const checked = card.querySelector('.shortlist input').checked;
    shortlisted += Number(checked);
    const matches = words.every(word => card.textContent.toLowerCase().includes(word)) &&
      (!kind.value || card.dataset.kind === kind.value) &&
      (!status.value || card.dataset.status === status.value) && (!only.checked || checked);
    card.hidden = !matches;
    visible += Number(matches);
    card.querySelector('.shortlist span').textContent = checked ? '★' : '☆';
    const compare = card.querySelector('.compare-button'), selected = compared.has(card.id);
    compare.textContent = selected ? '✓ Added' : '+ Compare'; compare.setAttribute('aria-pressed',String(selected));
  }
  document.querySelector('#result-count').textContent = `${visible} of ${cards.filter(card=>card.dataset.kind===kind.value).length} ${kind.value} options · ${shortlisted} shortlisted · Selections reset on reload`;
  document.querySelector('#no-results').hidden = visible > 0 || cards.length === 0;
  for (const panel of document.querySelectorAll('[data-insight-kind]')) panel.hidden = panel.dataset.insightKind !== kind.value;
  renderTabs(); renderComparison();
}
filters.hidden = false;
document.body.classList.add('js-ready');
document.querySelector('#export-tabs').hidden = !kinds.length;
kind.value = kinds[0] || '';
filters.addEventListener('input', update);
document.querySelector('#export-tabs').addEventListener('click', event => {
  const tab = event.target.closest('[data-kind]'); if (!tab) return;
  kind.value = tab.dataset.kind; search.value = ''; status.value = ''; only.checked = false; update();
});
for (const card of cards) {
  card.querySelector('.shortlist input').addEventListener('change', update);
  card.querySelector('.compare-button').addEventListener('click', () => {compared.has(card.id)?compared.delete(card.id):compared.add(card.id);update();});
  card.querySelector('.evidence-button').addEventListener('click', () => {const detail=card.querySelector('details');detail.open=!detail.open;});
}
document.querySelector('#reset').addEventListener('click', () => {
  search.value = status.value = ''; kind.value = kinds[0] || ''; sort.value = 'original'; only.checked = false; update();
});
document.querySelector('#export-compare-clear').addEventListener('click', () => {for(const card of cards)if(card.dataset.kind===kind.value)compared.delete(card.id);document.querySelector('#export-comparison').hidden=true;update();});
document.querySelector('#export-compare-open').addEventListener('click', () => {document.querySelector('#export-comparison').hidden=false;document.querySelector('#export-comparison').scrollIntoView({block:'start'});});
// Itinerary links reveal the referenced option even when a different category is active.
function revealOption() {
  const card = cards.find(item => `#${item.id}` === location.hash);
  if (!card) return;
  search.value = status.value = ''; kind.value = card.dataset.kind; only.checked = false; update();
  card.closest('#export-alternatives').open = true;
  card.querySelector('details').open = true;
  card.scrollIntoView({block:'start'});
}
window.addEventListener('hashchange', revealOption);
document.querySelector('.timeline').addEventListener('click', event => {
  if (event.target.closest('a')?.getAttribute('href') === location.hash) revealOption();
});
update();
revealOption();
