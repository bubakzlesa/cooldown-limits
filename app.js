(() => {
  'use strict';

  const STORAGE_KEY = 'cooldown-limits-v1';
  const THEME_KEY = 'cooldown-theme-v1';
  const DATA_VERSION = 2;
  // Keep STORAGE_KEY stable. Add future schema changes as sequential migrations in migrateData().

  const sampleData = {
    version: DATA_VERSION,
    limits: [
      { id: crypto.randomUUID(), type: 'limit', name: 'Pizza', emoji: '🍕', value: 14, unit: 'days', note: 'My favorite pizza place', history: [] },
      { id: crypto.randomUUID(), type: 'routine', name: 'Resistance workout', emoji: '🏋️', value: 2, unit: 'days', note: 'Build strength and feel better', history: [] },
      { id: crypto.randomUUID(), type: 'routine', name: 'Clean apartment', emoji: '🧹', value: 7, unit: 'days', note: '', history: [] }
    ]
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    tiles: $('tiles'), empty: $('emptyState'), readyCount: $('readyCount'), totalCount: $('totalCount'), nextUnlock: $('nextUnlock'),
    fab: $('fab'), adminBtn: $('adminBtn'), themeBtn: $('themeBtn'), emptyAddBtn: $('emptyAddBtn'),
    limitDialog: $('limitDialog'), limitForm: $('limitForm'), dialogTitle: $('dialogTitle'), editId: $('editId'), nameInput: $('nameInput'), emojiInput: $('emojiInput'), cooldownInput: $('cooldownInput'), unitInput: $('unitInput'), noteInput: $('noteInput'), intervalLabel: $('intervalLabel'), noteLabel: $('noteLabel'), deleteBtn: $('deleteBtn'),
    useDialog: $('useDialog'), useIcon: $('useIcon'), useTitle: $('useTitle'), useText: $('useText'), confirmUseBtn: $('confirmUseBtn'),
    detailDialog: $('detailDialog'), detailTitle: $('detailTitle'), detailStatus: $('detailStatus'), detailCooldown: $('detailCooldown'), detailLast: $('detailLast'), detailNext: $('detailNext'), detailUses: $('detailUses'), detailIntervalLabel: $('detailIntervalLabel'), detailLastLabel: $('detailLastLabel'), detailNextLabel: $('detailNextLabel'), detailUsesLabel: $('detailUsesLabel'), detailEncouragement: $('detailEncouragement'), detailNoteWrap: $('detailNoteWrap'), detailNoteLabel: $('detailNoteLabel'), detailNote: $('detailNote'), historyList: $('historyList'), undoBtn: $('undoBtn'), editFromDetailBtn: $('editFromDetailBtn'), logFromDetailBtn: $('logFromDetailBtn'),
    adminDialog: $('adminDialog'), adminAddBtn: $('adminAddBtn'), exportBtn: $('exportBtn'), importBtn: $('importBtn'), importFile: $('importFile'), resetBtn: $('resetBtn'), toast: $('toast')
  };

  let data = loadData();
  let pendingUseId = null;
  let detailId = null;
  let toastTimer = null;

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(sampleData);
      const parsed = migrateData(JSON.parse(raw));
      if (JSON.stringify(parsed) !== raw) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    } catch (err) {
      console.warn('Could not load data:', err);
      return structuredClone(sampleData);
    }
  }

  function migrateData(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.limits)) throw new Error('Invalid data');
    const migrated = structuredClone(input);
    let version = Number.isInteger(migrated.version) ? migrated.version : 1;
    if (version < 1 || version > DATA_VERSION) throw new Error('Unsupported data version');

    if (version === 1) {
      migrated.limits.forEach(limit => {
        if (!limit.type) limit.type = 'limit';
      });
      version = 2;
    }

    if (version !== DATA_VERSION) throw new Error('Missing data migration');
    migrated.version = version;
    migrated.limits.forEach(normalizeLimit);
    return migrated;
  }

  function normalizeLimit(limit) {
    if (!limit || typeof limit !== 'object') throw new Error('Invalid tile');
    if (!Array.isArray(limit.history)) limit.history = [];
    if (!limit.id) limit.id = crypto.randomUUID();
    if (!limit.unit) limit.unit = 'days';
    if (!limit.emoji) limit.emoji = '⏳';
    if (!limit.note) limit.note = '';
    if (limit.type !== 'routine') limit.type = 'limit';
  }

  function saveData() {
    data.version = DATA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function unitMs(limit) {
    const n = Math.max(1, Number(limit.value) || 1);
    if (limit.unit === 'hours') return n * 60 * 60 * 1000;
    if (limit.unit === 'weeks') return n * 7 * 24 * 60 * 60 * 1000;
    return n * 24 * 60 * 60 * 1000;
  }

  function lastUse(limit) {
    if (!limit.history.length) return null;
    return Math.max(...limit.history.map(Number));
  }

  function nextAllowed(limit) {
    const last = lastUse(limit);
    return last == null ? null : last + unitMs(limit);
  }

  function isReady(limit, now = Date.now()) {
    const next = nextAllowed(limit);
    return next == null || now >= next;
  }

  function plural(value, unit) {
    const singular = unit.replace(/s$/, '');
    return `${value} ${Number(value) === 1 ? singular : unit}`;
  }

  function formatDateTime(ts) {
    if (!ts) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
  }

  function formatCompactDate(ts) {
    if (!ts) return '—';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  }

  function durationText(ms) {
    if (ms <= 0) return 'now';
    const minute = 60 * 1000, hour = 60 * minute, day = 24 * hour;
    const days = Math.floor(ms / day);
    const hours = Math.floor((ms % day) / hour);
    const minutes = Math.max(1, Math.floor((ms % hour) / minute));
    if (days >= 2) return `${days}d ${hours}h`;
    if (days === 1) return `1d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function tilePresentation(limit, now) {
    const next = nextAllowed(limit);
    if (limit.type === 'routine') {
      if (next == null) {
        return { className: 'routine-new', status: '● START', sub: 'Tap to log your first check-in' };
      }
      if (next > now) {
        return { className: 'routine-track', status: `● ON TRACK · ${durationText(next - now).toUpperCase()}`, sub: `Due ${formatCompactDate(next)}` };
      }
      const overdue = now - next;
      return {
        className: 'routine-due',
        status: overdue < 60 * 1000 ? '● DUE NOW' : `● OVERDUE · ${durationText(overdue).toUpperCase()}`,
        sub: 'Ready when you are — tap to log'
      };
    }
    if (isReady(limit, now)) {
      return { className: 'limit-available', status: '● AVAILABLE', sub: `Tap to start ${plural(limit.value, limit.unit)} cooldown` };
    }
    return { className: 'limit-cooling', status: `● COOLDOWN · ${durationText(next - now).toUpperCase()}`, sub: `Until ${formatCompactDate(next)}` };
  }

  function render() {
    const now = Date.now();
    els.tiles.innerHTML = '';
    els.totalCount.textContent = data.limits.length;
    const actionable = data.limits.filter(limit => isReady(limit, now));
    els.readyCount.textContent = actionable.length;
    els.empty.classList.toggle('hidden', data.limits.length !== 0);
    els.tiles.classList.toggle('hidden', data.limits.length === 0);

    const upcoming = data.limits.map(l => ({ l, ts: nextAllowed(l) })).filter(x => x.ts && x.ts > now).sort((a,b) => a.ts - b.ts);
    if (upcoming.length) {
      const next = upcoming[0];
      const eventName = next.l.type === 'routine' ? 'due' : 'available';
      els.nextUnlock.textContent = `${next.l.emoji} ${next.l.name} ${eventName} · ${formatCompactDate(next.ts)}`;
    } else {
      els.nextUnlock.textContent = 'No upcoming changes';
    }

    data.limits.forEach(limit => {
      const readyNow = isReady(limit, now);
      const presentation = tilePresentation(limit, now);
      const tile = document.createElement('div');
      tile.setAttribute('role', 'button');
      tile.tabIndex = 0;
      tile.className = `tile ${presentation.className}`;
      tile.dataset.id = limit.id;
      tile.innerHTML = `
        <div class="tile-top">
          <div class="tile-identity"><div class="tile-emoji">${escapeHtml(limit.emoji)}</div><span class="tile-kind">${limit.type === 'routine' ? 'ROUTINE' : 'LIMIT'}</span></div>
          <button type="button" class="tile-menu" aria-label="Details">•••</button>
        </div>
        <div class="tile-name">${escapeHtml(limit.name)}</div>
        <div class="tile-note">${escapeHtml(limit.note || plural(limit.value, limit.unit))}</div>
        <div class="tile-bottom">
          <span class="status-pill">${presentation.status}</span>
          <span class="tile-sub">${presentation.sub}</span>
        </div>`;

      const activateTile = (e) => {
        if (e.target.closest('.tile-menu')) return;
        limit.type === 'routine' || readyNow ? openUse(limit.id) : openDetail(limit.id);
      };
      tile.addEventListener('click', activateTile);
      tile.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.tile-menu')) {
          e.preventDefault();
          activateTile(e);
        }
      });
      tile.querySelector('.tile-menu').addEventListener('click', (e) => {
        e.stopPropagation();
        openDetail(limit.id);
      });
      els.tiles.appendChild(tile);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function selectedType() {
    return document.querySelector('input[name="limitType"]:checked')?.value || 'limit';
  }

  function setSelectedType(type) {
    const input = document.querySelector(`input[name="limitType"][value="${type === 'routine' ? 'routine' : 'limit'}"]`);
    if (input) input.checked = true;
    updateFormType();
  }

  function updateFormType() {
    const routine = selectedType() === 'routine';
    els.intervalLabel.textContent = routine ? 'Repeat every' : 'Cooldown';
    els.noteLabel.textContent = routine ? 'Why this matters (optional)' : 'Optional note';
    els.noteInput.placeholder = routine ? 'Build strength and feel better' : 'Only at my favorite place';
    els.unitInput.setAttribute('aria-label', routine ? 'Routine interval unit' : 'Cooldown unit');
  }

  function openAdd() {
    els.adminDialog.close();
    els.dialogTitle.textContent = 'Add tile';
    els.editId.value = '';
    els.nameInput.value = '';
    els.emojiInput.value = '⏳';
    els.cooldownInput.value = '14';
    els.unitInput.value = 'days';
    els.noteInput.value = '';
    setSelectedType('limit');
    els.deleteBtn.classList.add('hidden');
    els.limitDialog.showModal();
    setTimeout(() => els.nameInput.focus(), 50);
  }

  function openEdit(id) {
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    els.detailDialog.close();
    els.dialogTitle.textContent = 'Edit tile';
    els.editId.value = id;
    els.nameInput.value = limit.name;
    els.emojiInput.value = limit.emoji;
    els.cooldownInput.value = limit.value;
    els.unitInput.value = limit.unit;
    els.noteInput.value = limit.note || '';
    setSelectedType(limit.type);
    els.deleteBtn.classList.remove('hidden');
    els.limitDialog.showModal();
  }

  function openUse(id) {
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    const now = Date.now();
    const next = nextAllowed(limit);
    pendingUseId = id;
    els.useIcon.textContent = limit.emoji;
    els.useTitle.textContent = limit.name;
    if (limit.type === 'routine') {
      els.confirmUseBtn.textContent = 'Log now';
      if (next && next > now) {
        els.useText.textContent = `${durationText(next - now)} until due. Log now and restart the ${plural(limit.value, limit.unit)} interval?`;
      } else {
        els.useText.textContent = `Log this routine now? The next check-in will be in ${plural(limit.value, limit.unit)}.`;
      }
    } else {
      els.confirmUseBtn.textContent = 'Use now';
      els.useText.textContent = `Start the ${plural(limit.value, limit.unit)} cooldown now?`;
    }
    els.useDialog.showModal();
  }

  function recordUse(id) {
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    limit.history.push(Date.now());
    saveData();
    render();
    if (limit.type === 'routine') {
      showToast(`${limit.emoji} ${limit.name} logged — next due ${formatCompactDate(nextAllowed(limit))}.`);
    } else {
      showToast(`${limit.emoji} ${limit.name} locked for ${plural(limit.value, limit.unit)}.`);
    }
  }

  function openDetail(id) {
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    detailId = id;
    const now = Date.now();
    const last = lastUse(limit);
    const next = nextAllowed(limit);
    const presentation = tilePresentation(limit, now);
    const routine = limit.type === 'routine';
    els.detailTitle.textContent = `${limit.emoji} ${limit.name}`;
    els.detailStatus.className = `detail-status ${presentation.className}`;
    els.detailStatus.textContent = presentation.status;
    els.detailIntervalLabel.textContent = routine ? 'Repeat every' : 'Cooldown';
    els.detailLastLabel.textContent = routine ? 'Last logged' : 'Last used';
    els.detailNextLabel.textContent = routine ? 'Next due' : 'Next allowed';
    els.detailUsesLabel.textContent = routine ? 'Times logged' : 'Total uses';
    els.detailCooldown.textContent = plural(limit.value, limit.unit);
    els.detailLast.textContent = formatDateTime(last);
    els.detailNext.textContent = next ? formatDateTime(next) : (routine ? 'Start anytime' : 'Now');
    els.detailUses.textContent = limit.history.length;
    els.detailEncouragement.classList.toggle('hidden', !routine || !limit.history.length);
    els.detailEncouragement.textContent = limit.history.length === 1 ? 'You’ve shown up once.' : `You’ve shown up ${limit.history.length} times.`;
    els.detailNoteWrap.classList.toggle('hidden', !limit.note);
    els.detailNoteLabel.textContent = routine ? 'Why this matters' : 'Note';
    els.detailNote.textContent = limit.note || '';
    els.logFromDetailBtn.classList.toggle('hidden', !routine);
    els.undoBtn.classList.toggle('hidden', !limit.history.length);
    els.historyList.innerHTML = '';
    if (!limit.history.length) {
      els.historyList.innerHTML = `<div class="history-empty">No ${routine ? 'check-ins' : 'uses'} recorded yet.</div>`;
    } else {
      [...limit.history].sort((a,b) => b-a).forEach((ts, idx) => {
        const row = document.createElement('div');
        row.className = 'history-item';
        row.innerHTML = `<span>${idx === 0 ? 'Latest' : `#${limit.history.length - idx}`}</span><small>${formatDateTime(Number(ts))}</small>`;
        els.historyList.appendChild(row);
      });
    }
    els.detailDialog.showModal();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function applyTheme(theme) {
    const effective = theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = effective;
    els.themeBtn.textContent = effective === 'dark' ? '☾' : '☼';
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = `cooldown-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exported.');
  }

  async function importBackup(file) {
    try {
      const imported = migrateData(JSON.parse(await file.text()));
      data = imported;
      saveData();
      render();
      els.adminDialog.close();
      showToast('Backup imported.');
    } catch {
      alert('This does not look like a valid Cooldown backup file.');
    } finally {
      els.importFile.value = '';
    }
  }

  els.limitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = els.editId.value;
    const payload = {
      type: selectedType(),
      name: els.nameInput.value.trim(),
      emoji: els.emojiInput.value.trim() || '⏳',
      value: Math.max(1, Number(els.cooldownInput.value) || 1),
      unit: els.unitInput.value,
      note: els.noteInput.value.trim()
    };
    if (!payload.name) return;

    if (id) {
      const limit = data.limits.find(l => l.id === id);
      if (limit) Object.assign(limit, payload);
    } else {
      data.limits.push({ id: crypto.randomUUID(), ...payload, history: [] });
    }
    saveData();
    render();
    els.limitDialog.close();
    showToast(id ? 'Tile updated.' : 'Tile added.');
  });

  els.deleteBtn.addEventListener('click', () => {
    const id = els.editId.value;
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    if (!confirm(`Delete “${limit.name}” and its history?`)) return;
    data.limits = data.limits.filter(l => l.id !== id);
    saveData(); render(); els.limitDialog.close(); showToast('Tile deleted.');
  });

  els.confirmUseBtn.addEventListener('click', () => {
    if (!pendingUseId) return;
    const id = pendingUseId;
    pendingUseId = null;
    els.useDialog.close();
    recordUse(id);
  });

  els.undoBtn.addEventListener('click', () => {
    const limit = data.limits.find(l => l.id === detailId);
    if (!limit || !limit.history.length) return;
    if (!confirm(`Undo the latest use of “${limit.name}”?`)) return;
    const latest = Math.max(...limit.history.map(Number));
    const index = limit.history.findIndex(ts => Number(ts) === latest);
    if (index >= 0) limit.history.splice(index, 1);
    saveData(); render(); els.detailDialog.close(); showToast('Last use undone.');
  });

  els.editFromDetailBtn.addEventListener('click', () => detailId && openEdit(detailId));
  els.logFromDetailBtn.addEventListener('click', () => {
    if (!detailId) return;
    const id = detailId;
    els.detailDialog.close();
    openUse(id);
  });
  document.querySelectorAll('input[name="limitType"]').forEach(input => input.addEventListener('change', updateFormType));
  els.fab.addEventListener('click', openAdd);
  els.emptyAddBtn.addEventListener('click', openAdd);
  els.adminAddBtn.addEventListener('click', openAdd);
  els.adminBtn.addEventListener('click', () => els.adminDialog.showModal());
  els.themeBtn.addEventListener('click', toggleTheme);
  els.exportBtn.addEventListener('click', exportBackup);
  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', () => els.importFile.files[0] && importBackup(els.importFile.files[0]));
  els.resetBtn.addEventListener('click', () => {
    if (!confirm('Delete all tiles and history from this device?')) return;
    data = { version: DATA_VERSION, limits: [] };
    saveData(); render(); els.adminDialog.close(); showToast('App reset.');
  });

  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => $(btn.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => {
    if (e.target === dialog) dialog.close();
  }));

  applyTheme(localStorage.getItem(THEME_KEY) || 'auto');
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme('auto');
  });

  render();
  setInterval(render, 30 * 1000);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
  }
})();
