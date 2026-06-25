(function () {
  const SUPABASE_URL = 'https://ctmbrgwpfmsuejawysty.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_z12CJGfWUCZE1jNIRmpRZg_61liDlFX';
  const ENDPOINT = `${SUPABASE_URL}/functions/v1/submit-preview-signup`;

  const form = document.getElementById('preview-signup-form');
  const panelForm = document.getElementById('preview-signup-panel-form');
  const panelSuccess = document.getElementById('preview-signup-panel-success');
  const submitBtn = document.getElementById('preview-signup-submit');
  const errorEl = document.getElementById('preview-signup-error');

  if (!form || !panelForm || !panelSuccess || !submitBtn) return;

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
    submitBtn.textContent = loading ? 'Joining…' : 'Join waitlist';
  }

  function showSuccess() {
    panelForm.hidden = true;
    panelSuccess.hidden = false;
    panelSuccess.focus();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');

    const data = new FormData(form);
    const payload = {
      email: String(data.get('email') || '').trim(),
      platform: String(data.get('platform') || '').trim() || undefined,
      league_count: String(data.get('league_count') || '').trim() || undefined,
      website: String(data.get('website') || '').trim(),
    };

    setLoading(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(function () {
        return {};
      });

      if (!res.ok) {
        const msg =
          body?.error?.message ||
          (res.status === 429
            ? 'Too many attempts. Please wait a few minutes and try again.'
            : 'Something went wrong. Please try again.');
        showError(msg);
        return;
      }

      showSuccess();
    } catch {
      showError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  });
})();
