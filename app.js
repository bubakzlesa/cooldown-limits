(() => {
  'use strict';

  const STORAGE_KEY = 'cooldown-limits-v1';
  const THEME_KEY = 'cooldown-theme-v1';

  const sampleData = {
    version: 1,
    limits: [
      { id: crypto.randomUUID(), name: 'Pizza', emoji: '🍕', value: 14, unit: 'days', note: 'My favorite pizza place', history: [] },
      { id: crypto.randomUUID(), name: 'Burger', emoji: '🍔', value: 7, unit: 'days', note: '', history: [] },
      { id: crypto.randomUUID(), name: 'Buy a game', emoji: '🎮', value: 30, unit: 'days', note: '', history: [] }
    ]
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    tiles: $('tiles'), empty: $('emptyState'), readyCount: $('readyCount'), totalCount: $('totalCount'), nextUnlock: $('nextUnlock'),
    fab: $('fab'), adminBtn: $('adminBtn'), themeBtn: $('themeBtn'), emptyAddBtn: $('emptyAddBtn'),
    limitDialog: $('limitDialog'), limitForm: $('limitForm'), dialogTitle: $('dialogTitle'), editId: $('editId'), nameInput: $('nameInput'), emojiInput: $('emojiInput'), cooldownInput: $('cooldownInput'), unitInput: $('unitInput'), noteInput: $('noteInput'), deleteBtn: $('deleteBtn'),
    useDialog: $('useDialog'), useIcon: $('useIcon'), useTitle: $('useTitle'), useText: $('useText'), confirmUseBtn: $('confirmUseBtn'),
    detailDialog: $('detailDialog'), detailTitle: $('detailTitle'), detailStatus: $('detailStatus'), detailCooldown: $('detailCooldown'), detailLast: $('detailLast'), detailNext: $('detailNext'), detailUses: $('detailUses'), detailNoteWrap: $('detailNoteWrap'), detailNote: $('detailNote'), historyList: $('historyList'), undoBtn: $('undoBtn'), editFromDetailBtn: $('editFromDetailBtn'),
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
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.limits)) throw new Error('Invalid data');
      parsed.limits.forEach(normalizeLimit);
      return parsed;
    } catch (err) {
      console.warn('Could not load data:', err);
      return structuredClone(sampleData);
    }
  }

  function normalizeLimit(limit) {
    if (!Array.isArray(limit.history)) limit.history = [];
    if (!limit.id) limit.id = crypto.randomUUID();
    if (!limit.unit) limit.unit = 'days';
    if (!limit.emoji) limit.emoji = '⏳';
    if (!limit.note) limit.note = '';
  }

  function saveData() {
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

  function remainingText(ms) {
    if (ms <= 0) return 'Available';
    const minute = 60 * 1000, hour = 60 * minute, day = 24 * hour;
    const days = Math.floor(ms / day);
    const hours = Math.floor((ms % day) / hour);
    const minutes = Math.max(1, Math.floor((ms % hour) / minute));
    if (days >= 2) return `${days}d ${hours}h left`;
    if (days === 1) return `1d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  }

  function render() {
    const now = Date.now();
    els.tiles.innerHTML = '';
    els.totalCount.textContent = data.limits.length;
    const ready = data.limits.filter(l => isReady(l, now));
    els.readyCount.textContent = ready.length;
    els.empty.classList.toggle('hidden', data.limits.length !== 0);
    els.tiles.classList.toggle('hidden', data.limits.length === 0);

    const upcoming = data.limits.map(l => ({ l, ts: nextAllowed(l) })).filter(x => x.ts && x.ts > now).sort((a,b) => a.ts - b.ts);
    els.nextUnlock.textContent = upcoming.length ? `${upcoming[0].l.emoji} ${upcoming[0].l.name} · ${formatCompactDate(upcoming[0].ts)}` : 'Everything is available';

    data.limits.forEach(limit => {
      const readyNow = isReady(limit, now);
      const next = nextAllowed(limit);
      const tile = document.createElement('div');
      tile.setAttribute('role', 'button');
      tile.tabIndex = 0;
      tile.className = `tile ${readyNow ? 'ready' : 'blocked'}`;
      tile.dataset.id = limit.id;
      tile.innerHTML = `
        <div class="tile-top">
          <div class="tile-emoji">${escapeHtml(limit.emoji)}</div>
          <button type="button" class="tile-menu" aria-label="Details">•••</button>
        </div>
        <div class="tile-name">${escapeHtml(limit.name)}</div>
        <div class="tile-note">${escapeHtml(limit.note || plural(limit.value, limit.unit))}</div>
        <div class="tile-bottom">
          <span class="status-pill">${readyNow ? '● READY' : `● ${remainingText(next - now).toUpperCase()}`}</span>
          <span class="tile-sub">${readyNow ? `Tap to start ${plural(limit.value, limit.unit)} cooldown` : `Until ${formatCompactDate(next)}`}</span>
        </div>`;

      const activateTile = (e) => {
        if (e.target.closest('.tile-menu')) return;
        readyNow ? openUse(limit.id) : openDetail(limit.id);
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

  function openAdd() {
    els.adminDialog.close();
    els.dialogTitle.textContent = 'Add limit';
    els.editId.value = '';
    els.nameInput.value = '';
    els.emojiInput.value = '⏳';
    els.cooldownInput.value = '14';
    els.unitInput.value = 'days';
    els.noteInput.value = '';
    els.deleteBtn.classList.add('hidden');
    els.limitDialog.showModal();
    setTimeout(() => els.nameInput.focus(), 50);
  }

  function openEdit(id) {
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    els.detailDialog.close();
    els.dialogTitle.textContent = 'Edit limit';
    els.editId.value = id;
    els.nameInput.value = limit.name;
    els.emojiInput.value = limit.emoji;
    els.cooldownInput.value = limit.value;
    els.unitInput.value = limit.unit;
    els.noteInput.value = limit.note || '';
    els.deleteBtn.classList.remove('hidden');
    els.limitDialog.showModal();
  }

  function openUse(id) {
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    pendingUseId = id;
    els.useIcon.textContent = limit.emoji;
    els.useTitle.textContent = limit.name;
    els.useText.textContent = `Start the ${plural(limit.value, limit.unit)} cooldown now?`;
    els.useDialog.showModal();
  }

  function recordUse(id) {
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    limit.history.push(Date.now());
    saveData();
    render();
    showToast(`${limit.emoji} ${limit.name} locked for ${plural(limit.value, limit.unit)}.`);
  }

  function openDetail(id) {
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    detailId = id;
    const now = Date.now();
    const ready = isReady(limit, now);
    const last = lastUse(limit);
    const next = nextAllowed(limit);
    els.detailTitle.textContent = `${limit.emoji} ${limit.name}`;
    els.detailStatus.className = `detail-status ${ready ? 'ready' : 'blocked'}`;
    els.detailStatus.textContent = ready ? '● Available now' : `● ${remainingText(next - now)}`;
    els.detailCooldown.textContent = plural(limit.value, limit.unit);
    els.detailLast.textContent = formatDateTime(last);
    els.detailNext.textContent = next ? formatDateTime(next) : 'Now';
    els.detailUses.textContent = limit.history.length;
    els.detailNoteWrap.classList.toggle('hidden', !limit.note);
    els.detailNote.textContent = limit.note || '';
    els.undoBtn.classList.toggle('hidden', !limit.history.length);
    els.historyList.innerHTML = '';
    if (!limit.history.length) {
      els.historyList.innerHTML = '<div class="history-empty">No uses recorded yet.</div>';
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
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.limits)) throw new Error('Invalid backup');
      parsed.limits.forEach(normalizeLimit);
      data = parsed;
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
    showToast(id ? 'Limit updated.' : 'Limit added.');
  });

  els.deleteBtn.addEventListener('click', () => {
    const id = els.editId.value;
    const limit = data.limits.find(l => l.id === id);
    if (!limit) return;
    if (!confirm(`Delete “${limit.name}” and its history?`)) return;
    data.limits = data.limits.filter(l => l.id !== id);
    saveData(); render(); els.limitDialog.close(); showToast('Limit deleted.');
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
  els.fab.addEventListener('click', openAdd);
  els.emptyAddBtn.addEventListener('click', openAdd);
  els.adminAddBtn.addEventListener('click', openAdd);
  els.adminBtn.addEventListener('click', () => els.adminDialog.showModal());
  els.themeBtn.addEventListener('click', toggleTheme);
  els.exportBtn.addEventListener('click', exportBackup);
  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', () => els.importFile.files[0] && importBackup(els.importFile.files[0]));
  els.resetBtn.addEventListener('click', () => {
    if (!confirm('Delete all limits and history from this device?')) return;
    data = { version: 1, limits: [] };
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
