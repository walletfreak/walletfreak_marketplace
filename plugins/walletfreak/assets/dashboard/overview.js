'use strict';
(() => {
  let catalog, saved, activeLayout, request=0, rendered='';
  function bind(state,references){
    const rows=[];
    for(const trip of (state.trips||[]).filter(t=>t.id===activeId)){
      const options=new Map((trip.findings.options||[]).map(option=>[option.id,option]));
      const itinerary=trip.findings.itinerary||[];
      for(const item of itinerary){const option=options.get(item.option_id);rows.push({...option,...item,trip:trip.findings.title,payment:option?.payment});}
      const linked=new Set(itinerary.map(item=>item.option_id));
      for(const id of trip.selected||[]){const option=options.get(id);if(option&&!linked.has(id))rows.push({...option,when:'Proposed selection; not reserved',detail:option.product||'Schedule not recorded.',trip:trip.findings.title});}
    }
    const selected=(state.trips||[]).find(t=>t.id===activeId);
    const actions=selected&&window.getTripActions?window.getTripActions(selected).map(action=>({...action,trip_name:selected.findings.title})):[];
    return {'wallet.artwork':Object.fromEntries(cards.map(c=>[c.name,'/assets'+c.path])),'wallet.cards':state.wallet.cards,'wallet.programs':state.wallet.programs,'wallet.benefits':state.wallet.benefits,'spending.metrics':references.report?.metrics||[],'spending.findings':references.report?.findings||[],'spending.references':references.files,'travel.itinerary':rows,'travel.actions':actions,'travel.lodging_window':selected?.findings.lodging_window};
  }
  function drawRoute(rows){
    const overview=$('#overview-content'),route=overview.querySelector('.wf-trip .wf-route');
    if(!route)return;
    overview.classList.add('travel-route-preview');
    const stays=rows.filter(r=>r.stay&&r.place&&Number.isFinite(r.place.lat)&&Number.isFinite(r.place.lng)&&Math.abs(r.place.lat)<=90&&Math.abs(r.place.lng)<=180);
    if(!stays.length)return;
    overview.classList.add('travel-route-mapped');
    const lats=stays.map(r=>r.place.lat),lngs=stays.map(r=>r.place.lng);
    const midLat=(Math.min(...lats)+Math.max(...lats))/2,midLng=(Math.min(...lngs)+Math.max(...lngs))/2;
    const scale=Math.min(550/Math.max(Math.max(...lngs)-Math.min(...lngs),.01),240/Math.max(Math.max(...lats)-Math.min(...lats),.01));
    const points=stays.map(r=>[380+(r.place.lng-midLng)*scale,208-(r.place.lat-midLat)*scale]);
    const line=points.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const pins=points.map(([x,y])=>`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="24" class="travel-map-halo"/><circle r="15" class="travel-map-pin"/><circle r="4" class="travel-map-core"/></g>`).join('');
    const labels=points.map(([x,y],i)=>`<text x="${(x+(x>380?-30:30)).toFixed(1)}" y="${(y-18).toFixed(1)}" text-anchor="${x>380?'end':'start'}" class="travel-map-label">${esc(stays[i].place.label.split(' · ')[0])}</text>`).join('');
    const nights=stays.reduce((total,r)=>total+Math.max(0,(Date.parse(r.stay.check_out)-Date.parse(r.stay.check_in))/86400000||0),0);
    route.insertAdjacentHTML('afterbegin',`<div class="travel-route-intro"><span class="eyebrow">YOUR ROUTE</span><strong>${esc(stays.length)} ${stays.length===1?'stay':'stays'} <span>·</span> ${esc(nights)} ${nights===1?'night':'nights'}</strong></div><div class="travel-route-art"><svg viewBox="0 0 760 416" role="img" aria-label="Schematic map of ${esc(stays.map(r=>r.place.label).join(' to '))}"><defs><pattern id="travel-grid" width="52" height="52" patternUnits="userSpaceOnUse"><path d="M 52 0 L 0 0 0 52" fill="none" stroke="#ffffff" stroke-opacity=".08"/></pattern></defs><rect width="760" height="416" fill="url(#travel-grid)"/><text x="34" y="48" class="travel-map-caption">STAY LOCATIONS</text><text x="707" y="48" text-anchor="end" class="travel-map-caption">N ↑</text>${points.length>1?`<polyline points="${line}" fill="none" stroke="#92f4d7" stroke-width="3" stroke-dasharray="7 8"/>`:''}${pins}${labels}</svg><span class="travel-map-foot">Approximate positions · route is schematic</span></div>`);
  }
  window.loadOverview=async function(reset=false){
    const sequence=++request;
    try{
      const [nextCatalog,nextSaved,current,references]=await Promise.all([catalog||api('catalog'),api('layout'),api('state'),api('references')]);
      if(sequence!==request)return;
      catalog=nextCatalog;const first=!saved;saved=nextSaved;
      if(first||reset){$('#overview-template').innerHTML=catalog.templates.filter(t=>t.layout.blocks.every(b=>b.source.startsWith('travel.'))).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');$('#overview-theme').innerHTML=catalog.themes.map(t=>`<option>${esc(t)}</option>`).join('');$('#overview-density').innerHTML=catalog.densities.map(t=>`<option>${esc(t)}</option>`).join('');}
      const trips=current.trips||[];
      if(!trips.some(t=>t.id===activeId))activeId=trips[0]?.id||'';
      const selector=$('#overview-trip'), options=trips.map(t=>`<option value="${esc(t.id)}">${esc(t.findings.title)}</option>`).join('');
      if(selector.innerHTML!==options)selector.innerHTML=options;selector.value=activeId;
      const travelOnly=saved.layout.blocks.every(b=>b.source.startsWith('travel.'));
      const travelLayout=travelOnly?saved.layout:catalog.templates.find(t=>t.id==='concierge-travel').layout;
      activeLayout=travelLayout;
      if(first||reset){$('#overview-theme').value=travelLayout.theme;$('#overview-density').value=travelLayout.density;}
      $('#overview-layout-note').hidden=true;
      const hasTravel=travelLayout.blocks.some(b=>b.source==='travel.itinerary');
      $('#overview-trip-label').hidden=!trips.length;$('#overview-intro').hidden=hasTravel&&trips.some(t=>t.findings.itinerary?.length||t.findings.lodging_window);
      const selected=trips.find(t=>t.id===activeId);
      $('#overview-heading').textContent=selected?.findings.title||'Travel';
      const costs=selected?.totals||{cash:{},points:{},unknown:[]};
      const reported={};for(const item of selected?.findings.itinerary||[]){if(item.booking_status==='booked'&&!item.option_id){const m=/^([A-Z]{3}) ([0-9]+(?:\.[0-9]{1,2})?)$/.exec(item.price||'');if(m)reported[m[1]]=(reported[m[1]]||0)+Number(m[2]);}}
      const figures=[...Object.entries(reported).map(([currency,value])=>`<article><small>Reported bookings</small><strong>${esc(currency)} ${value.toFixed(2)}</strong></article>`),...Object.entries(costs.cash).map(([currency,value])=>`<article><small>Recorded cash</small><strong>${esc(currency)} ${esc(value)}</strong></article>`),...Object.entries(costs.points).map(([program,value])=>`<article><small>${esc(program)} points</small><strong>${Number(value).toLocaleString()}</strong></article>`)];
      $('#overview-costs').hidden=!hasTravel||!selected||!figures.length;$('#overview-costs').innerHTML=figures.join('');
      const data=bind(current,references),signature=JSON.stringify([travelLayout,data,activeId]);
      if(signature!==rendered){WalletFreakComponents.render($('#overview-content'),travelLayout,catalog,data);$('#overview-content').classList.remove('travel-route-preview','travel-route-mapped');drawRoute(data['travel.itinerary'].slice(0,100));rendered=signature;}
    }catch(e){notice(e.message,true);}
  };
  async function save(layout){WalletFreakComponents.validate(layout,catalog);if(layout.blocks.some(b=>!b.source.startsWith('travel.')))throw new Error('Travel layouts can contain trip sections only. Cards and spending have their own workspaces.');await api('layout',{expected_revision:saved.revision,layout});await window.loadOverview(true);notice('Dashboard layout saved locally.');}
  $('#overview-settings').onsubmit=async e=>{e.preventDefault();try{if(!saved)throw new Error('Reload the dashboard first.');const layout=structuredClone(catalog.templates.find(t=>t.id===$('#overview-template').value).layout);layout.theme=$('#overview-theme').value;layout.density=$('#overview-density').value;await save(layout);}catch(error){notice(error.message,true);}};
  $('#overview-file').onchange=async e=>{const file=e.target.files[0];try{if(!saved)throw new Error('Reload the dashboard first.');if(!file||file.size>32000)throw new Error('Choose a layout JSON file up to 32 KB.');await save(JSON.parse(await file.text()));}catch(error){notice(error.message,true);}finally{e.target.value='';}};
  $('#overview-export').onclick=()=>{if(!activeLayout)return;const url=URL.createObjectURL(new Blob([JSON.stringify(activeLayout,null,2)+'\n'],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='walletfreak-layout.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('#overview-trip').onchange=e=>window.selectTravelTrip(e.target.value);
  $('#overview-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#overview-prompt').textContent);notice('Starter prompt copied. Paste it in your agent conversation.');}catch{notice('Copy the prompt above into your agent conversation.',true);}};
  $('#overview-reload').onclick=()=>window.loadOverview(true);
  setInterval(()=>{if(currentTab==='overview')window.loadOverview();},5000);
})();
