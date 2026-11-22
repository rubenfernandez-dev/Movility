const panel = document.querySelector('[data-push]');
const feedback = panel.querySelector('[data-push-status]');
const enable = panel.querySelector('[data-subscribe]');
const disable = panel.querySelector('[data-unsubscribe]');
const tell = key => { feedback.textContent = panel.dataset[key]; };

async function update(action, values = {}) {
  const response = await fetch(panel.dataset.push, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...values }),
  });
  if (!response.ok) throw new Error('Push preference could not be saved');
  return (await response.json()).active;
}

async function initialize() {
  if (!window.isSecureContext || !navigator.serviceWorker || !window.PushManager || !window.Notification) {
    tell('unavailable');
    return;
  }
  await navigator.serviceWorker.register('/push-worker.js');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  let active = subscription ? await update('status', { endpoint: subscription.endpoint }) : false;
  const controls = () => {
    if (enable) enable.disabled = active || Notification.permission === 'denied';
    disable.disabled = !active;
  };
  tell(active ? 'enabled' : Notification.permission === 'denied' ? 'blocked' : 'disabled');
  controls();

  enable?.addEventListener('click', async () => {
    enable.disabled = true;
    try {
      subscription ||= await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: panel.dataset.key,
      });
      active = await update('subscribe', { subscription: subscription.toJSON() });
      tell(active ? 'enabled' : 'failed');
    } catch {
      tell(Notification.permission === 'denied' ? 'blocked' : 'failed');
    } finally {
      controls();
    }
  });
  disable.addEventListener('click', async () => {
    disable.disabled = true;
    try {
      active = await update('unsubscribe', { endpoint: subscription.endpoint });
      tell(active ? 'failed' : 'disabled');
    } catch {
      tell('failed');
    } finally {
      controls();
    }
  });
}

initialize().catch(() => tell('unavailable'));
