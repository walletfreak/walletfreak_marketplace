'use strict';
(() => {
  const dayAfter = day => new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);

  function tripActions(trip) {
    const findings = trip.findings, rows = findings.itinerary || [], actions = [];
    const options = new Map((findings.options || []).map(option => [option.id, option]));
    for (const item of rows) {
      if (item.booking_status === 'booked' || item.booking_status === 'cancelled') continue;
      const option = options.get(item.option_id);
      if ((item.route?.mode === 'flight' || option?.kind === 'flight') && item.day && option?.status === 'available' && option.cost?.complete === true) {
        actions.push({trip: trip.id, title: `Book flight: ${item.title}`, detail: `${item.day || 'Date to confirm'} · Purchase and save the reviewed confirmation.`, kind: 'booking', target: 'research', option: option.id});
      }
    }
    const stays = rows.filter(item => item.stay);
    const window = findings.lodging_window || (stays.length ? {check_in: stays.map(item => item.stay.check_in).sort()[0], check_out: stays.map(item => item.stay.check_out).sort().at(-1)} : null);
    if (window) {
      let group;
      for (let day = window.check_in; day < window.check_out; day = dayAfter(day)) {
        if (rows.some(item => item.booking_status === 'booked' && item.stay && item.stay.check_in <= day && day < item.stay.check_out)) {
          group = null;
          continue;
        }
        const proposal = rows.find(item => item.booking_status !== 'booked' && item.booking_status !== 'cancelled' && item.stay && item.stay.check_in <= day && day < item.stay.check_out && options.get(item.option_id)?.status === 'available' && options.get(item.option_id)?.cost?.complete === true);
        if (!proposal) {group = null; continue;}
        const place = proposal?.place?.label?.split(' · ')[0].replace(/\s+stay$/i, '') || proposal?.title || 'Hotel';
        const key = proposal?.option_id || proposal?.title || place;
        if (group && group.key === key && group.end === day) group.end = dayAfter(day);
        else {
          group = {place, key, start: day, end: dayAfter(day)};
          actions.push({trip: trip.id, title: `Book ${place} stay`, detail: group, kind: 'booking', target: 'research', option: proposal.option_id});
        }
      }
      for (const action of actions) if (typeof action.detail === 'object') action.detail = `${action.detail.start} → ${action.detail.end} · ${Math.round((Date.parse(action.detail.end) - Date.parse(action.detail.start)) / 86400000)} nights need a confirmed stay.`;
    }
    for (const item of findings.actions || []) actions.push({trip: trip.id, id: item.id, title: item.title, detail: item.detail || '', due: item.due_on, kind: item.kind, target: item.kind === 'sign-in' ? 'wallet' : 'research', done: trip.action_state?.[item.id] === 'done'});
    return actions;
  }
  window.getTripActions = tripActions;

  function card(action) {
    const label = action.kind === 'booking' ? (action.target === 'research' ? 'Review options' : 'View itinerary') : action.kind === 'sign-in' ? 'Open Wallet' : action.target === 'spending' ? 'Review activity' : action.target === 'shopping' ? 'View offers' : 'Review trip';
    const trip = state.trips.find(item => item.id === action.trip);
    return `<article class="user-action ${action.done ? 'is-done' : ''}"><div><span class="eyebrow">${esc(trip?.findings.title || action.area || 'WORKSPACE')}${action.due ? ` · DUE ${esc(action.due)}` : ''}</span><h3>${esc(action.title)}</h3><p>${esc(action.detail)}</p></div><div class="user-action-controls"><button type="button" data-action-target="${esc(action.target)}" data-trip="${esc(action.trip || '')}" data-action-option="${esc(action.option || '')}">${label}</button>${action.id ? `<button type="button" class="quiet" data-action-status="${esc(action.id)}" data-trip="${esc(action.trip)}" data-status="${action.done ? 'open' : 'done'}">${action.done ? 'Reopen' : 'Mark addressed'}</button>` : ''}</div></article>`;
  }

  window.renderActions = () => {
    if (!state) return;
    const open = state.trips.flatMap(tripActions).filter(action => !action.done);
    $('#action-count').hidden = !open.length;
    $('#action-count').textContent = String(open.length);
    const current = open.filter(action => action.trip === activeId);
    $('#travel-actions').hidden = !current.length;
    $('#travel-actions').innerHTML = current.length ? `<div class="travel-action-heading"><span class="eyebrow">NEXT STEPS</span></div><div class="travel-action-list">${current.map(card).join('')}</div>` : '';
  };

  document.addEventListener('click', async event => {
    const status = event.target.closest('[data-action-status]');
    if (status) {
      const trip = state?.trips.find(item => item.id === status.dataset.trip);
      if (trip) await act('action-status', {id: trip.id, action_id: status.dataset.actionStatus, status: status.dataset.status, expected_revision: trip.revision});
      return;
    }
    const target = event.target.closest('[data-action-target]');
    if (!target) return;
    if (target.dataset.trip) {if (currentTab !== 'overview') tab('overview'); window.selectTravelTrip(target.dataset.trip);}
    if (target.dataset.actionTarget === 'research') {
      tab('overview'); $('#trip-library').open = true; $('#trip-alternatives').open = true;
      if (target.dataset.actionOption) {$('#search').value='';$('#kind').value='';$('#availability').value='';$('#shortlisted').checked=false;renderFindings();}
      const option = [...document.querySelectorAll('[data-option-id]')].find(item => item.dataset.optionId === target.dataset.actionOption);
      (option || $('#options')).scrollIntoView({behavior: 'smooth'});
    } else if (target.dataset.actionTarget === 'trip') {
      tab('overview'); $('#overview-content').scrollIntoView({behavior: 'smooth'});
    } else if (target.dataset.actionTarget === 'spending') {
      tab('spending'); $('#spend-advanced').open = true;
    } else tab(target.dataset.actionTarget);
  });
})();
