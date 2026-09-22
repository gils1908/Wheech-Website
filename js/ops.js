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
    const rel = relativeLabel(d);
    return rel ? `${local} (${rel})` : local;
  }

  function relativeLabel(d) {
    const ms = d.getTime() - Date.now();
    const abs = Math.abs(ms);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (abs < minute) return ms >= 0 ? 'due now' : 'just now';
    let n;
    let unit;
    if (abs < hour) {
      n = Math.floor(abs / minute);
      unit = n === 1 ? 'minute' : 'minutes';
    } else if (abs < 2 * day) {
      n = Math.floor(abs / hour);
      unit = n === 1 ? 'hour' : 'hours';
    } else {
      n = Math.floor(abs / day);
      unit = n === 1 ? 'day' : 'days';
    }
    return ms >= 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`;
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

  const CRON_ABOUT = {
    recompute_aggregates: 'Refreshes crowd start/sit percentages after new votes.',
    provision_synthetic_matchups: 'Fills this week’s vote-gate pool with generated matchups.',
    flip_off_season: 'Turns the season off three days after week 18 ends.',
    update_season_state_hourly: 'Checks the NFL calendar and sets the live week and phase.',
    cleanup_vote_gate_batches: 'Deletes finished vote batches older than a week.',
    sync_nfl_actuals_daily: 'Pulls player fantasy points from finished games.',
    sync_nfl_data_daily: 'Updates players, the schedule, and projections. Teams on Mondays.',
    calc_nfl_weeks_daily: 'Rebuilds each week’s start and end from the schedule.',
    score_weekly_matchups_tuesday: 'Scores last week’s votes once the games are final.',
  };

  function renderCrons(crons) {
    const list = $('ops-crons');
    if (!list) return;
    list.innerHTML = '';
    if (!Array.isArray(crons) || !crons.length) {
      const li = document.createElement('li');
      li.className = 'ops-crons__empty';
      li.textContent = 'No cron jobs found';
      list.appendChild(li);
      return;
    }
    crons.forEach((job) => {
      const li = document.createElement('li');
      const failed = String(job.last_status || '').toLowerCase() === 'failed';
      li.className = 'ops-cron';
      if (job.active === false) li.classList.add('is-inactive');
      if (failed) li.classList.add('is-failed');
      li.title = job.jobname || '';

      const top = document.createElement('div');
      top.className = 'ops-cron__top';
      const name = document.createElement('p');
      name.className = 'ops-cron__name';
      name.textContent = job.label || job.jobname || 'Cron';
      const sched = document.createElement('span');
      sched.className = 'ops-cron__sched';
      const bits = [job.schedule_label || job.schedule || ''];
      if (job.active === false) bits.push('paused');
      if (failed) bits.push('failed');
      sched.textContent = bits.filter(Boolean).join(' · ');
      top.appendChild(name);
      top.appendChild(sched);

      const about = document.createElement('p');
      about.className = 'ops-cron__about';
      about.textContent = CRON_ABOUT[job.jobname] || '';

      const lastIso = job.last_end_at || job.last_start_at;
      const times = document.createElement('dl');
      times.className = 'ops-cron__times';
      const addRow = (label, value) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        times.appendChild(dt);
        times.appendChild(dd);
      };
      addRow('Last', lastIso ? formatWhen(lastIso) : 'Never');
      addRow('Next', job.active === false
        ? 'Paused'
        : (job.next_run_at ? formatWhen(job.next_run_at) : 'Unknown'));

      li.appendChild(top);
      if (about.textContent) li.appendChild(about);
      li.appendChild(times);
      list.appendChild(li);
    });
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
    renderCrons(snapshot.crons || []);

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

  const refreshBtn = $('ops-refresh');
  let snapshotLoading = false;

  function setRefreshLoading(on) {
    if (!refreshBtn) return;
    refreshBtn.classList.toggle('is-loading', on);
    refreshBtn.disabled = on;
    refreshBtn.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  async function loadSnapshot() {
    if (snapshotLoading) return;
    snapshotLoading = true;
    setRefreshLoading(true);
    try {
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
    } finally {
      snapshotLoading = false;
      setRefreshLoading(false);
    }
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
