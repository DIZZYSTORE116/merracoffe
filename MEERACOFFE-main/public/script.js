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
    openCartDrawer();
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

  let isSubmittingOrder = false;

  window.confirmOrder = async function () {
    if (isSubmittingOrder) return;

    const nameInput = document.getElementById('order-customer-name');
    const tableInput = document.getElementById('order-table-note');
    const confirmBtn = document.getElementById('btn-confirm-order');

    const name = nameInput ? nameInput.value.trim() : '';
    const tableNote = tableInput ? tableInput.value.trim() : '-';

    if (!name) {
      alert('Mohon isi nama pemesan terlebih dahulu.');
      if (nameInput) nameInput.focus();
      return;
    }
    if (cart.length === 0) {
      alert('Keranjang belanja Anda masih kosong!');
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
      alert(
        `Pesanan berhasil dibuat!\n\n` +
        `Nomor Pesanan: #${savedOrder.orderNumber}\n` +
        `Nama Pemesan: ${savedOrder.customerName}\n` +
        `Catatan: ${savedOrder.tableNote || '-'}\n` +
        `Metode Pembayaran: ${savedOrder.paymentMethod}\n` +
        `Total Pembayaran: Rp ${Number(savedOrder.totalAmount).toLocaleString('id-ID')}\n` +
        `Status: ${savedOrder.status}\n\n` +
        `Barista Meera Coffee segera menyiapkan pesanan Anda.`
      );
    } catch (error) {
      alert(`Maaf, pesanan belum dapat diproses:\n${error.message || 'Terjadi gangguan jaringan. Keranjang Anda tetap tersimpan.'}`);
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
});