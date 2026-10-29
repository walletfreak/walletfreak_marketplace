'use strict';
(() => {
  let layout, catalog;
  const panel = $('#onboarding'), status = $('#onboarding-status');
  window.loadOnboarding = async () => {
    if (!state?.onboarding?.show) return;
    try {
      [layout, catalog] = await Promise.all([api('layout'), api('catalog')]);
      const travel=catalog.templates.filter(template=>template.layout.blocks.every(block=>block.source.startsWith('travel.')));
      $('#onboarding-template').innerHTML = travel.map(template => `<option value="${esc(template.id)}">${esc(template.name)}</option>`).join('');
      $('#onboarding-template').value = travel.find(template=>template.id==='concierge-travel')?.id||travel[0].id;
      await api('onboarding', {state:'started'});
      panel.hidden = currentTab !== 'home';
    } catch (error) { notice(error.message, true); }
  };
  async function saveTemplate() {
    const template = catalog.templates.find(item => item.id === $('#onboarding-template').value);
    layout = await api('layout', {expected_revision:layout.revision, layout:template.layout});
    await window.loadOverview(true);
  }
  $('#onboarding-layout').onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter; button.disabled = true;
    try {
      await saveTemplate();
      status.textContent = 'Template saved locally. Add your wallet and sign-ins, or finish setup.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#onboarding-wallet').onclick = () => { tab('wallet'); openWalletSetup(); };
  $('#onboarding-signins').onclick = () => tab('credentials');
  $('#onboarding-finish').onclick = async () => {
    try { if (layout.revision === 'empty') await saveTemplate(); await api('onboarding', {state:'complete'}); panel.hidden = true; state.onboarding.show = false; }
    catch (error) { status.textContent = error.message; }
  };
})();
