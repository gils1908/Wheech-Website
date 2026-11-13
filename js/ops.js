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

  function votesPerUser(votes, users) {
    const people = Number(users) || 0;
    if (people <= 0) return '—';
    const avg = (Number(votes) || 0) / people;
    return `${avg.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} / user`;
  }

  function crowdShare(ready, userMatchups) {
    const user = Number(userMatchups) || 0;
    if (user <= 0) return '—';
    const pct = Math.round(((Number(ready) || 0) / user) * 100);
    return `${pct}% of user`;
  }

  function showPageTop() {
    window.scrollTo(0, 0);
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
      // schedule_hours is the stale window. Under 12 hours means the hourly Pro cadence.
      const hourly = hours < 12;
      const staleAfter = hours === 1 ? '1 hour' : `${hours} hours`;
      hintEl.textContent = sync.due
        ? (hourly
          ? `Expected every hour. Stale after ${staleAfter}.`
          : `Expected once a day. Stale after ${staleAfter}.`)
        : (hourly
          ? 'Hourly sync is not required in this phase.'
          : 'Daily sync is not required in this phase.');
    }
  }

  const CRON_ABOUT = {
    open_app_week: 'Prepares the next week before 3:00 AM Eastern: full NFL sync, generated matchups, and a fresh vote gate.',
    recompute_aggregates: 'Refreshes crowd start/sit percentages after new votes.',
    provision_synthetic_matchups: 'Fills this week’s vote-gate pool with generated matchups.',
    flip_off_season: 'Turns the season off three days after week 18 ends.',
    update_season_state_hourly: 'Checks the NFL calendar and sets the live week and phase.',
    cleanup_vote_gate_batches: 'Deletes finished vote batches older than a week.',
    sync_nfl_actuals_daily: 'Pulls player fantasy points from finished games.',
    sync_nfl_data_hourly: 'Updates players, the schedule, and projections every hour. Teams on Mondays.',
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

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const WEEK_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const WEEK_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const trendPaint = {};

  function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, String(attrs[key])));
    return node;
  }

  function dayParts(iso) {
    const date = new Date(`${iso}T12:00:00`);
    const wd = date.getDay();
    return {
      letter: WEEK_LETTERS[wd],
      name: WEEK_NAMES[wd],
      weekend: wd === 0 || wd === 6,
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  }

  function niceMax(maxValue) {
    const value = Number(maxValue) || 0;
    if (value <= 0) return 4;
    const head = Math.max(value, value * 1.05);
    const exp = 10 ** Math.floor(Math.log10(head));
    const frac = head / exp;
    const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 4 ? 4 : frac <= 5 ? 5 : 10;
    return nice * exp;
  }

  function paintTrend(svg, tip, days, series) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    tip.hidden = true;
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (width < 80 || height < 80 || days.length < 2) return;

    const margin = { top: 8, right: 6, bottom: 42, left: 34 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const g = svgEl('g', { transform: `translate(${margin.left},${margin.top})` });
    svg.appendChild(g);

    function measure(text, className) {
      const node = svgEl('text', { class: className });
      node.textContent = text;
      g.appendChild(node);
      const w = node.getComputedTextLength();
      g.removeChild(node);
      return w;
    }

    const letterW = Math.max(...WEEK_LETTERS.map((text) => measure(text, 'ops-trend__label')));
    const nameW = Math.max(...WEEK_NAMES.map((text) => measure(text, 'ops-trend__label')));
    const dateW = Math.max(...days.map((row) => measure(dayParts(row.day).dateLabel, 'ops-trend__label is-date')));
    const everyPad = letterW / 2 + 1;
    const everyStep = (plotW - everyPad * 2) / (days.length - 1);
    const everyDay = everyStep >= letterW + 4;
    const sparseW = Math.max(nameW, dateW);
    const sparsePad = sparseW / 2 + 1;
    const pad = everyDay ? everyPad : sparsePad;
    const step = (plotW - pad * 2) / (days.length - 1);
    let stride = 1;
    if (!everyDay) {
      if (step <= 0) stride = days.length;
      else {
        while (stride < days.length && stride * step < sparseW + 4) stride += 1;
      }
    }
    const xAt = (i) => pad + step * i;
    const peak = Math.max(0, ...days.flatMap((row) => series.map((item) => Number(row[item.key]) || 0)));
    const yMax = niceMax(peak);
    const yAt = (value) => plotH - (value / yMax) * plotH;

    for (let tick = 1; tick <= 4; tick += 1) {
      const value = (yMax / 4) * tick;
      g.appendChild(svgEl('line', {
        class: 'ops-trend__grid',
        x1: 0,
        x2: plotW,
        y1: yAt(value),
        y2: yAt(value),
      }));
    }
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = (yMax / 4) * tick;
      const label = svgEl('text', {
        class: 'ops-trend__label',
        x: -8,
        y: yAt(value),
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
      });
      label.textContent = fmt(Number.isInteger(value) ? value : Number(value.toFixed(1)));
      g.appendChild(label);
    }
    g.appendChild(svgEl('line', {
      class: 'ops-trend__baseline',
      x1: 0,
      x2: plotW,
      y1: yAt(0),
      y2: yAt(0),
    }));

    function axisText(className, text, x, y) {
      const w = measure(text, className);
      let anchor = 'middle';
      if (x - w / 2 < 1) anchor = 'start';
      else if (x + w / 2 > plotW - 1) anchor = 'end';
      const node = svgEl('text', {
        class: className,
        x,
        y,
        'text-anchor': anchor,
      });
      node.textContent = text;
      g.appendChild(node);
    }

    days.forEach((row, i) => {
      const onStride = everyDay || i % stride === 0;
      if (!onStride) return;
      const parts = dayParts(row.day);
      const cls = `ops-trend__label${parts.weekend ? ' is-weekend' : ''}`;
      axisText(cls, everyDay ? parts.letter : parts.name, xAt(i), plotH + 14);
      if (everyDay ? i % 7 === 0 : true) {
        axisText('ops-trend__label is-date', parts.dateLabel, xAt(i), plotH + 28);
      }
    });

    series.forEach((item) => {
      const d = days.map((row, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        return `${cmd}${xAt(i).toFixed(1)},${yAt(Number(row[item.key]) || 0).toFixed(1)}`;
      }).join('');
      g.appendChild(svgEl('path', { class: `ops-trend__series ${item.className}`, d }));
    });

    const dots = series.map((item) => {
      const dot = svgEl('circle', { class: `ops-trend__dot ${item.className}`, r: 4, cx: 0, cy: 0 });
      dot.style.opacity = '0';
      g.appendChild(dot);
      return dot;
    });
    const guide = svgEl('line', { class: 'ops-trend__guide', y1: 0, y2: plotH, x1: 0, x2: 0 });
    guide.style.opacity = '0';
    g.appendChild(guide);

    function showTip(i, clientX, clientY) {
      const row = days[i];
      const parts = dayParts(row.day);
      const px = xAt(i);
      guide.setAttribute('x1', String(px));
      guide.setAttribute('x2', String(px));
      guide.style.opacity = '1';
      series.forEach((item, idx) => {
        dots[idx].setAttribute('cx', String(px));
        dots[idx].setAttribute('cy', String(yAt(Number(row[item.key]) || 0)));
        dots[idx].style.opacity = '1';
      });
      tip.replaceChildren();
      const title = document.createElement('p');
      title.className = 'ops-trend__tip-date';
      title.textContent = `${parts.name}, ${parts.dateLabel}`;
      tip.appendChild(title);
      series.forEach((item) => {
        const line = document.createElement('p');
        line.className = 'ops-trend__tip-row';
        const name = document.createElement('span');
        name.textContent = item.label;
        const value = document.createElement('span');
        value.textContent = fmt(row[item.key]);
        line.appendChild(name);
        line.appendChild(value);
        tip.appendChild(line);
      });
      tip.hidden = false;
      const wrap = svg.parentNode.getBoundingClientRect();
      let left = clientX - wrap.left + 14;
      let top = clientY - wrap.top - tip.offsetHeight - 10;
      if (left + tip.offsetWidth > wrap.width - 4) left = clientX - wrap.left - tip.offsetWidth - 14;
      if (left < 4) left = 4;
      if (top < 4) top = clientY - wrap.top + 14;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    const overlay = svgEl('rect', { fill: 'transparent', x: 0, y: 0, width: plotW, height: plotH });
    overlay.addEventListener('pointermove', (event) => {
      const local = event.clientX - overlay.getBoundingClientRect().left;
      let nearest = 0;
      let best = Infinity;
      days.forEach((_, i) => {
        const dist = Math.abs(xAt(i) - local);
        if (dist < best) {
          best = dist;
          nearest = i;
        }
      });
      showTip(nearest, event.clientX, event.clientY);
    });
    overlay.addEventListener('pointerleave', () => {
      guide.style.opacity = '0';
      dots.forEach((dot) => { dot.style.opacity = '0'; });
      tip.hidden = true;
    });
    g.appendChild(overlay);
  }

  function bindTrend(id, series) {
    if (trendPaint[id]) return;
    const svg = $(id);
    const tip = $(`${id}-tip`);
    if (!svg || !tip) return;
    let days = [];
    const paint = () => paintTrend(svg, tip, days, series);
    trendPaint[id] = (next) => {
      days = next;
      paint();
    };
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => paint());
      observer.observe(svg);
    }
  }

  function renderTrends(days) {
    const body = $('ops-trends-body');
    const empty = $('ops-trends-empty');
    const rows = Array.isArray(days) ? days.filter((row) => row && row.day) : [];
    const ready = rows.length >= 2;
    if (body) body.hidden = !ready;
    if (empty) empty.hidden = ready;
    if (!ready) return;
    bindTrend('ops-trend-people', [
      { key: 'users', label: 'Users', className: 'is-users' },
      { key: 'matchups', label: 'Matchups', className: 'is-matchups' },
    ]);
    bindTrend('ops-trend-votes', [
      { key: 'votes', label: 'Votes', className: 'is-votes' },
    ]);
    if (trendPaint['ops-trend-people']) trendPaint['ops-trend-people'](rows);
    if (trendPaint['ops-trend-votes']) trendPaint['ops-trend-votes'](rows);
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
    setText('ops-votes-avg', votesPerUser(votes.week, users.week));
    setText('ops-early', fmt(early.week_matchups_below_k));
    setText('ops-ready', fmt(early.week_matchups_crowd_ready));
    setText(
      'ops-ready-share',
      crowdShare(early.week_matchups_crowd_ready, matchups.user_created),
    );

    renderNflSync(snapshot.nfl_sync || {});
    renderCrons(snapshot.crons || []);
    renderTrends((snapshot.activity || {}).days);

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
    showPageTop();
    showError('');
    setStatus('Loading…');
    await loadSnapshot();
    showPageTop();
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

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', showPageTop);

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
