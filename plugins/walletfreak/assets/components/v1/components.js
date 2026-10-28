'use strict';
// Shared by the public gallery and the offline local dashboard. No requests or code evaluation.
(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=(value)=>typeof value==='string'&&value.trim()&&value.length<=120;
  function exact(object,keys){return object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).length===keys.length&&keys.every(k=>Object.hasOwn(object,k));}
  function validate(layout,catalog){
    if(!exact(layout,['version','title','theme','density','blocks'])||layout.version!==1||!text(layout.title)||!catalog.themes.includes(layout.theme)||!catalog.densities.includes(layout.density)||!Array.isArray(layout.blocks)||!layout.blocks.length||layout.blocks.length>12)throw new Error('Invalid or unsupported dashboard layout.');
    const ids=new Set();
    for(const b of layout.blocks){
      const component=catalog.components.find(c=>c.id===b?.component);
      if(!exact(b,['id','component','source','title'])||!text(b.title)||typeof b.id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(b.id)||ids.has(b.id)||!component?.sources.includes(b.source))throw new Error('Unknown component, duplicate ID or invalid source.');
      ids.add(b.id);
    }
    return layout;
  }
  const value=(row,key)=>`${key==='balance'&&row.approximate?'≈ ':''}${esc(row[key]===null||row[key]===undefined||row[key]===''?'—':row[key])}`;
  const columns={
    'wallet.cards':[['nickname','Nickname'],['name','Card'],['owner','Owner'],['notes','Details'],['reported_on','Reported']],
    'wallet.programs':[['owner','Person'],['account_label','Account'],['name','Program'],['balance','Balance'],['status','Status'],['notes','Notes'],['reported_on','Reported']],
    'wallet.benefits':[['name','Benefit'],['remaining','Remaining'],['expires_on','Expires'],['notes','Restrictions']]
  };
  function sources(item,data){const files=data['spending.references']||[];const names=(item.source_ids||[]).map(id=>files.find(f=>f.id===id)?.name).filter(Boolean);return names.length?`<small class="wf-source">Source: ${names.map(esc).join(' · ')}</small>`:'';}
  function paymentSummary(p){return p?`Pay with ${esc(p.card)}${p.benefits?.length?' · '+p.benefits.map(b=>esc(b.name)+': '+esc(b.status)).join(' · '):' · Benefits not recorded'}`:'Payment card: to confirm';}
  function payment(p){return p?`<p>${esc(p.reason)}</p>${(p.benefits||[]).map(b=>`<p>${esc(b.name)} · ${esc(b.status)} — ${esc(b.detail)}${b.recorded_at?' · Recorded '+esc(b.recorded_at):''}</p>`).join('')}`:'';}
  function stayLabel(r){if(!r.stay)return '';const n=(Date.parse(r.stay.check_out)-Date.parse(r.stay.check_in))/86400000;return `${esc(r.stay.check_in)} → ${esc(r.stay.check_out)} · ${Number.isFinite(n)?n:'?'} ${n===1?'night':'nights'}`;}
  function nextDay(day){const time=Date.parse(day);return Number.isFinite(time)?new Date(time+86400000).toISOString().slice(0,10):'';}
  function dayOf(row){
    const valid=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||'')&&!Number.isNaN(Date.parse(day))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
    const known=row.day||row.stay?.check_in;
    if(valid(known))return known;
    const when=row.when||'',iso=when.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if(iso&&valid(iso[0]))return iso[0];
    const match=when.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:\s*[–-]\s*\d{1,2})?,?\s+(\d{4})\b/i);
    if(!match)return '';
    const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[1].slice(0,3).toLowerCase())+1;
    const day=`${match[3]}-${String(month).padStart(2,'0')}-${match[2].padStart(2,'0')}`;
    return valid(day)?day:'';
  }
  function eachNight(start,end,make){const result=[];for(let day=start,next=nextDay(day);day<end&&next&&next>day;day=next,next=nextDay(day))result.push(make(day,next));return result;}
  function vacantNight(day,next,proposal,trip,showPrice){
    const {stay,price,...rest}=proposal||{};
    const location=proposal?.place?.label?.split(' · ')[0].replace(/\s+stay$/i,'');
    return {...rest,day,when:'Check-in / check-out times to confirm',title:location?location+' · hotel night':'Hotel night to book',detail:proposal?.detail||'No booked hotel covers this night.',booking_status:'to book',slot:{check_in:day,check_out:next},candidate:proposal?.title||'',candidate_price:price||'',show_candidate_price:showPrice,trip:proposal?.trip||trip};
  }
  function hotelSlots(rows,window){
    if(!window)return [];
    return eachNight(window.check_in,window.check_out,(day,next)=>{
      if(rows.some(r=>r.booking_status==='booked'&&r.stay&&r.stay.check_in<=day&&day<r.stay.check_out))return null;
      const proposal=rows.find(r=>r.booking_status!=='booked'&&r.stay&&r.stay.check_in<=day&&day<r.stay.check_out);
      return vacantNight(day,next,proposal,rows[0]?.trip||'',!!proposal&&day===(proposal.stay.check_in>window.check_in?proposal.stay.check_in:window.check_in));
    }).filter(Boolean);
  }
  function tripRows(rows,window){
    rows=rows.map(r=>({...r,day:dayOf(r)}));
    const display=rows.flatMap(r=>{
      if(!r.stay)return [r];
      if(r.booking_status!=='booked')return [];
      return eachNight(r.stay.check_in,r.stay.check_out,(day,next)=>({...r,day,stay:{check_in:day,check_out:next},price:day===r.stay.check_in?r.price:'',stay_price:r.price,stay_total:day===r.stay.check_in&&!!r.price}));
    });
    const groups=new Map();
    if(!window)for(const r of rows.filter(r=>r.stay)){const key=r.trip||'',group=groups.get(key)||{rows:[],check_in:r.stay.check_in,check_out:r.stay.check_out};group.rows.push(r);if(r.stay.check_in<group.check_in)group.check_in=r.stay.check_in;if(r.stay.check_out>group.check_out)group.check_out=r.stay.check_out;groups.set(key,group);}
    const slots=window?hotelSlots(rows,window):[...groups.values()].flatMap(group=>hotelSlots(group.rows,group));
    return [...display,...slots].sort((a,b)=>(a.day||'9999').localeCompare(b.day||'9999')).map((r,i,all)=>({...r,showDate:i===0||r.day!==all[i-1].day}));
  }
  function routeStops(rows){const seen=new Set();return rows.map((r,i)=>({r,i})).filter(({r})=>{const place=r.place?.label;if(!place||seen.has(place))return false;seen.add(place);return true;});}
  function safeLink(url,label){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';}catch{return '';}}
  function routeWarnings(rows,window){
    rows=rows.filter(r=>!r.slot);
    const warnings=[];let previous;
    for(const r of rows){
      if(r.stay&&(!window||r.booking_status==='booked')){if(previous&&previous.trip===r.trip&&r.stay.check_in<previous.stay.check_out)warnings.push('Overlapping stays: '+previous.title+' and '+r.title);previous=r;}
    }
    for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];if(a.trip===b.trip&&a.place&&b.place&&!b.route&&(a.place.lat!==b.place.lat||a.place.lng!==b.place.lng))warnings.push('Transfer to confirm: '+a.place.label+' → '+b.place.label);}
    return warnings;
  }
  function compactPrice(price){
    const value=String(price||'').trim();
    const charged=/^([A-Z]{3}\s+[\d,]+(?:\.\d{1,2})?)\s+charged\b/i.exec(value);
    if(charged)return charged[1];
    return /^(?:(?:[A-Z]{3}\s*|[$€£])[\d,]+(?:\.\d{1,2})?|[\d,]+\s*(?:points?|miles?))(?:\s*\+\s*(?:(?:[A-Z]{3}\s*|[$€£])[\d,]+(?:\.\d{1,2})?|[\d,]+\s*(?:points?|miles?)))?(?:\s*\/\s*(?:night|stay|person)|\s*·\s*illustrative)?$/i.test(value)?value:'';
  }
  function stepHtml(r,i){
    const stay=r.stay||r.slot;
    const price=r.price||r.candidate_price||r.stay_price;
    const visiblePrice=compactPrice(r.price||(r.show_candidate_price?r.candidate_price:''));
    const schedule=r.slot||r.stay&&!/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:AM|PM)\b/i.test(r.when||'')?'Check-in / check-out times to confirm':r.when||'Time to confirm';
    const times=(r.when||'').match(/\b\d{1,2}:\d{2}\b/g)||[];
    const compactTime=r.slot?'Overnight':times.length>1?times.slice(0,2).join(' → '):times[0]||(/\bmorning\b|\bafternoon\b|\bdaytime\b|\bevening\b/i.exec(r.when||'')?.[0]||'Time TBD');
    const date=/^\d{4}-\d{2}-\d{2}$/.test(r.day||'')?new Date(r.day+'T12:00:00Z'):null;
    const day=r.showDate?(date&&!Number.isNaN(date.getTime())?`${new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(date)}<strong>${new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(date)}</strong>`:'<strong>Unscheduled</strong>'):'';
    const status=r.slot?'To book':/^booked\b/i.test(r.title||'')&&r.booking_status!=='booked'?'Status to confirm':r.booking_status==='booked'?'Booked':r.booking_status==='cancelled'?'Cancelled':r.booking_status==='proposed'?'Proposed':'To confirm';
    const title=(r.title||'').replace(/^Booked\s+/i,'');
    const details=`<dialog class="wf-evidence" aria-label="Details for ${esc(title)}${r.day?' on '+esc(r.day):''}"><div class="wf-evidence-heading"><h3>${esc(title)}</h3><button type="button" data-close-info aria-label="Close details">×</button></div><dl><div><dt>Date / time</dt><dd>${esc(r.day||'Date to confirm')} · ${esc(r.when||schedule)}</dd></div><div><dt>Status</dt><dd>${esc(status)}</dd></div><div><dt>Price</dt><dd>${price?`${esc(price)}${stay?' · full stay quote or reported total':''}`:'To confirm'}</dd></div></dl><p>${esc(r.detail||'Details to confirm.')}</p>${r.candidate?`<p>Suggested stay: ${esc(r.candidate)}</p>`:''}${r.option_anchor&&/^#option-[0-9]+$/.test(r.option_anchor)?`<a href="${r.option_anchor}">View option</a>`:''}${payment(r.payment)}${r.terms?`<p>${esc(r.terms)}</p>`:''}${(r.sources||[]).map(s=>safeLink(s.url,s.label)).join(' · ')}${r.place?`<p>${esc(r.place.label)} · ${esc(r.place.confidence)} ${safeLink(r.place.source_url,'Location source')}</p>`:''}${r.route?.source_url?`<p>${safeLink(r.route.source_url,'Route source')}</p>`:''}</dialog>`;
    return `<li data-stop="${i}" class="${r.slot?'wf-needed':stay?'wf-stay':r.route?.mode==='flight'||r.kind==='flight'||/flight|fly|depart|arriv|return/i.test(r.title)?'wf-flight':'wf-activity'}" tabindex="-1"><span class="wf-cal-date">${day}</span><div class="wf-cal-event"><div class="wf-step-top"><small class="wf-time">${esc(compactTime)}</small><button type="button" class="wf-info" data-info="${i}" aria-label="More details for ${esc(title)}${r.day?' on '+esc(r.day):''}">i</button></div><div class="wf-step-heading"><strong>${esc(title)}</strong><span class="wf-tag">${esc(status)}</span></div>${visiblePrice?`<span class="wf-price">${esc(visiblePrice)}${r.stay_total||r.candidate_price?'<small>Stay total</small>':''}</span>`:''}${r.place?`<button type="button" class="wf-show-stop" data-show-stop="${i}">Show on map</button>`:''}</div>${details}</li>`;
  }
  function tripHtml(rows,window){
    const warnings=routeWarnings(rows,window);
    return `<div class="wf-trip">${warnings.length?`<aside class="wf-route-warning"><strong>Check the plan</strong><ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></aside>`:''}<div class="wf-trip-switch" role="group" aria-label="Trip view"><button type="button" data-trip-view="timeline" aria-pressed="true">Calendar</button><button type="button" data-trip-view="map" aria-pressed="false">Map</button></div><div class="wf-trip-columns"><ol class="wf-itinerary">${rows.map(stepHtml).join('')}</ol><aside class="wf-route"><h4>Stays & route</h4><p class="wf-map-note">Schematic connections, not navigation directions.</p><div class="wf-route-diagram">${routeStops(rows).map(({r,i})=>`<button type="button" data-route-stop="${i}"><span class="wf-pin">${i+1}</span><span><strong>${esc(r.place.label)}</strong><small>${r.stay||r.slot?stayLabel({stay:r.stay||r.slot}):esc(r.when)}</small></span></button>`).join('')||'<p class="wf-map-note">Add stay locations to see the route.</p>'}</div><div class="wf-street-map" hidden aria-label="Street map of trip stops"></div><button type="button" class="wf-load-map">Load street map</button><p class="wf-map-note">Loads OpenStreetMap tiles only when clicked.</p><p class="wf-map-status" role="status"></p></aside></div></div>`;
  }
  function mountTrip(target,rows){
    let map,markers=[];
    const trip=target?.querySelector('.wf-trip');if(!trip)return;
    const setView=view=>{trip.dataset.view=view;trip.querySelectorAll('[data-trip-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tripView===view)));if(map)setTimeout(()=>map.invalidateSize(),0);};
    const select=index=>{trip.querySelectorAll('[data-stop],[data-route-stop]').forEach(el=>el.classList.toggle('wf-selected',Number(el.dataset.stop??el.dataset.routeStop)===index));if(markers[index]){map.panTo(markers[index].getLatLng());markers[index].openPopup();}};
    trip.addEventListener('click',e=>{
      const button=e.target.closest('button');if(!button)return;
      if(button.dataset.info!==undefined)trip.querySelector(`[data-stop="${Number(button.dataset.info)}"] .wf-evidence`)?.showModal();
      if(button.hasAttribute('data-close-info'))button.closest('dialog')?.close();
      if(button.dataset.tripView)setView(button.dataset.tripView);
      if(button.dataset.showStop!==undefined){setView('map');select(Number(button.dataset.showStop));}
      if(button.dataset.routeStop!==undefined){const i=Number(button.dataset.routeStop);select(i);setView('timeline');trip.querySelector(`[data-stop="${i}"]`).focus({preventScroll:true});}
      if(button.classList.contains('wf-load-map')){
        const status=trip.querySelector('.wf-map-status');
        const valid=r=>r.place&&Number.isFinite(r.place.lat)&&Number.isFinite(r.place.lng)&&Math.abs(r.place.lat)<=90&&Math.abs(r.place.lng)<=180;
        if(!rows.some(valid)){status.textContent='No verified coordinates supplied yet. Ask your agent to map these stops.';return;}
        if(!window.L){status.textContent='Street map unavailable. Your route list is still available.';return;}
        const pane=trip.querySelector('.wf-street-map');pane.hidden=false;button.hidden=true;
        map=L.map(pane,{scrollWheelZoom:false});
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).on('tileerror',()=>{status.textContent='Some map tiles could not load. Your stops remain available below.';}).addTo(map);
        const points=[],byLocation=new Map();
        rows.forEach((r,i)=>{if(!valid(r))return;const point=[r.place.lat,r.place.lng],key=point.join(',');if(byLocation.has(key)){markers[i]=byLocation.get(key);return;}points.push(point);const label=document.createElement('span');label.textContent=`${i+1}. ${r.place.label}`;markers[i]=L.marker(point,{icon:L.divIcon({className:'wf-map-pin',html:String(i+1),iconSize:[28,28]})}).bindPopup(label).on('click',()=>select(i)).addTo(map);byLocation.set(key,markers[i]);});
        // Never join across an unmapped stop or two separate trips.
        rows.forEach((r,i)=>{const previous=rows[i-1];if(previous&&valid(previous)&&valid(r)&&previous.trip===r.trip)L.polyline([[previous.place.lat,previous.place.lng],[r.place.lat,r.place.lng]],{color:'#247364',dashArray:'6 8'}).addTo(map);});
        map.fitBounds(L.latLngBounds(points),{padding:[24,24],maxZoom:13});status.textContent='Dashed lines show stop order, not road or rail geometry.';
      }
    });
  }
  function renderTrip(target,rows,window){const display=tripRows(rows,window);target.classList.add('wf-dashboard');target.innerHTML=tripHtml(display,window);mountTrip(target,display);}
  function walletCards(rows,data){return `<div class="wf-wallet-cards">${rows.map(r=>{const program=(data['wallet.programs']||[]).find(p=>p.id===r.reward_account_id);const benefits=(data['wallet.benefits']||[]).filter(b=>b.card_id&&b.card_id===r.id);const art=(data['wallet.artwork']||{})[r.name];return `<article class="wf-wallet-card">${typeof art==='string'&&/^\/(?:assets\/)?cards\/[a-zA-Z0-9._-]+$/.test(art)?`<img src="${esc(art)}" alt="" loading="lazy">`:'<span class="wf-card-symbol" aria-hidden="true">▰</span>'}<h4>${esc(r.nickname||r.name)}</h4>${r.nickname?`<small>${esc(r.name)}</small>`:''}<p>${program?esc(program.account_label||program.name):'Rewards account not linked'}</p>${program?`<strong>${value(program,'balance')} <small>points / miles · account balance</small></strong>`:''}<small>${benefits.length?benefits.length+' linked benefits':'No linked benefits'}</small><details><summary>Card details</summary><p>${esc(r.notes||'No notes added.')}</p><small>Reported ${esc(r.reported_on||'date unknown')}</small>${benefits.map(b=>`<p>${esc(b.name)} · ${esc(b.remaining||'Unknown remaining')} · Expires ${esc(b.expires_on||'unknown')}</p>`).join('')}</details></article>`;}).join('')}</div>`;}
  function tripBrief(rows){
    const stops=rows.filter(r=>r.place?.label&&Number.isFinite(r.place.lat)&&Number.isFinite(r.place.lng)).filter((r,i,all)=>all.findIndex(other=>other.place.label===r.place.label)===i).slice(0,8);
    const title=rows[0]?.trip||'Your trip';
    const dated=rows.map(dayOf).filter(Boolean).sort();
    const dates=dated.length?`${dated[0]}${dated.at(-1)!==dated[0]?' → '+dated.at(-1):''}`:'Dates to confirm';
    const nights=tripRows(rows).filter(r=>r.stay).length;
    let art='';
    if(stops.length){
      const lats=stops.map(r=>r.place.lat),lngs=stops.map(r=>r.place.lng);
      const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
      const points=stops.map(r=>[90+420*(r.place.lng-minLng)/Math.max(maxLng-minLng,.01),175-105*(r.place.lat-minLat)/Math.max(maxLat-minLat,.01)]);
      art=`<svg viewBox="0 0 600 240" role="img" aria-label="Schematic route: ${esc(stops.map(r=>r.place.label).join(' to '))}"><polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#87e1ce" stroke-width="3" stroke-dasharray="5 8"/>${points.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="7" fill="#a9eadb"/><text x="${x+11}" y="${y-12}">${esc(stops[i].place.label.split(' · ')[0])}</text>`).join('')}</svg>`;
    }
    return `<div class="wf-trip-brief${stops.length?'':' wf-trip-brief-empty'}"><div class="wf-trip-brief-copy"><span>YOUR ROUTE</span><strong>${esc(title)}</strong><p>${esc(dates)} · ${nights?nights+' hotel nights':'Stays to confirm'}</p><small>${stops.length?'Approximate positions · route is schematic':'Add verified locations to draw the route.'}</small></div>${art}</div>`;
  }
  function actionQueue(rows){return `<div class="wf-action-queue">${rows.filter(r=>!r.done).slice(0,4).map(r=>`<article><span class="wf-action-mark" aria-hidden="true">${r.kind==='booking'?'✈':r.kind==='sign-in'?'⌑':'◉'}</span><div><small>${esc(r.trip_name||'TRIP')}${r.due?' · DUE '+esc(r.due):''}</small><strong>${esc(r.title)}</strong><p>${esc(r.detail||'Review this step in Travel.')}</p>${r.target?`<div class="wf-action-controls"><button type="button" data-action-target="${esc(r.target)}" data-trip="${esc(r.trip||'')}" data-action-option="${esc(r.option||'')}">${r.target==='wallet'?'Open Wallet':r.kind==='booking'&&r.target==='research'?'Review options':r.target==='research'?'Review trip':'Review action'}</button>${r.id&&r.trip?`<button type="button" data-action-status="${esc(r.id)}" data-trip="${esc(r.trip)}" data-status="done">Mark addressed</button>`:''}</div>`:''}</div></article>`).join('')||'<p class="wf-empty">No trip actions need your attention.</p>'}</div>`;}
  function componentHtml(block,data){
    const all=data[block.source]||[],rows=all.slice(0,100);
    if(!rows.length&&!(block.component==='itinerary'&&data['travel.lodging_window'])){const message=block.source.startsWith('wallet.')?'Set up a person’s wallet in Wallet to add cards and rewards accounts.':block.source==='spending.references'?'Add PDF, CSV or ZIP references in Spending.':block.source.startsWith('spending.')?'Ask your agent to analyze your references and publish findings here.':block.component==='action-queue'?'No trip actions need your attention.':'Ask your agent to generate an itinerary dashboard from your destinations, dates and flexibility.';return `<p class="wf-empty">${esc(message)}</p>`;}
    let html='';
    if(block.component==='trip-brief')html=tripBrief(rows);
    if(block.component==='action-queue')html=actionQueue(rows);
    if(block.component==='metric-cards')html=`<div class="wf-metrics">${rows.map(r=>`<article><small>${esc(r.label)}</small><strong>${esc(r.value)}</strong><p>${esc(r.detail)}</p>${sources(r,data)}</article>`).join('')}</div>`;
    if(block.component==='findings')html=rows.map(r=>`<article class="wf-finding"><strong>${esc(r.label)}</strong><p>${esc(r.detail)}</p>${sources(r,data)}</article>`).join('');
    if(block.component==='reference-list')html=rows.map(r=>`<article class="wf-reference"><span class="wf-file">${esc(r.name?.split('.').pop()?.toUpperCase()||'FILE')}</span><div><strong>${esc(r.name)}</strong><small>${r.available===false?'File missing':'Local reference'}${r.archive_name?' · '+esc(r.archive_name):''}${r.members?' · '+r.members.filter(m=>m.supported).length+' supported files':''}${Number.isFinite(r.bytes)?' · '+Math.ceil(r.bytes/1024)+' KB':''}</small></div></article>`).join('');
    if(block.component==='itinerary')html=tripHtml(tripRows(rows,data['travel.lodging_window']),data['travel.lodging_window']);
    if(block.component==='wallet-cards')html=walletCards(rows,data);
    if(block.component==='data-table') {
      const cols=columns[block.source];
      html=`<div class="wf-table-scroll"><table><caption class="wf-sr-only">${esc(block.title)}</caption><thead><tr>${cols.map(([,label])=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(([key])=>`<td>${value(r,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      html+=`<div class="wf-records">${rows.map(r=>`<article class="wf-record"><h4>${value(r,cols[0][0])}</h4><dl>${cols.slice(1).map(([key,label])=>`<div><dt>${label}</dt><dd>${value(r,key)}</dd></div>`).join('')}</dl></article>`).join('')}</div>`;
    }
    return html+(all.length>100?'<p class="wf-empty">Showing the first 100 entries. Open the full workspace view for more.</p>':'');
  }
  function render(target,layout,catalog,data){
    validate(layout,catalog);
    target.classList.add('wf-dashboard');target.dataset.theme=layout.theme;target.dataset.density=layout.density;
    target.innerHTML=`<h2 class="wf-title">${esc(layout.title)}</h2>${layout.blocks.map(b=>`<section class="wf-block" data-component="${esc(b.component)}" data-block="${esc(b.id)}"><h3>${esc(b.title)}</h3>${componentHtml(b,data)}</section>`).join('')}`;
    layout.blocks.forEach(b=>{if(b.component==='itinerary')mountTrip(target.querySelector(`[data-block="${b.id}"]`),tripRows((data[b.source]||[]).slice(0,100),data['travel.lodging_window']));});
  }
  window.WalletFreakComponents=Object.freeze({validate,render,renderTrip});
})();
