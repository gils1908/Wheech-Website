(function () {
  const SUPABASE_URL = 'https://ctmbrgwpfmsuejawysty.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_z12CJGfWUCZE1jNIRmpRZg_61liDlFX';
  const REFRESH_MS = 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const loginEl = $('ops-login');
  const boardEl = $('ops-board');
  const errorEl = $('ops-error');
  const statusEl = $('ops-status');
  const flagsEl = $('ops-flags');
  const emailInput = $('ops-email');

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  let timer = null;

  function showError(message) {
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
  }

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  function formatWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const local = d.toLocaleString();
    const ago = relativeAgo(d);
    return ago ? `${local} (${ago})` : local;
  }

  function relativeAgo(d) {
    const ms = Date.now() - d.getTime();
    if (ms < 0) return '';
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (ms < minute) return 'just now';
    if (ms < hour) {
      const n = Math.floor(ms / minute);
      return n === 1 ? '1 minute ago' : `${n} minutes ago`;
    }
    if (ms < 2 * day) {
      const n = Math.floor(ms / hour);
      return n === 1 ? '1 hour ago' : `${n} hours ago`;
    }
    const n = Math.floor(ms / day);
    return n === 1 ? '1 day ago' : `${n} days ago`;
  }

  function flagText(flag) {
    const base = flag.message || '';
    if (!flag.at) return base;
    const when = formatWhen(flag.at);
    return when ? `${base} · ${when}` : base;
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString();
  }

  function renderNflSync(sync) {
    const badge = $('ops-sync-badge');
    const whenEl = $('ops-sync-when');
    const hintEl = $('ops-sync-hint');
    if (!badge || !whenEl) return;

    const hours = Number(sync.schedule_hours) || 24;
    const when = sync.last_success_at
      ? formatWhen(sync.last_success_at)
      : 'No successful sync yet';
    whenEl.textContent = when;

    if (sync.stale) {
      badge.textContent = 'Stale';
      badge.className = 'ops-badge stale';
    } else if (!sync.due) {
      badge.textContent = 'Idle';
      badge.className = 'ops-badge';
    } else {
      badge.textContent = 'OK';
      badge.className = 'ops-badge ok';
    }

    if (hintEl) {
      hintEl.textContent = sync.due
        ? `Expected once a day. Stale after ${hours} hours.`
        : 'Daily sync is not required in this phase.';
    }
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function render(snapshot) {
    const season = snapshot.season || {};
    const users = snapshot.users || {};
    const matchups = snapshot.matchups || {};
    const votes = snapshot.votes || {};
    const early = snapshot.early_voting || {};
    const flags = snapshot.red_flags || [];

    setText('ops-heading', `${season.season} · Week ${season.week}`);
    const meta = [season.phase, season.sim_active ? 'sim on' : null]
      .filter(Boolean)
      .join(' · ');
    const metaEl = $('ops-heading-meta');
    if (metaEl) {
      metaEl.textContent = meta;
      metaEl.hidden = !meta;
      metaEl.classList.toggle('ops-hidden', !meta);
    }
    setText('ops-users', fmt(users.week));
    setText('ops-matchups-user', fmt(matchups.user_created));
    setText('ops-matchups-generated', fmt(matchups.generated));
    setText('ops-votes', fmt(votes.week));
    setText('ops-early', fmt(early.week_matchups_below_k));
    setText(
      'ops-early-hint',
      `${fmt(early.week_matchups_crowd_ready)} crowd-ready`,
    );

    renderNflSync(snapshot.nfl_sync || {});

    flagsEl.innerHTML = '';
    if (!flags.length) {
      const li = document.createElement('li');
      li.className = 'ok';
      li.textContent = 'No red flags';
      flagsEl.appendChild(li);
    } else {
      flags.forEach((flag) => {
        const li = document.createElement('li');
        li.className = flag.severity === 'error' ? 'error' : 'warning';
        li.textContent = flagText(flag);
        flagsEl.appendChild(li);
      });
    }

    const generated = snapshot.generated_at
      ? new Date(snapshot.generated_at).toLocaleString()
      : '';
    setStatus(generated ? `Updated ${generated}` : '');
  }

  async function loadSnapshot() {
    const { data, error } = await client.functions.invoke('get-ops-snapshot', {
      method: 'GET',
    });
    if (error) {
      const status = error.context?.status;
      if (status === 401) throw new Error('Sign-in expired. Please sign in again.');
      if (status === 403) throw new Error('This account is not on the ops allowlist.');
      const nested = data?.error?.message || error.message;
      throw new Error(nested || 'Could not load snapshot.');
    }
    if (data?.error?.message) throw new Error(data.error.message);
    render(data);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadSnapshot().catch((err) => showError(err.message));
      }
    }, REFRESH_MS);
  }

  const refreshBtn = $('ops-refresh');
  const signOutBtn = $('ops-signout');
  const runSyncBtn = $('ops-sync-run');
  let syncRunning = false;

  function setAuthed(authed) {
    loginEl.classList.toggle('ops-hidden', authed);
    boardEl.classList.toggle('ops-hidden', !authed);
    loginEl.hidden = authed;
    boardEl.hidden = !authed;
    refreshBtn.classList.toggle('ops-hidden', !authed);
    signOutBtn.classList.toggle('ops-hidden', !authed);
    refreshBtn.hidden = !authed;
    signOutBtn.hidden = !authed;
  }

  async function showBoard() {
    setAuthed(true);
    showError('');
    setStatus('Loading…');
    await loadSnapshot();
    startTimer();
  }

  function showLogin() {
    stopTimer();
    setAuthed(false);
    setStatus('');
    setText('ops-heading', 'Ops snapshot');
    const metaEl = $('ops-heading-meta');
    if (metaEl) {
      metaEl.textContent = '';
      metaEl.hidden = true;
      metaEl.classList.add('ops-hidden');
    }
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    showError('');
    const email = String(emailInput.value || '').trim();
    if (!email) {
      showError('Enter your email.');
      return;
    }
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      showError(error.message);
      return;
    }
    setStatus('Check your email for the sign-in link.');
  }

  async function signInGoogle() {
    showError('');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) showError(error.message);
  }

  async function signOut() {
    await client.auth.signOut();
    showLogin();
  }

  $('ops-magic').addEventListener('submit', sendMagicLink);
  $('ops-google').addEventListener('click', signInGoogle);
  $('ops-refresh').addEventListener('click', () => {
    loadSnapshot().catch((err) => showError(err.message));
  });
  $('ops-signout').addEventListener('click', signOut);

  async function runNflSync() {
    if (syncRunning) return;
    syncRunning = true;
    showError('');
    runSyncBtn.disabled = true;
    runSyncBtn.textContent = 'Running…';
    try {
      const { data, error } = await client.functions.invoke('trigger-sync', {
        body: { run_type: 'nfl_data' },
      });
      if (error) {
        const status = error.context?.status;
        if (status === 401) throw new Error('Sign-in expired. Please sign in again.');
        if (status === 403) throw new Error('This account is not on the ops allowlist.');
        throw new Error(data?.error || error.message || 'Sync failed.');
      }
      if (data?.success === false) throw new Error(data.error || 'Sync failed.');
      await loadSnapshot();
    } catch (err) {
      showError(err.message);
    } finally {
      syncRunning = false;
      runSyncBtn.disabled = false;
      runSyncBtn.textContent = 'Run sync';
    }
  }

  runSyncBtn.addEventListener('click', runNflSync);

  client.auth.onAuthStateChange((event, session) => {
    if (!session) {
      showLogin();
      return;
    }
    if (event === 'TOKEN_REFRESHED') return;
    showBoard().catch(async (err) => {
      showError(err.message);
      if (/allowlist|expired|Sign-in/i.test(err.message)) {
        await client.auth.signOut();
      }
    });
  });
})();
