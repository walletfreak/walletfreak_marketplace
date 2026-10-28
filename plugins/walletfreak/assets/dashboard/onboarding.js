'use strict';
(() => {
  const panel = $('#onboarding'), status = $('#onboarding-status');
  window.loadOnboarding = async () => {
    if (!state?.onboarding?.show) return;
    try { await api('onboarding', {state:'started'}); panel.hidden = currentTab !== 'home'; }
    catch (error) { notice(error.message, true); }
  };
  $('#onboarding-wallet').onclick = () => tab('wallet');
  $('#onboarding-signins').onclick = () => { tab('wallet'); notice('Add a card or loyalty account, then connect its sign-in from that account.'); };
  $('#onboarding-finish').onclick = async () => {
    try { await api('onboarding', {state:'complete'}); panel.hidden = true; state.onboarding.show = false; }
    catch (error) { status.textContent = error.message; }
  };
})();
