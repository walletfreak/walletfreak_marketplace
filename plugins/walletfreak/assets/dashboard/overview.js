'use strict';
(() => {
  let catalog, request=0, rendered='';
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
    const stops=rows.filter(r=>r.place&&Number.isFinite(r.place.lat)&&Number.isFinite(r.place.lng)&&Math.abs(r.place.lat)<=90&&Math.abs(r.place.lng)<=180).filter((r,i,all)=>all.findIndex(other=>other.place.label===r.place.label)===i);
    if(!stops.length)return;
    overview.classList.add('travel-route-mapped');
    const lats=stops.map(r=>r.place.lat),lngs=stops.map(r=>r.place.lng);
    const midLat=(Math.min(...lats)+Math.max(...lats))/2,midLng=(Math.min(...lngs)+Math.max(...lngs))/2;
    const scale=Math.min(550/Math.max(Math.max(...lngs)-Math.min(...lngs),.01),240/Math.max(Math.max(...lats)-Math.min(...lats),.01));
    const points=stops.map(r=>[380+(r.place.lng-midLng)*scale,208-(r.place.lat-midLat)*scale]);
    const line=points.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const pins=points.map(([x,y])=>`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="24" class="travel-map-halo"/><circle r="15" class="travel-map-pin"/><circle r="4" class="travel-map-core"/></g>`).join('');
    const labels=points.map(([x,y],i)=>`<text x="${(x+(x>380?-30:30)).toFixed(1)}" y="${(y-18).toFixed(1)}" text-anchor="${x>380?'end':'start'}" class="travel-map-label">${esc(stops[i].place.label.split(' · ')[0])}</text>`).join('');
    const nights=rows.filter(r=>r.stay).reduce((total,r)=>total+Math.max(0,(Date.parse(r.stay.check_out)-Date.parse(r.stay.check_in))/86400000||0),0);
    route.insertAdjacentHTML('afterbegin',`<div class="travel-route-intro"><span class="eyebrow">YOUR ROUTE</span><strong>${esc(stops.length)} ${stops.length===1?'stop':'stops'} <span>·</span> ${esc(nights)} ${nights===1?'night':'nights'}</strong></div><div class="travel-route-art"><svg viewBox="0 0 760 416" role="img" aria-label="Schematic map of ${esc(stops.map(r=>r.place.label).join(' to '))}"><defs><pattern id="travel-grid" width="52" height="52" patternUnits="userSpaceOnUse"><path d="M 52 0 L 0 0 0 52" fill="none" stroke="#ffffff" stroke-opacity=".08"/></pattern></defs><rect width="760" height="416" fill="url(#travel-grid)"/><text x="34" y="48" class="travel-map-caption">TRIP LOCATIONS</text><text x="707" y="48" text-anchor="end" class="travel-map-caption">N ↑</text>${points.length>1?`<polyline points="${line}" fill="none" stroke="#92f4d7" stroke-width="3" stroke-dasharray="7 8"/>`:''}${pins}${labels}</svg><span class="travel-map-foot">Approximate positions · route is schematic</span></div>`);
  }
  window.loadOverview=async function(reset=false){
    const sequence=++request;
    try{
      const [nextCatalog,current,references]=await Promise.all([catalog||api('catalog'),api('state'),api('references')]);
      if(sequence!==request)return;
      catalog=nextCatalog;
      const trips=current.trips||[];
      if(!trips.some(t=>t.id===activeId))activeId=trips[0]?.id||'';
      const selector=$('#overview-trip'), options=trips.map(t=>`<option value="${esc(t.id)}">${esc(t.findings.title)}</option>`).join('');
      if(selector.innerHTML!==options)selector.innerHTML=options;selector.value=activeId;
      const travelLayout=catalog.templates.find(t=>t.id==='concierge-travel').layout;
      const hasTravel=travelLayout.blocks.some(b=>b.source==='travel.itinerary');
      $('#trip-toolbar').hidden=!trips.length;$('#overview-trip-label').hidden=!trips.length;$('#overview-intro').hidden=!!trips.length;$('#overview-content').hidden=!trips.length;$('#trip-library').hidden=!trips.length;
      const selected=trips.find(t=>t.id===activeId);
      $('#overview-heading').textContent=selected?.findings.title||'Travel';
      const costs=selected?.totals||{cash:{},points:{},unknown:[]};
      const reported={};for(const item of selected?.findings.itinerary||[]){if(item.booking_status==='booked'&&!item.option_id){const m=/^([A-Z]{3}) ([0-9]+(?:\.[0-9]{1,2})?)$/.exec(item.price||'');if(m)reported[m[1]]=(reported[m[1]]||0)+Number(m[2]);}}
      const figures=[...Object.entries(reported).map(([currency,value])=>`<article><small>Reported bookings</small><strong>${esc(currency)} ${value.toFixed(2)}</strong></article>`),...Object.entries(costs.cash).map(([currency,value])=>`<article><small>Recorded cash</small><strong>${esc(currency)} ${esc(value)}</strong></article>`),...Object.entries(costs.points).map(([program,value])=>`<article><small>${esc(program)} points</small><strong>${Number(value).toLocaleString()}</strong></article>`)];
      $('#overview-costs').hidden=!hasTravel||!selected||!figures.length;$('#overview-costs').innerHTML=figures.join('');
      const data=bind(current,references),signature=JSON.stringify([travelLayout,data,activeId]);
      if(selected&&signature!==rendered){WalletFreakComponents.render($('#overview-content'),travelLayout,catalog,data);$('#overview-content').classList.remove('travel-route-preview','travel-route-mapped');drawRoute(data['travel.itinerary'].slice(0,100));rendered=signature;}
    }catch(e){notice(e.message,true);}
  };
  $('#overview-trip').onchange=e=>window.selectTravelTrip(e.target.value);
  $('#overview-reload').onclick=()=>window.loadOverview(true);
  setInterval(()=>{if(currentTab==='overview')window.loadOverview();},5000);
})();
