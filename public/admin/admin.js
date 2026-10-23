(function () {
  'use strict';

  const STORAGE_API_BASE_KEY = 'meera_admin_api_base_url';
  const STORAGE_SOUND_KEY = 'meera_admin_sound_enabled';
  const POLL_INTERVAL_MS = 3500;

  let allOrders = [];
  let knownOrderIds = new Set();
  let newlyArrivedIds = new Set();
  let isInitialFetchDone = false;
  let pollTimer = null;
  let isFetchingOrders = false;

  // Filter state
  let activeStatusFilter = 'ALL';
  let activeDatePreset = 'ALL';
  let activeCustomDate = '';
  let activeSearchQuery = '';

  // Sound state
  let soundEnabled = localStorage.getItem(STORAGE_SOUND_KEY) !== 'false';
  let audioCtx = null;

  // DOM Elements - Dashboard
  const kpiSummary = document.getElementById('kpi-summary');
  const filterBar = document.getElementById('filter-bar');

  const sidebarNavBtns = document.querySelectorAll('.sidebar-nav-btn');
  const navBadgeNew = document.getElementById('nav-badge-new');
  const liveSyncText = document.getElementById('live-sync-text');
  const lastSyncTime = document.getElementById('last-sync-time');

  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const soundIconOn = document.getElementById('sound-icon-on');
  const soundIconOff = document.getElementById('sound-icon-off');
  const soundToggleLabel = document.getElementById('sound-toggle-label');
  const testSoundBtn = document.getElementById('test-sound-btn');
  const manualRefreshBtn = document.getElementById('manual-refresh-btn');

  const newOrderBanner = document.getElementById('new-order-banner');
  const newOrderBannerTitle = document.getElementById('new-order-banner-title');
  const newOrderBannerDesc = document.getElementById('new-order-banner-desc');
  const bannerShowNewBtn = document.getElementById('banner-show-new-btn');
  const bannerDismissBtn = document.getElementById('banner-dismiss-btn');

  // KPI Elements
  const statBaruCount = document.getElementById('stat-baru-count');
  const statBaruFoot = document.getElementById('stat-baru-foot');
  const statDiprosesCount = document.getElementById('stat-diproses-count');
  const statDiprosesFoot = document.getElementById('stat-diproses-foot');
  const statSelesaiCount = document.getElementById('stat-selesai-count');
  const statSelesaiFoot = document.getElementById('stat-selesai-foot');
  const statTotalRevenue = document.getElementById('stat-total-revenue');
  const statRevenueFoot = document.getElementById('stat-revenue-foot');

  // Filter Elements
  const statusPills = document.querySelectorAll('.status-pill');
  const countAllEl = document.getElementById('count-all');
  const countBaruEl = document.getElementById('count-baru');
  const countDiprosesEl = document.getElementById('count-diproses');
  const countSiapEl = document.getElementById('count-siap');
  const countSelesaiEl = document.getElementById('count-selesai');

  const searchOrderInput = document.getElementById('search-order-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const datePresetSelect = document.getElementById('date-preset-select');
  const customDateInput = document.getElementById('custom-date-input');
  const resetFiltersBtn = document.getElementById('reset-filters-btn');
  const emptyResetFilterBtn = document.getElementById('empty-reset-filter-btn');

  // Views & Containers
  const ordersView = document.getElementById('orders-view');
  const historyView = document.getElementById('history-view');
  const deploysView = document.getElementById('deploys-view');
  const ordersShowingText = document.getElementById('orders-showing-text');
  const ordersEmptyState = document.getElementById('orders-empty-state');
  const emptyStateTitle = document.getElementById('empty-state-title');
  const emptyStateDesc = document.getElementById('empty-state-desc');
  const ordersGrid = document.getElementById('orders-grid');

  // Analytics & History Elements
  const reportGrossSales = document.getElementById('report-gross-sales');
  const reportCompletedSales = document.getElementById('report-completed-sales');
  const reportActiveSales = document.getElementById('report-active-sales');
  const reportTotalCups = document.getElementById('report-total-cups');
  const reportAvgOrder = document.getElementById('report-avg-order');
  const paymentBreakdownList = document.getElementById('payment-breakdown-list');
  const topMenuList = document.getElementById('top-menu-list');
  const historyCountLabel = document.getElementById('history-count-label');
  const historyTableBody = document.getElementById('history-table-body');
  const exportCsvBtn = document.getElementById('export-csv-btn');

  // Modal Elements
  const receiptModalOverlay = document.getElementById('receipt-modal-overlay');
  const receiptModalBody = document.getElementById('receipt-modal-body');
  const closeReceiptModalBtn = document.getElementById('close-receipt-modal-btn');
  const closeReceiptFooterBtn = document.getElementById('close-receipt-footer-btn');
  const printReceiptBtn = document.getElementById('print-receipt-btn');
  const toastContainer = document.getElementById('admin-toast-container');

  // Helper: Get API base URL
  function getApiBase() {
    if (window.MEERA_API_BASE_URL) {
      return String(window.MEERA_API_BASE_URL).replace(/\/+$/, '');
    }
    const saved = localStorage.getItem(STORAGE_API_BASE_KEY) || '';
    return saved.replace(/\/+$/, '');
  }

  function formatRupiah(amount) {
    const num = Number(amount) || 0;
    return 'Rp ' + num.toLocaleString('id-ID');
  }

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 45) return 'Baru saja';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} menit lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam lalu`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} hari lalu`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function statusDisplayLabel(status) {
    if (status === 'Baru') return 'Pesanan Baru';
    return status || 'Pesanan Baru';
  }

  function statusCssKey(status) {
    if (status === 'Siap Diambil') return 'Siap';
    if (status === 'Diproses') return 'Diproses';
    if (status === 'Selesai') return 'Selesai';
    return 'Baru';
  }

  // Synthesize a clean two-tone barista service bell using Web Audio API
  function playBaristaChime(forcePlay = false) {
    if (!soundEnabled && !forcePlay) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;

      // First bell tone (E6 - 1318.5 Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1318.5, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.24, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.56);

      // Second bell harmonic tone (G#6 - 1661.2 Hz)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1661.2, now + 0.14);
      gain2.gain.setValueAtTime(0.001, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.28, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.96);
    } catch (_err) {
      // Ignore audio autoplay block if browser hasn't been interacted with yet
    }
  }

  function updateSoundUI() {
    if (!soundToggleBtn) return;
    soundToggleBtn.classList.toggle('active', soundEnabled);
    soundToggleBtn.setAttribute('aria-pressed', String(soundEnabled));
    if (soundIconOn) soundIconOn.hidden = !soundEnabled;
    if (soundIconOff) soundIconOff.hidden = soundEnabled;
    if (soundToggleLabel) {
      soundToggleLabel.textContent = soundEnabled ? 'Suara: Aktif' : 'Suara: Mati';
    }
  }

  function showToast(message) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 4000);
  }

  // Dashboard terbuka langsung tanpa login: muat data begitu halaman dibuka.
  function startDashboard() {
    fetchOrders(true);
    fetchDeploys(false);
    startPolling();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (!document.hidden) {
        fetchOrders(false);
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Fetch orders from backend
  async function fetchOrders(isManual = false) {
    if (isFetchingOrders) return;
    isFetchingOrders = true;

    try {
      const res = await fetch(`${getApiBase()}/api/orders`, { method: 'GET' });

      if (!res.ok) {
        throw new Error('Gagal memuat data pesanan');
      }

      const data = await res.json();
      const fetchedOrders = Array.isArray(data.orders) ? data.orders : [];

      // Check for newly arrived orders
      if (!isInitialFetchDone) {
        fetchedOrders.forEach(ord => knownOrderIds.add(Number(ord.id)));
        isInitialFetchDone = true;
      } else {
        const freshOrders = fetchedOrders.filter(ord => !knownOrderIds.has(Number(ord.id)));
        if (freshOrders.length > 0) {
          freshOrders.forEach(ord => {
            knownOrderIds.add(Number(ord.id));
            newlyArrivedIds.add(Number(ord.id));
          });
          handleNewOrdersNotification(freshOrders);
        }
      }

      allOrders = fetchedOrders;
      renderAll();

      const nowTime = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      if (liveSyncText) liveSyncText.textContent = 'Real-Time Aktif';
      if (lastSyncTime) lastSyncTime.textContent = `Diperbarui ${nowTime}`;
      if (isManual) {
        showToast('Data pesanan berhasil diperbarui.');
      }
    } catch (_err) {
      if (liveSyncText) liveSyncText.textContent = 'Menghubungkan ulang...';
      if (isManual) showToast('Gagal memuat pesanan. Periksa koneksi server/database.');
    } finally {
      isFetchingOrders = false;
    }
  }

  function handleNewOrdersNotification(freshOrders) {
    playBaristaChime(false);

    const latest = freshOrders[0];
    if (newOrderBanner) {
      newOrderBanner.hidden = false;
      if (freshOrders.length === 1) {
        newOrderBannerTitle.textContent = `Pesanan Baru Masuk: #${latest.orderNumber}`;
        const noteText = latest.tableNote && latest.tableNote !== '-' ? ` (${latest.tableNote})` : '';
        newOrderBannerDesc.textContent = `${latest.customerName}${noteText} — Total ${formatRupiah(latest.totalAmount)} via ${latest.paymentMethod}`;
      } else {
        newOrderBannerTitle.textContent = `${freshOrders.length} Pesanan Baru Masuk!`;
        newOrderBannerDesc.textContent = `Pesanan terbaru #${latest.orderNumber} atas nama ${latest.customerName}.`;
      }
    }

    showToast(`Pesanan baru #${latest.orderNumber} dari ${latest.customerName} (${formatRupiah(latest.totalAmount)})!`);
  }

  // Filter logic by Date & Search & Status
  function matchesDateFilter(order) {
    if (activeDatePreset === 'ALL') return true;
    const created = new Date(order.createdAt);
    if (isNaN(created.getTime())) return true;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (activeDatePreset === 'TODAY') {
      return created >= startOfToday;
    }
    if (activeDatePreset === 'YESTERDAY') {
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      return created >= startOfYesterday && created < startOfToday;
    }
    if (activeDatePreset === 'LAST_7_DAYS') {
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      return created >= sevenDaysAgo;
    }
    if (activeDatePreset === 'CUSTOM' && activeCustomDate) {
      const [y, m, d] = activeCustomDate.split('-').map(Number);
      if (!y || !m || !d) return true;
      const startCustom = new Date(y, m - 1, d, 0, 0, 0, 0);
      const endCustom = new Date(y, m - 1, d, 23, 59, 59, 999);
      return created >= startCustom && created <= endCustom;
    }
    return true;
  }

  function matchesSearchFilter(order) {
    if (!activeSearchQuery) return true;
    const q = activeSearchQuery.toLowerCase();
    const orderNo = String(order.orderNumber || '').toLowerCase();
    const customer = String(order.customerName || '').toLowerCase();
    const table = String(order.tableNote || '').toLowerCase();
    const itemsText = Array.isArray(order.items)
      ? order.items.map(i => String(i.name || '').toLowerCase()).join(' ')
      : '';

    return (
      orderNo.includes(q) ||
      customer.includes(q) ||
      table.includes(q) ||
      itemsText.includes(q)
    );
  }

  function getFilteredOrders() {
    return allOrders.filter(order => {
      const statusOk =
        activeStatusFilter === 'ALL' || order.status === activeStatusFilter;
      return statusOk && matchesDateFilter(order) && matchesSearchFilter(order);
    });
  }

  // Total penjualan dari pesanan yang sudah diterima (status bukan "Baru")
  function getAcceptedRevenue() {
    return allOrders.reduce(
      (sum, ord) => (ord.status === 'Baru' ? sum : sum + (Number(ord.totalAmount) || 0)),
      0
    );
  }

  function renderAll() {
    // Calculate global and date-scoped counts
    let baruCount = 0;
    let diprosesCount = 0;
    let siapCount = 0;
    let selesaiCount = 0;
    let totalRevenue = 0; // Total Penjualan = hanya pesanan yang sudah DITERIMA (status bukan "Baru")
    let completedRevenue = 0;
    let pendingRevenue = 0; // nilai pesanan baru yang belum diterima
    let acceptedCount = 0;

    allOrders.forEach(ord => {
      const amount = Number(ord.totalAmount) || 0;

      if (ord.status === 'Baru') {
        baruCount++;
        pendingRevenue += amount;
        return; // belum diterima -> belum masuk Total Penjualan
      }

      // Status selain "Baru" = sudah diterima admin -> masuk Total Penjualan
      totalRevenue += amount;
      acceptedCount++;
      if (ord.status === 'Diproses') diprosesCount++;
      else if (ord.status === 'Siap Diambil') siapCount++;
      else if (ord.status === 'Selesai') {
        selesaiCount++;
        completedRevenue += amount;
      }
    });

    const activeProcessTotal = diprosesCount + siapCount;

    // Update KPI cards
    if (statBaruCount) statBaruCount.textContent = String(baruCount);
    if (statBaruFoot) {
      statBaruFoot.textContent =
        baruCount > 0
          ? `${baruCount} pesanan menunggu diterima`
          : 'Semua pesanan baru telah ditangani';
    }

    if (statDiprosesCount) statDiprosesCount.textContent = String(activeProcessTotal);
    if (statDiprosesFoot) {
      statDiprosesFoot.textContent = `${diprosesCount} diseduh · ${siapCount} siap diambil`;
    }

    if (statSelesaiCount) statSelesaiCount.textContent = String(selesaiCount);
    if (statSelesaiFoot) {
      statSelesaiFoot.textContent = `Omzet tuntas: ${formatRupiah(completedRevenue)}`;
    }

    if (statTotalRevenue) statTotalRevenue.textContent = formatRupiah(totalRevenue);
    if (statRevenueFoot) {
      statRevenueFoot.textContent =
        pendingRevenue > 0
          ? `Dari ${acceptedCount} pesanan diterima · ${formatRupiah(pendingRevenue)} menunggu diterima`
          : `Dari ${acceptedCount} pesanan diterima`;
    }

    // Update Badges
    if (navBadgeNew) navBadgeNew.textContent = String(baruCount);
    if (countAllEl) countAllEl.textContent = String(allOrders.length);
    if (countBaruEl) countBaruEl.textContent = String(baruCount);
    if (countDiprosesEl) countDiprosesEl.textContent = String(diprosesCount);
    if (countSiapEl) countSiapEl.textContent = String(siapCount);
    if (countSelesaiEl) countSelesaiEl.textContent = String(selesaiCount);

    // Update document title
    document.title =
      baruCount > 0
        ? `(${baruCount} Baru) Dashboard Barista — Meera Coffee`
        : 'Barista & Admin Portal — Meera Coffee';

    const filteredOrders = getFilteredOrders();
    renderOrdersGrid(filteredOrders);
    renderAnalyticsAndHistory(filteredOrders);
  }

  function renderOrdersGrid(filteredOrders) {
    if (!ordersGrid || !ordersEmptyState) return;

    const hasActiveFilter =
      activeStatusFilter !== 'ALL' ||
      activeDatePreset !== 'ALL' ||
      activeSearchQuery !== '';

    if (ordersShowingText) {
      ordersShowingText.textContent = `Menampilkan ${filteredOrders.length} dari ${allOrders.length} pesanan`;
    }

    if (filteredOrders.length === 0) {
      ordersGrid.innerHTML = '';
      ordersEmptyState.hidden = false;

      if (allOrders.length === 0) {
        emptyStateTitle.textContent = 'Belum Ada Pesanan Masuk';
        emptyStateDesc.textContent =
          'Saat pelanggan mengonfirmasi pesanan di halaman katalog Meera Coffee, pesanan akan otomatis muncul di layar ini secara real-time tanpa perlu memuat ulang halaman.';
        if (emptyResetFilterBtn) emptyResetFilterBtn.hidden = true;
      } else {
        emptyStateTitle.textContent = 'Pesanan Tidak Ditemukan';
        emptyStateDesc.textContent =
          'Tidak ada pesanan yang cocok dengan filter status, tanggal, atau kata kunci pencarian Anda saat ini.';
        if (emptyResetFilterBtn) emptyResetFilterBtn.hidden = !hasActiveFilter;
      }
      return;
    }

    ordersEmptyState.hidden = true;

    const steps = ['Baru', 'Diproses', 'Siap Diambil', 'Selesai'];

    ordersGrid.innerHTML = filteredOrders
      .map(order => {
        const cssKey = statusCssKey(order.status);
        const isNewHighlight = newlyArrivedIds.has(Number(order.id));
        const items = Array.isArray(order.items) ? order.items : [];
        const totalCups = items.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
        const currentStepIndex = Math.max(0, steps.indexOf(order.status));

        const stepperHtml = steps
          .map((st, idx) => {
            let cls = 'step-node';
            if (idx < currentStepIndex) cls += ' completed';
            else if (idx === currentStepIndex) cls += ' current';
            const label = st === 'Baru' ? 'Baru' : st === 'Siap Diambil' ? 'Siap' : st;
            return `<div class="${cls}">${escapeHtml(label)}</div>`;
          })
          .join('');

        let primaryButtonHtml = '';
        if (order.status === 'Baru') {
          primaryButtonHtml = `
            <button
              type="button"
              class="btn-order-action btn-accept-order"
              data-action="update-status"
              data-order-id="${order.id}"
              data-next-status="Diproses"
            >
              <span>Terima Pesanan</span>
            </button>
          `;
        } else if (order.status === 'Diproses') {
          primaryButtonHtml = `
            <button
              type="button"
              class="btn-order-action btn-ready-order"
              data-action="update-status"
              data-order-id="${order.id}"
              data-next-status="Siap Diambil"
            >
              <span>Tandai Siap Diambil</span>
            </button>
          `;
        } else if (order.status === 'Siap Diambil') {
          primaryButtonHtml = `
            <button
              type="button"
              class="btn-order-action btn-complete-order"
              data-action="update-status"
              data-order-id="${order.id}"
              data-next-status="Selesai"
            >
              <span>Selesaikan Pesanan</span>
            </button>
          `;
        }

        const itemsListHtml = items
          .map(item => {
            const qty = Number(item.qty) || 1;
            const price = Number(item.price) || 0;
            const subtotal = Number(item.subtotal) || price * qty;
            return `
              <li class="order-item-line">
                <div>
                  <span class="item-qty-pill">${qty}x</span>
                  <span class="item-line-name">${escapeHtml(item.name)}</span>
                </div>
                <span class="item-line-price">${formatRupiah(subtotal)}</span>
              </li>
            `;
          })
          .join('');

        return `
          <article class="order-card status-border-${cssKey} ${isNewHighlight ? 'newly-arrived' : ''}" data-card-id="${order.id}">
            <div>
              <div class="order-card-header">
                <div>
                  <span class="order-id-badge">#${escapeHtml(order.orderNumber)}</span>
                  <span class="order-timestamp">
                    ${escapeHtml(formatDateTime(order.createdAt))} · <strong>${escapeHtml(formatRelativeTime(order.createdAt))}</strong>
                  </span>
                </div>
                <span class="status-badge status-badge-${cssKey}">
                  ${escapeHtml(statusDisplayLabel(order.status))}
                </span>
              </div>

              <div class="order-customer-box" style="margin-top: 0.75rem;">
                <div>
                  <span class="customer-meta-label">Nama Pembeli</span>
                  <div class="customer-meta-value">${escapeHtml(order.customerName)}</div>
                </div>
                <div>
                  <span class="customer-meta-label">Catatan</span>
                  <div class="customer-meta-value">${escapeHtml(order.tableNote || '-')}</div>
                </div>
              </div>

              <div class="order-items-section" style="margin-top: 0.85rem;">
                <span class="order-items-title">Daftar Menu (${totalCups} Item)</span>
                <ul class="order-items-list">
                  ${itemsListHtml}
                </ul>
              </div>
            </div>

            <div>
              <div class="order-payment-summary">
                <span class="payment-method-chip">${escapeHtml(order.paymentMethod)}</span>
                <span class="order-total-amount">${formatRupiah(order.totalAmount)}</span>
              </div>

              <div class="order-workflow-stepper" style="margin-top: 0.75rem;">
                ${stepperHtml}
              </div>

              <div class="order-card-actions" style="margin-top: 0.75rem;">
                ${primaryButtonHtml ? `<div class="primary-action-row">${primaryButtonHtml}</div>` : ''}
                <div class="secondary-action-row">
                  <select
                    class="status-select-control"
                    aria-label="Perbarui Status Pesanan #${escapeHtml(order.orderNumber)}"
                    data-action="select-status"
                    data-order-id="${order.id}"
                  >
                    <option value="Baru" ${order.status === 'Baru' ? 'selected' : ''}>Status: Pesanan Baru</option>
                    <option value="Diproses" ${order.status === 'Diproses' ? 'selected' : ''}>Status: Diproses</option>
                    <option value="Siap Diambil" ${order.status === 'Siap Diambil' ? 'selected' : ''}>Status: Siap Diambil</option>
                    <option value="Selesai" ${order.status === 'Selesai' ? 'selected' : ''}>Status: Selesai</option>
                  </select>
                  <button
                    type="button"
                    class="btn-receipt-view"
                    data-action="open-receipt"
                    data-order-id="${order.id}"
                  >
                    Detail / Struk
                  </button>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function renderAnalyticsAndHistory(filteredOrders) {
    let grossSales = 0;
    let completedSales = 0;
    let activeSales = 0;
    let totalCups = 0;

    const paymentMap = new Map();
    const menuMap = new Map();

    filteredOrders.forEach(ord => {
      const amount = Number(ord.totalAmount) || 0;
      grossSales += amount;
      if (ord.status === 'Selesai') {
        completedSales += amount;
      } else {
        activeSales += amount;
      }

      const method = ord.paymentMethod || 'QRIS';
      const prevPay = paymentMap.get(method) || { count: 0, total: 0 };
      prevPay.count += 1;
      prevPay.total += amount;
      paymentMap.set(method, prevPay);

      const items = Array.isArray(ord.items) ? ord.items : [];
      items.forEach(item => {
        const qty = Number(item.qty) || 0;
        const sub = Number(item.subtotal) || (Number(item.price) || 0) * qty;
        totalCups += qty;

        const mName = item.name || 'Menu';
        const prevMenu = menuMap.get(mName) || { qty: 0, revenue: 0 };
        prevMenu.qty += qty;
        prevMenu.revenue += sub;
        menuMap.set(mName, prevMenu);
      });
    });

    const avgOrder =
      filteredOrders.length > 0 ? Math.round(grossSales / filteredOrders.length) : 0;

    if (reportGrossSales) reportGrossSales.textContent = formatRupiah(grossSales);
    if (reportCompletedSales) reportCompletedSales.textContent = formatRupiah(completedSales);
    if (reportActiveSales) reportActiveSales.textContent = formatRupiah(activeSales);
    if (reportTotalCups) reportTotalCups.textContent = `${totalCups} Cup`;
    if (reportAvgOrder) reportAvgOrder.textContent = formatRupiah(avgOrder);

    // Payment method breakdown
    if (paymentBreakdownList) {
      if (paymentMap.size === 0) {
        paymentBreakdownList.innerHTML =
          '<p style="font-size:0.8rem; color:#8c7368;">Belum ada data transaksi.</p>';
      } else {
        paymentBreakdownList.innerHTML = Array.from(paymentMap.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .map(
            ([method, info]) => `
              <div class="breakdown-row">
                <span>${escapeHtml(method)} (${info.count} pesanan)</span>
                <strong>${formatRupiah(info.total)}</strong>
              </div>
            `
          )
          .join('');
      }
    }

    // Top menu breakdown
    if (topMenuList) {
      if (menuMap.size === 0) {
        topMenuList.innerHTML =
          '<p style="font-size:0.8rem; color:#8c7368;">Belum ada menu terjual.</p>';
      } else {
        topMenuList.innerHTML = Array.from(menuMap.entries())
          .sort((a, b) => b[1].qty - a[1].qty)
          .slice(0, 6)
          .map(
            ([name, info]) => `
              <div class="breakdown-row">
                <span>${escapeHtml(name)} <strong>(${info.qty}x)</strong></span>
                <strong>${formatRupiah(info.revenue)}</strong>
              </div>
            `
          )
          .join('');
      }
    }

    // History table
    if (historyCountLabel) {
      historyCountLabel.textContent = `${filteredOrders.length} transaksi`;
    }

    if (historyTableBody) {
      if (filteredOrders.length === 0) {
        historyTableBody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center; padding:2rem; color:#8c7368;">
              Belum ada riwayat transaksi yang sesuai dengan filter.
            </td>
          </tr>
        `;
      } else {
        historyTableBody.innerHTML = filteredOrders
          .map(order => {
            const cssKey = statusCssKey(order.status);
            const itemsSummary = Array.isArray(order.items)
              ? order.items
                  .map(i => `${escapeHtml(i.name)} (${Number(i.qty) || 1}x)`)
                  .join(', ')
              : '-';

            return `
              <tr>
                <td style="font-family:var(--font-mono); font-weight:700;">#${escapeHtml(order.orderNumber)}</td>
                <td>${escapeHtml(formatDateTime(order.createdAt))}</td>
                <td>
                  <strong>${escapeHtml(order.customerName)}</strong><br>
                  <span style="font-size:0.75rem; color:#8c7368;">${escapeHtml(order.tableNote || '-')}</span>
                </td>
                <td>${itemsSummary}</td>
                <td><span class="payment-method-chip">${escapeHtml(order.paymentMethod)}</span></td>
                <td style="font-family:var(--font-mono); font-weight:700;">${formatRupiah(order.totalAmount)}</td>
                <td>
                  <span class="status-badge status-badge-${cssKey}">
                    ${escapeHtml(statusDisplayLabel(order.status))}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    class="btn-receipt-view"
                    data-action="open-receipt"
                    data-order-id="${order.id}"
                  >
                    Struk
                  </button>
                </td>
              </tr>
            `;
          })
          .join('');
      }
    }
  }

  // Update order status on server
  async function updateOrderStatus(orderId, nextStatus, triggerEl) {
    const numericId = Number(orderId);
    if (!numericId || !nextStatus) return;

    if (triggerEl) {
      triggerEl.disabled = true;
    }

    try {
      const res = await fetch(`${getApiBase()}/api/orders/${numericId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: numericId,
          status: nextStatus
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.order) {
        throw new Error(data.error || 'Gagal memperbarui status pesanan.');
      }

      newlyArrivedIds.delete(numericId);

      // Update local state immediately
      const idx = allOrders.findIndex(o => Number(o.id) === numericId);
      const prevStatus = idx > -1 ? allOrders[idx].status : null;
      if (idx > -1) {
        allOrders[idx] = data.order;
      }

      renderAll();

      if (prevStatus === 'Baru' && data.order.status !== 'Baru') {
        // Pesanan baru diterima -> Total Penjualan langsung bertambah
        showToast(
          `Pesanan #${data.order.orderNumber} diterima. Total Penjualan +${formatRupiah(data.order.totalAmount)} → ${formatRupiah(getAcceptedRevenue())}`
        );
      } else {
        showToast(
          `Status pesanan #${data.order.orderNumber} diperbarui ke "${statusDisplayLabel(data.order.status)}".`
        );
      }
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui status pesanan.');
      renderAll();
    } finally {
      if (triggerEl) {
        triggerEl.disabled = false;
      }
    }
  }

  // Open Receipt / Order Detail Modal
  function openReceiptModal(orderId) {
    const order = allOrders.find(o => Number(o.id) === Number(orderId));
    if (!order || !receiptModalOverlay || !receiptModalBody) return;

    const items = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = items
      .map(
        it => `
          <div class="receipt-row">
            <span>${Number(it.qty) || 1}x ${escapeHtml(it.name)} (@${formatRupiah(it.price)})</span>
            <strong style="font-family:var(--font-mono);">${formatRupiah(it.subtotal || it.price * it.qty)}</strong>
          </div>
        `
      )
      .join('');

    receiptModalBody.innerHTML = `
      <div class="receipt-paper">
        <div class="receipt-paper-head">
          <h4 style="font-family:var(--font-serif); font-size:1.15rem; color:#261813;">MEERA COFFEE</h4>
          <p style="font-size:0.75rem; color:#8c7368;">Buka Setiap Hari 10:00 - 22:00 WIB</p>
        </div>
        <div class="receipt-row">
          <span>No. Pesanan:</span>
          <strong style="font-family:var(--font-mono);">#${escapeHtml(order.orderNumber)}</strong>
        </div>
        <div class="receipt-row">
          <span>Waktu Masuk:</span>
          <span>${escapeHtml(formatDateTime(order.createdAt))}</span>
        </div>
        <div class="receipt-row">
          <span>Nama Pembeli:</span>
          <strong>${escapeHtml(order.customerName)}</strong>
        </div>
        <div class="receipt-row">
          <span>Catatan:</span>
          <strong>${escapeHtml(order.tableNote || '-')}</strong>
        </div>
        <div class="receipt-row">
          <span>Status Pesanan:</span>
          <strong>${escapeHtml(statusDisplayLabel(order.status))}</strong>
        </div>
        <div class="receipt-items">
          ${itemsHtml}
        </div>
        <div class="receipt-row" style="font-size:0.95rem; font-weight:800;">
          <span>TOTAL PEMBAYARAN</span>
          <span style="font-family:var(--font-mono);">${formatRupiah(order.totalAmount)}</span>
        </div>
        <div class="receipt-row" style="margin-top:0.35rem; font-size:0.78rem; color:#59453c;">
          <span>Metode Pembayaran:</span>
          <strong>${escapeHtml(order.paymentMethod)}</strong>
        </div>
      </div>
    `;

    receiptModalOverlay.hidden = false;
  }

  function closeReceiptModal() {
    if (receiptModalOverlay) {
      receiptModalOverlay.hidden = true;
    }
  }

  // Export filtered transactions to CSV
  function exportToCsv() {
    const filtered = getFilteredOrders();
    if (filtered.length === 0) {
      showToast('Tidak ada transaksi untuk diekspor.');
      return;
    }

    const headers = [
      'Nomor Pesanan',
      'Waktu Masuk',
      'Nama Pembeli',
      'Catatan',
      'Daftar Menu',
      'Total Harga (Rp)',
      'Metode Pembayaran',
      'Status'
    ];

    const rows = filtered.map(ord => {
      const menuStr = Array.isArray(ord.items)
        ? ord.items.map(i => `${i.name} x${i.qty}`).join('; ')
        : '';
      return [
        ord.orderNumber,
        formatDateTime(ord.createdAt),
        ord.customerName,
        ord.tableNote || '-',
        menuStr,
        ord.totalAmount,
        ord.paymentMethod,
        statusDisplayLabel(ord.status)
      ]
        .map(val => `"${String(val ?? '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-pesanan-meera-coffee-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Laporan CSV berhasil diunduh.');
  }

  function resetAllFilters() {
    activeStatusFilter = 'ALL';
    activeDatePreset = 'ALL';
    activeCustomDate = '';
    activeSearchQuery = '';

    statusPills.forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-status') === 'ALL');
    });
    if (datePresetSelect) datePresetSelect.value = 'ALL';
    if (customDateInput) {
      customDateInput.value = '';
      customDateInput.hidden = true;
    }
    if (searchOrderInput) searchOrderInput.value = '';
    if (clearSearchBtn) clearSearchBtn.hidden = true;

    renderAll();
  }

  // ==========================================================================
  // Pergantian menu (view)
  // ==========================================================================
  let currentView = 'orders-view';
  let lastDeploysFetchAt = 0;

  function showView(targetView) {
    currentView = targetView;

    sidebarNavBtns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-view') === targetView);
    });

    ordersView.hidden = targetView !== 'orders-view';
    historyView.hidden = targetView !== 'history-view';
    if (deploysView) deploysView.hidden = targetView !== 'deploys-view';

    // KPI pesanan & filter hanya relevan untuk menu pesanan dan riwayat
    const isDeploys = targetView === 'deploys-view';
    if (kpiSummary) kpiSummary.hidden = isDeploys;
    if (filterBar) filterBar.hidden = isDeploys;

    if (isDeploys && Date.now() - lastDeploysFetchAt > 10000) {
      fetchDeploys(false);
    }
  }

  // ==========================================================================
  // Deploys — riwayat rilis website
  // ==========================================================================
  let deploysData = [];
  let deploysSummary = null;
  let deploysCurrent = null;
  let isFetchingDeploys = false;

  function safeUrl(value) {
    return /^https?:\/\//i.test(String(value || '')) ? String(value) : '';
  }

  function deployStatusClass(status) {
    if (status === 'Berhasil') return 'status-badge-ok';
    if (status === 'Sedang Berjalan') return 'status-badge-run';
    if (status === 'Gagal') return 'status-badge-fail';
    return 'status-badge-cancel';
  }

  function deploySourceLabel(source) {
    if (source === 'vercel') return 'Vercel (otomatis)';
    if (source === 'seed') return 'Data Awal';
    return 'Manual';
  }

  function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || seconds === '') return '-';
    const n = Number(seconds);
    if (!Number.isFinite(n)) return '-';
    if (n < 60) return `${n} dtk`;
    return `${Math.floor(n / 60)} mnt ${n % 60} dtk`;
  }

  async function fetchDeploys(isManual) {
    if (isFetchingDeploys) return;
    isFetchingDeploys = true;
    try {
      const res = await fetch(`${getApiBase()}/api/deploys`, { method: 'GET' });
      if (!res.ok) throw new Error('Gagal memuat riwayat deploy');
      const data = await res.json();
      deploysData = Array.isArray(data.deploys) ? data.deploys : [];
      deploysSummary = data.summary || null;
      deploysCurrent = data.current || null;
      lastDeploysFetchAt = Date.now();
      renderDeploys();
      if (isManual) showToast('Riwayat deploy berhasil diperbarui.');
    } catch (_err) {
      if (isManual || currentView === 'deploys-view') {
        showToast('Gagal memuat riwayat deploy. Periksa koneksi server/database.');
      }
    } finally {
      isFetchingDeploys = false;
    }
  }

  function renderDeploys() {
    const total = deploysData.length;
    const summary = deploysSummary || {};
    const success = Number(summary.successCount) || 0;
    const failed = Number(summary.failedCount) || 0;

    const navBadge = document.getElementById('nav-badge-deploys');
    if (navBadge) navBadge.textContent = String(total);

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText('deploy-stat-total', String(total));
    setText('deploy-stat-prod', `${Number(summary.productionCount) || 0} ke Production`);
    setText('deploy-stat-success', String(success));
    setText('deploy-stat-rate', total > 0 ? `Tingkat keberhasilan ${Math.round((success / total) * 100)}%` : 'Tingkat keberhasilan -');
    setText('deploy-stat-failed', String(failed));
    setText('deploy-stat-last', summary.lastDeployVersion || '-');
    setText('deploy-stat-last-foot', summary.lastDeployAt ? formatDateTime(summary.lastDeployAt) : 'Belum ada data');
    setText('deploy-count-label', `${total} deploy`);

    renderCurrentDeployment();

    const body = document.getElementById('deploy-table-body');
    if (!body) return;

    if (total === 0) {
      body.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:2rem; color:#8c7368;">
            Belum ada riwayat deploy. Gunakan tombol <strong>Catat Deploy</strong> untuk menambahkan.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = deploysData
      .map(d => {
        const url = safeUrl(d.url);
        const versionHtml = url
          ? `<a class="deploy-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.version)}</a>`
          : escapeHtml(d.version);
        const sha = d.commitSha ? `<span class="deploy-sha">${escapeHtml(String(d.commitSha).slice(0, 7))}</span> ` : '';
        return `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:700;">${versionHtml}</td>
            <td>${escapeHtml(formatDateTime(d.createdAt))}<br><span class="deploy-sub">${escapeHtml(formatRelativeTime(d.createdAt))}</span></td>
            <td><span class="env-chip env-chip-${escapeHtml(d.environment)}">${escapeHtml(d.environment)}</span></td>
            <td><span class="status-badge ${deployStatusClass(d.status)}">${escapeHtml(d.status)}</span></td>
            <td>
              <div class="deploy-commit">${sha}${escapeHtml(d.commitMessage)}</div>
              <span class="deploy-sub">branch ${escapeHtml(d.branch)}</span>
            </td>
            <td>${escapeHtml(d.deployedBy)}</td>
            <td style="font-family:var(--font-mono); white-space:nowrap;">${escapeHtml(formatDuration(d.durationSeconds))}</td>
            <td><span class="source-chip source-chip-${escapeHtml(d.source)}">${escapeHtml(deploySourceLabel(d.source))}</span></td>
          </tr>
        `;
      })
      .join('');
  }

  function renderCurrentDeployment() {
    const card = document.getElementById('deploy-current-card');
    if (!card) return;
    const c = deploysCurrent;
    if (!c) {
      card.innerHTML = '';
      return;
    }

    if (!c.isVercel) {
      card.innerHTML = `
        <div class="deploy-current-head">
          <span class="deploy-current-title">Deployment Aktif</span>
          <span class="env-chip env-chip-Development">Lokal</span>
        </div>
        <p class="deploy-current-desc">
          Server berjalan di komputer lokal (Node ${escapeHtml(c.nodeVersion || '-')}).
          Setelah proyek di-deploy ke Vercel, setiap deployment baru akan tercatat otomatis di sini.
        </p>
      `;
      return;
    }

    const envLabel = c.environment === 'production' ? 'Production' : c.environment === 'preview' ? 'Preview' : 'Development';
    const url = safeUrl(c.url);
    const rows = [
      ['Lingkungan', escapeHtml(envLabel)],
      ['Region', escapeHtml(c.region || '-')],
      ['Branch', escapeHtml(c.branch || '-')],
      ['Commit', c.commitSha ? `<span class="deploy-sha">${escapeHtml(String(c.commitSha).slice(0, 7))}</span> ${escapeHtml(c.commitMessage || '')}` : '-'],
      ['URL', url ? `<a class="deploy-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>` : '-'],
      ['Runtime', escapeHtml(`Node ${c.nodeVersion || '-'}`)]
    ];
    card.innerHTML = `
      <div class="deploy-current-head">
        <span class="deploy-current-title">Deployment Aktif</span>
        <span class="env-chip env-chip-${escapeHtml(envLabel)}">${escapeHtml(envLabel)}</span>
        <span class="status-badge status-badge-ok">Berjalan</span>
      </div>
      <dl class="deploy-current-grid">
        ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
      </dl>
    `;
  }

  function showDeployFormError(message) {
    const el = document.getElementById('deploy-form-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function setDeployFormOpen(open) {
    const form = document.getElementById('deploy-form');
    const toggle = document.getElementById('toggle-deploy-form-btn');
    if (!form) return;
    form.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      const first = document.getElementById('deploy-version');
      if (first) first.focus();
    } else {
      showDeployFormError('');
    }
  }

  function initDeploysUI() {
    const form = document.getElementById('deploy-form');
    const toggle = document.getElementById('toggle-deploy-form-btn');
    const cancel = document.getElementById('deploy-cancel-btn');
    const submit = document.getElementById('deploy-submit-btn');
    if (!form) return;

    if (toggle) toggle.addEventListener('click', () => setDeployFormOpen(form.hidden));
    if (cancel) cancel.addEventListener('click', () => setDeployFormOpen(false));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      showDeployFormError('');

      const val = id => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };
      const version = val('deploy-version');
      if (!version) {
        showDeployFormError('Versi / nama rilis wajib diisi.');
        return;
      }

      const payload = {
        version,
        environment: val('deploy-environment'),
        status: val('deploy-status'),
        branch: val('deploy-branch'),
        commitMessage: val('deploy-message'),
        deployedBy: val('deploy-by'),
        url: val('deploy-url'),
        durationSeconds: val('deploy-duration')
      };

      submit.disabled = true;
      try {
        const res = await fetch(`${getApiBase()}/api/deploys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.deploy) {
          throw new Error(data.error || 'Gagal menyimpan data deploy.');
        }
        form.reset();
        document.getElementById('deploy-branch').value = 'main';
        setDeployFormOpen(false);
        showToast(data.message || 'Deploy berhasil dicatat.');
        fetchDeploys(false);
      } catch (err) {
        showDeployFormError(err.message || 'Gagal menyimpan data deploy.');
      } finally {
        submit.disabled = false;
      }
    });
  }

  // Event Listeners Setup
  function initEventListeners() {
    updateSoundUI();

    // Sidebar view switching (Pesanan Masuk / Riwayat / Deploys)
    sidebarNavBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        showView(btn.getAttribute('data-view'));
      });
    });

    // Sound toggle & test
    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem(STORAGE_SOUND_KEY, String(soundEnabled));
        updateSoundUI();
        if (soundEnabled) {
          playBaristaChime(true);
          showToast('Notifikasi suara diaktifkan.');
        } else {
          showToast('Notifikasi suara dinonaktifkan.');
        }
      });
    }

    if (testSoundBtn) {
      testSoundBtn.addEventListener('click', () => {
        playBaristaChime(true);
        showToast('Memutar nada dering lonceng barista.');
      });
    }

    if (manualRefreshBtn) {
      manualRefreshBtn.addEventListener('click', () => {
        if (currentView === 'deploys-view') {
          fetchDeploys(true);
        } else {
          fetchOrders(true);
        }
      });
    }

    if (bannerShowNewBtn) {
      bannerShowNewBtn.addEventListener('click', () => {
        activeStatusFilter = 'Baru';
        statusPills.forEach(p => {
          p.classList.toggle('active', p.getAttribute('data-status') === 'Baru');
        });
        if (newOrderBanner) newOrderBanner.hidden = true;
        showView('orders-view');
        renderAll();
      });
    }

    if (bannerDismissBtn) {
      bannerDismissBtn.addEventListener('click', () => {
        if (newOrderBanner) newOrderBanner.hidden = true;
      });
    }

    // KPI card quick status filter
    document.querySelectorAll('.kpi-card[data-quick-status]').forEach(card => {
      card.addEventListener('click', () => {
        const status = card.getAttribute('data-quick-status');
        if (!status) return;
        activeStatusFilter = status;
        statusPills.forEach(p => {
          p.classList.toggle('active', p.getAttribute('data-status') === status);
        });
        renderAll();
      });
    });

    // Status filter pills
    statusPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const status = pill.getAttribute('data-status') || 'ALL';
        activeStatusFilter = status;
        statusPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        renderAll();
      });
    });

    // Search input
    if (searchOrderInput) {
      searchOrderInput.addEventListener('input', () => {
        activeSearchQuery = searchOrderInput.value.trim();
        if (clearSearchBtn) {
          clearSearchBtn.hidden = activeSearchQuery.length === 0;
        }
        renderAll();
      });
    }

    if (clearSearchBtn && searchOrderInput) {
      clearSearchBtn.addEventListener('click', () => {
        searchOrderInput.value = '';
        activeSearchQuery = '';
        clearSearchBtn.hidden = true;
        renderAll();
      });
    }

    // Date filter controls
    if (datePresetSelect) {
      datePresetSelect.addEventListener('change', () => {
        activeDatePreset = datePresetSelect.value;
        if (customDateInput) {
          customDateInput.hidden = activeDatePreset !== 'CUSTOM';
          if (activeDatePreset === 'CUSTOM' && !customDateInput.value) {
            const todayIso = new Date().toISOString().slice(0, 10);
            customDateInput.value = todayIso;
            activeCustomDate = todayIso;
          }
        }
        renderAll();
      });
    }

    if (customDateInput) {
      customDateInput.addEventListener('change', () => {
        activeCustomDate = customDateInput.value;
        renderAll();
      });
    }

    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', resetAllFilters);
    }
    if (emptyResetFilterBtn) {
      emptyResetFilterBtn.addEventListener('click', resetAllFilters);
    }

    // Delegated actions on Orders Grid & History Table
    document.addEventListener('click', e => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;

      const action = actionBtn.getAttribute('data-action');
      const orderId = actionBtn.getAttribute('data-order-id');

      if (action === 'update-status') {
        const nextStatus = actionBtn.getAttribute('data-next-status');
        updateOrderStatus(orderId, nextStatus, actionBtn);
      } else if (action === 'open-receipt') {
        openReceiptModal(orderId);
      }
    });

    document.addEventListener('change', e => {
      const selectEl = e.target.closest('select[data-action="select-status"]');
      if (!selectEl) return;
      const orderId = selectEl.getAttribute('data-order-id');
      const nextStatus = selectEl.value;
      updateOrderStatus(orderId, nextStatus, selectEl);
    });

    // Receipt modal controls
    if (closeReceiptModalBtn) closeReceiptModalBtn.addEventListener('click', closeReceiptModal);
    if (closeReceiptFooterBtn) closeReceiptFooterBtn.addEventListener('click', closeReceiptModal);
    if (receiptModalOverlay) {
      receiptModalOverlay.addEventListener('click', e => {
        if (e.target === receiptModalOverlay) closeReceiptModal();
      });
    }
    if (printReceiptBtn) {
      printReceiptBtn.addEventListener('click', () => window.print());
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', exportToCsv);
    }

    // Instant cross-tab notification via BroadcastChannel
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('meera_orders_channel');
        bc.addEventListener('message', event => {
          if (event.data && event.data.type === 'NEW_ORDER') {
            fetchOrders(false);
          }
        });
      }
    } catch (_e) {
      // Ignore BroadcastChannel unsupported environments
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        fetchOrders(false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    initDeploysUI();
    startDashboard();
  });
})();
