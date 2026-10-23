document.addEventListener('DOMContentLoaded', function () {
  let cart = [];

  const cartDrawer = document.getElementById('cart-drawer');
  const cartOverlay = document.getElementById('cart-overlay');
  const closeCartBtn = document.getElementById('close-cart-btn');
  const floatingCart = document.getElementById('floating-cart-bar');
  const headerCartBtn = document.querySelector('.btn-cart');
  const filterButtons = document.querySelectorAll('.chip-btn');
  const productCards = document.querySelectorAll('.product-card');
  const emptySearchState = document.getElementById('empty-search-state');

  function openCartDrawer() {
    if (cartDrawer && cartOverlay) {
      cartOverlay.style.display = 'block';
      setTimeout(() => { cartDrawer.style.right = '0'; }, 10);
    }
  }

  function closeCartDrawer() {
    if (cartDrawer && cartOverlay) {
      cartDrawer.style.right = '-100%';
      setTimeout(() => { cartOverlay.style.display = 'none'; }, 300);
    }
  }

  if (headerCartBtn) headerCartBtn.addEventListener('click', openCartDrawer);
  if (closeCartBtn) closeCartBtn.addEventListener('click', closeCartDrawer);
  if (cartOverlay) cartOverlay.addEventListener('click', closeCartDrawer);
  if (floatingCart) floatingCart.addEventListener('click', openCartDrawer);

  let currentFilterCategory = 'all';

  function filterMenu() {
    let visibleCount = 0;

    productCards.forEach(card => {
      const cardCategory = card.getAttribute('data-category') || '';
      const matchesCategory = (currentFilterCategory === 'all') || (cardCategory === currentFilterCategory);

      if (matchesCategory) {
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (emptySearchState) {
      emptySearchState.style.display = (visibleCount === 0) ? 'block' : 'none';
    }
  }

  filterButtons.forEach(btn => {
    btn.addEventListener('click', function () {
      if (!btn.getAttribute('data-category')) return;
      filterButtons.forEach(b => {
        if (b.getAttribute('data-category')) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        }
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      currentFilterCategory = btn.getAttribute('data-category') || 'all';
      filterMenu();
    });
  });

  window.addToCart = function (name, price) {
    const existingIndex = cart.findIndex(item => item.name === name);
    if (existingIndex > -1) {
      cart[existingIndex].qty += 1;
    } else {
      cart.push({ name, price, qty: 1 });
    }

    renderCart();
    showToast(`"${name}" ditambahkan ke pesanan!`);
    // Panel keranjang TIDAK dibuka otomatis; baru terbuka saat tombol
    // "Pesanan" (header) atau "Lihat Pesanan" (bar melayang) ditekan.
  };

  function renderCart() {
    const wrapper = document.getElementById('cart-items-wrapper');
    wrapper.innerHTML = '';

    if (cart.length === 0) {
      wrapper.innerHTML = '<p id="empty-cart-msg" style="text-align:center; color:#9c857b; font-size:0.875rem; padding:1rem 0;">Keranjang belanja Anda masih kosong.</p>';
    } else {
      cart.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'cart-item-row';
        itemRow.innerHTML = `
          <div class="item-info">
            <h5>${item.name}</h5>
            <span>Rp ${item.price.toLocaleString('id-ID')}</span>
          </div>
          <div class="item-qty-controls">
            <button class="btn-qty" onclick="updateQty(${index}, -1)">-</button>
            <span style="font-weight:700; font-size:0.875rem;">${item.qty}</span>
            <button class="btn-qty" onclick="updateQty(${index}, 1)">+</button>
          </div>
        `;
        wrapper.appendChild(itemRow);
      });
    }

    recalculateCart();
  }

  window.updateQty = function (index, delta) {
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
      cart.splice(index, 1);
    }
    renderCart();
  };

  // Bar keranjang melayang & detail pesanan (data pemesan, pembayaran, ringkasan,
  // tombol konfirmasi) hanya muncul setelah ada minimal satu menu yang dipilih.
  function syncCartVisibility(hasItems) {
    if (floatingCart) {
      floatingCart.classList.toggle('is-visible', hasItems);
      floatingCart.setAttribute('aria-hidden', hasItems ? 'false' : 'true');
    }
    if (cartDrawer) {
      cartDrawer.classList.toggle('has-items', hasItems);
    }
  }

  function recalculateCart() {
    let totalItems = 0;
    let grandTotal = 0;

    cart.forEach(item => {
      totalItems += item.qty;
      grandTotal += item.price * item.qty;
    });

    document.getElementById('cart-item-count').textContent = totalItems;
    document.getElementById('header-cart-count').textContent = totalItems;
    document.getElementById('floating-badge').textContent = totalItems;
    document.getElementById('floating-count-text').textContent = `${totalItems} Pesanan`;
    document.getElementById('floating-total-text').textContent = `Total: Rp ${grandTotal.toLocaleString('id-ID')}`;

    document.getElementById('calc-grandtotal').textContent = `Rp ${grandTotal.toLocaleString('id-ID')}`;

    const confirmBtn = document.getElementById('btn-confirm-order');
    if (confirmBtn) {
      confirmBtn.textContent = `Konfirmasi Pesanan Sekarang (Rp ${grandTotal.toLocaleString('id-ID')})`;
    }

    syncCartVisibility(totalItems > 0);
  }

  const paymentInputs = document.querySelectorAll('.payment-opt input[name="payment-opt"]');
  paymentInputs.forEach(input => {
    input.addEventListener('change', function () {
      document.querySelectorAll('.payment-opt').forEach(label => label.classList.remove('active'));
      const parentLabel = input.closest('.payment-opt');
      if (parentLabel) parentLabel.classList.add('active');
    });
  });

  function getSelectedPaymentMethod() {
    const checkedInput = document.querySelector('.payment-opt input[name="payment-opt"]:checked');
    if (checkedInput) {
      const span = checkedInput.parentElement.querySelector('span');
      if (span) {
        return span.textContent.replace(/^[^\wA-Za-z]+/, '').trim();
      }
    }
    return 'QRIS';
  }

  /* ===== Dialog kustom pengganti alert()/confirm() bawaan browser ===== */
  const dialogEl = document.getElementById('meera-dialog');
  let dialogResolve = null;
  let dialogLastFocus = null;

  function closeDialog(result) {
    if (!dialogEl || dialogEl.hidden) return;
    dialogEl.hidden = true;
    document.body.style.overflow = '';

    const resolve = dialogResolve;
    dialogResolve = null;

    if (dialogLastFocus && typeof dialogLastFocus.focus === 'function') {
      dialogLastFocus.focus();
    }
    if (resolve) resolve(result);
  }

  // Pemakaian: await showDialog({ type, title, message, details, confirmText, cancelText })
  // type: 'success' | 'error' | 'warning' | 'info'. Mengembalikan Promise<boolean>
  // (true = tombol utama, false = Batal / Esc / klik latar).
  function showDialog(options) {
    const opts = Object.assign({
      type: 'info',
      title: '',
      message: '',
      details: [],
      confirmText: 'Mengerti',
      cancelText: ''
    }, options);

    if (dialogResolve) closeDialog(false);

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const iconEl = document.getElementById('meera-dialog-icon');
    const titleEl = document.getElementById('meera-dialog-title');
    const messageEl = document.getElementById('meera-dialog-message');
    const detailsEl = document.getElementById('meera-dialog-details');
    const okBtn = document.getElementById('meera-dialog-ok');
    const cancelBtn = document.getElementById('meera-dialog-cancel');

    dialogEl.dataset.type = opts.type;
    iconEl.textContent = icons[opts.type] || icons.info;
    titleEl.textContent = opts.title;
    messageEl.textContent = opts.message;
    messageEl.hidden = !opts.message;

    // textContent dipakai agar input pelanggan (mis. nama) tidak bisa menyisipkan HTML
    detailsEl.innerHTML = '';
    opts.details.forEach(function (pair) {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = pair[0];
      dd.textContent = pair[1];
      row.appendChild(dt);
      row.appendChild(dd);
      detailsEl.appendChild(row);
    });
    detailsEl.hidden = opts.details.length === 0;

    okBtn.textContent = opts.confirmText;
    cancelBtn.textContent = opts.cancelText;
    cancelBtn.hidden = !opts.cancelText;

    dialogLastFocus = document.activeElement;
    dialogEl.hidden = false;
    document.body.style.overflow = 'hidden';
    okBtn.focus();

    return new Promise(function (resolve) {
      dialogResolve = resolve;
    });
  }

  if (dialogEl) {
    document.getElementById('meera-dialog-ok').addEventListener('click', function () { closeDialog(true); });
    document.getElementById('meera-dialog-cancel').addEventListener('click', function () { closeDialog(false); });
    dialogEl.querySelector('[data-dialog-close]').addEventListener('click', function () { closeDialog(false); });

    document.addEventListener('keydown', function (e) {
      if (dialogEl.hidden) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog(false);
        return;
      }

      if (e.key === 'Tab') {
        const focusables = Array.from(dialogEl.querySelectorAll('button')).filter(function (b) { return !b.hidden; });
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  let isSubmittingOrder = false;

  window.confirmOrder = async function () {
    if (isSubmittingOrder) return;

    const nameInput = document.getElementById('order-customer-name');
    const tableInput = document.getElementById('order-table-note');
    const confirmBtn = document.getElementById('btn-confirm-order');

    const name = nameInput ? nameInput.value.trim() : '';
    const tableNote = tableInput ? tableInput.value.trim() : '-';

    if (!name) {
      await showDialog({
        type: 'warning',
        title: 'Nama pemesan belum diisi',
        message: 'Mohon isi nama pemesan terlebih dahulu agar barista tahu pesanan ini untuk siapa.',
        confirmText: 'Isi Nama'
      });
      if (nameInput) nameInput.focus();
      return;
    }
    if (cart.length === 0) {
      await showDialog({
        type: 'warning',
        title: 'Keranjang masih kosong',
        message: 'Keranjang belanja Anda masih kosong. Pilih menu favorit Anda terlebih dahulu.',
        confirmText: 'Oke'
      });
      return;
    }

    const paymentMethod = getSelectedPaymentMethod();
    const grandTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const nowIso = new Date().toISOString();

    const orderPayload = {
      customerName: name,
      tableNote: tableNote || '-',
      items: cart.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty,
        subtotal: item.price * item.qty
      })),
      totalAmount: grandTotal,
      paymentMethod: paymentMethod,
      createdAt: nowIso,
      status: 'Baru'
    };

    isSubmittingOrder = true;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.7';
      confirmBtn.textContent = 'Menyimpan Pesanan...';
    }

    try {
      const apiBase = window.MEERA_API_BASE_URL || '';
      const response = await fetch(`${apiBase}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.order) {
        throw new Error(result.error || 'Gagal menyimpan pesanan ke server. Silakan coba lagi.');
      }

      const savedOrder = result.order;

      try {
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('meera_orders_channel');
          bc.postMessage({ type: 'NEW_ORDER', order: savedOrder });
          bc.close();
        }
      } catch (_e) {
        // Ignore BroadcastChannel errors
      }

      cart = [];
      renderCart();
      closeCartDrawer();
      showToast(`Pesanan #${savedOrder.orderNumber} berhasil dikirim!`);

      // Tanpa await: tombol langsung kembali normal, dialog tampil di atasnya
      showDialog({
        type: 'success',
        title: 'Pesanan berhasil dibuat!',
        message: 'Barista Meera Coffee segera menyiapkan pesanan Anda.',
        details: [
          ['Nomor Pesanan', `#${savedOrder.orderNumber}`],
          ['Nama Pemesan', savedOrder.customerName],
          ['Catatan', savedOrder.tableNote || '-'],
          ['Metode Pembayaran', savedOrder.paymentMethod],
          ['Total Pembayaran', `Rp ${Number(savedOrder.totalAmount).toLocaleString('id-ID')}`],
          ['Status', savedOrder.status]
        ],
        confirmText: 'Selesai'
      });
    } catch (error) {
      showDialog({
        type: 'error',
        title: 'Pesanan belum dapat diproses',
        message: error.message || 'Terjadi gangguan jaringan. Keranjang Anda tetap tersimpan.',
        confirmText: 'Coba Lagi'
      });
    } finally {
      isSubmittingOrder = false;
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
      }
      recalculateCart();
    }
  };

  function showToast(msg) {
    const toast = document.getElementById('order-toast');
    const text = document.getElementById('toast-text');
    if (toast && text) {
      text.textContent = msg;
      toast.style.display = 'flex';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 2600);
    }
  }

  // Keadaan awal: keranjang kosong, jadi bar melayang & detail pesanan tersembunyi
  renderCart();
});
