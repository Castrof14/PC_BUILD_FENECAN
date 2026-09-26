import {
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  STATUS_LABELS,
  type ComponentKey,
  type OrderStatus,
} from '../../types/order.js';
import type { OperatorState, OrderListItem } from '../../types/api.js';
import { formatAge, formatClock, formatDateTime, prettifyComponentValue } from '../../utils/format.js';

type Filter = 'ALL' | 'NEW' | OrderStatus;

interface ViewState {
  data: OperatorState | null;
  filter: Filter;
  selectedId: string | null;
  signature: string;
  soundOn: boolean;
  soundTouched: boolean;
  pendingConfirm: string | null;
  busy: Set<string>;
  lastSeenNewIds: Set<string>;
}

const UI_POLL_MS = 1000;
const ORDER_FLOW: OrderStatus[] = ['PENDING', 'ACCEPTED', 'BUILDING', 'COMPLETED'];

const view: ViewState = {
  data: null,
  filter: 'ALL',
  selectedId: null,
  signature: '',
  soundOn: true,
  soundTouched: false,
  pendingConfirm: null,
  busy: new Set<string>(),
  lastSeenNewIds: new Set<string>(),
};

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Elemento #${id} nao encontrado no HTML.`);
  }
  return element as T;
}

const els = {
  apiUrl: must<HTMLElement>('api-url'),
  statTotal: must<HTMLElement>('stat-total'),
  statNew: must<HTMLElement>('stat-new'),
  statPending: must<HTMLElement>('stat-pending'),
  statBuilding: must<HTMLElement>('stat-building'),
  statNewBox: must<HTMLElement>('stat-new').parentElement as HTMLElement,
  connection: must<HTMLElement>('connection'),
  connectionText: must<HTMLElement>('connection-text'),
  clock: must<HTMLElement>('clock'),
  offlineBanner: must<HTMLElement>('offline-banner'),
  offlineDetail: must<HTMLElement>('offline-detail'),
  filters: must<HTMLElement>('filters'),
  orderList: must<HTMLElement>('order-list'),
  lastUpdate: must<HTMLElement>('last-update'),
  clearNew: must<HTMLButtonElement>('clear-new'),
  detail: must<HTMLElement>('detail'),
  statusMessage: must<HTMLElement>('status-message'),
  toasts: must<HTMLElement>('toasts'),
  soundToggle: must<HTMLButtonElement>('sound-toggle'),
  fullscreen: must<HTMLButtonElement>('fullscreen'),
  refresh: must<HTMLButtonElement>('refresh'),
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSummary(order: OrderListItem): string {
  const gpu = prettifyComponentValue(order.components.gpu);
  const cpu = prettifyComponentValue(order.components.cpu);
  const ram = prettifyComponentValue(order.components.ram);
  const parts = [cpu, gpu, ram].filter((part) => part !== '');
  return parts.length > 0 ? parts.join(' | ') : 'sem componentes informados';
}

function statusPill(status: OrderStatus): string {
  return `<span class="pill pill-${status}">${esc(STATUS_LABELS[status])}</span>`;
}

function toast(message: string, kind: 'info' | 'error' | 'success' | 'warn' = 'info'): void {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  els.toasts.append(node);
  window.setTimeout(() => node.remove(), 5200);
}

function setStatus(message: string): void {
  els.statusMessage.textContent = message;
}

let audioContext: AudioContext | null = null;

function playNewOrderSound(): void {
  if (!view.soundOn) {
    return;
  }
  try {
    audioContext = audioContext ?? new AudioContext();
    void audioContext.resume();
    const start = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    for (const [index, frequency] of [880, 1320].entries()) {
      const osc = audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(start + index * 0.14);
      osc.stop(start + 0.5);
    }
  } catch {
    view.soundOn = false;
    els.soundToggle.textContent = 'Som: OFF';
  }
}

function visibleOrders(): OrderListItem[] {
  const orders = view.data?.orders ?? [];
  switch (view.filter) {
    case 'ALL':
      return orders;
    case 'NEW':
      return orders.filter((order) => order.isNew);
    default:
      return orders.filter((order) => order.status === view.filter);
  }
}

function renderHeader(): void {
  const data = view.data;
  if (data === null) {
    return;
  }
  els.apiUrl.textContent = `API: ${data.apiBaseUrl}`;
  els.statTotal.textContent = String(data.orders.length);
  els.statNew.textContent = String(data.newOrderIds.length);
  els.statPending.textContent = String(data.orders.filter((o) => o.status === 'PENDING').length);
  els.statBuilding.textContent = String(data.orders.filter((o) => o.status === 'BUILDING').length);
  els.statNewBox.classList.toggle('has-value', data.newOrderIds.length > 0);

  const { state } = data.connection;
  els.connection.className = `connection ${state}`;
  els.connectionText.textContent =
    state === 'connected'
      ? 'API CONECTADA'
      : state === 'disconnected'
        ? `API DESCONECTADA (${data.connection.consecutiveFailures})`
        : 'VERIFICANDO...';

  const offline = state !== 'connected';
  els.offlineBanner.classList.toggle('hidden', !offline);
  if (offline) {
    els.offlineDetail.textContent =
      data.connection.lastError ?? `Tentando ${data.apiBaseUrl} a cada ${data.pollIntervalMs / 1000}s...`;
  }

  els.clearNew.hidden = data.newOrderIds.length === 0;
  els.lastUpdate.textContent =
    data.lastUpdatedAt === null
      ? 'Aguardando primeira resposta da API'
      : `Atualizado ${formatAge(data.lastUpdatedAt)} atras | a cada ${data.pollIntervalMs / 1000}s`;
}

function renderList(): void {
  const orders = visibleOrders();
  if (orders.length === 0) {
    const message =
      view.data === null
        ? 'Conectando na API...'
        : view.data.connection.state === 'connected'
          ? 'Nenhum pedido nesta categoria'
          : 'Sem conexao com a API';
    els.orderList.innerHTML = `<div class="empty"><div class="empty-icon">[]</div><p>${esc(message)}</p></div>`;
    return;
  }
  els.orderList.innerHTML = orders
    .map((order, index) => {
      const classes = ['order-card'];
      if (order.id === view.selectedId) {
        classes.push('selected');
      }
      if (order.isNew) {
        classes.push('is-new');
      }
      return `
      <button class="${classes.join(' ')}" type="button" data-select="${esc(order.id)}">
        <span class="order-card-head">
          <span class="order-id">${esc(order.id)}</span>
          ${order.isNew ? '<span class="badge-new">NOVO</span>' : ''}
          ${index < 9 ? `<span class="stat-label">tecla ${index + 1}</span>` : ''}
        </span>
        <span class="order-card-meta">${statusPill(order.status)}<span>${esc(formatAge(order.createdAt) || 'sem data')}</span></span>
        <span class="order-card-build">${esc(buildSummary(order))}</span>
      </button>`;
    })
    .join('');
}

function allowedTransitions(status: OrderStatus): OrderStatus[] {
  switch (status) {
    case 'PENDING':
      return ['ACCEPTED', 'CANCELLED'];
    case 'ACCEPTED':
      return ['BUILDING', 'CANCELLED'];
    case 'BUILDING':
      return ['COMPLETED', 'CANCELLED'];
    default:
      return [];
  }
}

function actionButton(order: OrderListItem, action: OrderStatus): string {
  const allowed = allowedTransitions(order.status).includes(action);
  const labels: Record<OrderStatus, string> = {
    PENDING: 'Aceitar',
    ACCEPTED: 'Iniciar montagem',
    BUILDING: 'Concluir',
    COMPLETED: 'Concluido',
    CANCELLED: 'Cancelar',
  };
  const keys: Record<OrderStatus, string> = {
    PENDING: '',
    ACCEPTED: 'A',
    BUILDING: 'M',
    COMPLETED: 'C',
    CANCELLED: 'X',
  };
  const confirming = action === 'CANCELLED' && view.pendingConfirm === order.id;
  const disabled = !allowed || view.busy.has(order.id) ? 'disabled' : '';
  const reason = allowed ? '' : ` title="Indisponivel a partir de ${STATUS_LABELS[order.status]}"`;
  const keyHint = keys[action] === '' ? '' : `<kbd>${keys[action]}</kbd>`;
  const label = confirming ? 'Confirmar cancelamento?' : labels[action];
  return `<button class="action action-${action.toLowerCase()}${confirming ? ' confirming' : ''}" type="button" data-action="${action}" data-id="${esc(order.id)}" ${disabled}${reason}>${esc(label)}${keyHint}</button>`;
}

function renderDetail(): void {
  const order = (view.data?.orders ?? []).find((item) => item.id === view.selectedId) ?? null;
  if (order === null) {
    els.detail.innerHTML = `
      <div class="empty">
        <div class="empty-icon">[ ]</div>
        <h2>Nenhum pedido selecionado</h2>
        <p>Selecione um pedido na lista ao lado para ver os componentes e alterar o status.</p>
      </div>`;
    return;
  }

  const components = COMPONENT_KEYS.map((key: ComponentKey) => {
    const value = prettifyComponentValue(order.components[key]);
    const shown = value === '' ? 'nao informado' : value;
    const emptyClass = value === '' ? ' empty-value' : '';
    return `
      <div class="component">
        <div class="component-label">${esc(COMPONENT_LABELS[key])}</div>
        <div class="component-value${emptyClass}">${esc(shown)}</div>
      </div>`;
  }).join('');

  const flowIndex = ORDER_FLOW.indexOf(order.status);
  const flow =
    order.status === 'CANCELLED'
      ? '<span class="flow-step cancelled-step">CANCELADO</span>'
      : ORDER_FLOW.map(
          (step, index) =>
            `<span class="flow-step ${index < flowIndex ? 'done' : index === flowIndex ? 'current' : ''}">${esc(STATUS_LABELS[step])}</span>${index < ORDER_FLOW.length - 1 ? '<span class="flow-arrow">&rarr;</span>' : ''}`,
        ).join('');

  const customer = order.customerName === undefined ? '' : ` | ${esc(order.customerName)}`;
  const created = formatDateTime(order.createdAt);

  els.detail.innerHTML = `
    <div class="detail-head">
      <span class="detail-id">${esc(order.id)}</span>
      ${statusPill(order.status)}
      ${order.isNew ? '<span class="badge-new">NOVO PEDIDO</span>' : ''}
    </div>
    <div class="detail-sub">${esc(created === '' ? 'Sem data de criacao' : `Recebido em ${created}`)}${customer}</div>
    <div class="components">${components}</div>
    <div class="actions">
      ${actionButton(order, 'ACCEPTED')}
      ${actionButton(order, 'BUILDING')}
      ${actionButton(order, 'COMPLETED')}
      ${actionButton(order, 'CANCELLED')}
    </div>
    <div class="flow">${flow}<span class="flow-arrow">|</span><span>${esc(view.data?.apiBaseUrl ?? '')}</span></div>`;
}

function render(force = false): void {
  const data = view.data;
  if (data === null) {
    return;
  }
  const signature = JSON.stringify([
    data.orders,
    data.newOrderIds,
    data.connection,
    data.lastUpdatedAt,
    view.filter,
    view.selectedId,
    view.pendingConfirm,
    [...view.busy],
  ]);
  if (!force && signature === view.signature) {
    return;
  }
  view.signature = signature;
  renderHeader();
  renderList();
  renderDetail();
}

function selectOrder(id: string | null): void {
  view.selectedId = id;
  view.pendingConfirm = null;
  render(true);
  if (id !== null) {
    const card = els.orderList.querySelector(`[data-select="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function selectedOrder(): OrderListItem | null {
  return (view.data?.orders ?? []).find((order) => order.id === view.selectedId) ?? null;
}

async function sendStatus(orderId: string, status: OrderStatus): Promise<void> {
  view.busy.add(orderId);
  render(true);
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      toast(payload.error ?? `Falha ao alterar o pedido ${orderId}.`, 'error');
      setStatus('Falha na alteracao de status');
      return;
    }
    toast(`${orderId}: ${STATUS_LABELS[status]}`, 'success');
    setStatus(`${orderId} -> ${STATUS_LABELS[status]}`);
  } catch {
    toast('Sem conexao com o sistema operador.', 'error');
    setStatus('Falha de rede local');
  } finally {
    view.busy.delete(orderId);
    view.pendingConfirm = null;
    await refresh();
  }
}

function requestAction(status: OrderStatus): void {
  const order = selectedOrder();
  if (order === null) {
    setStatus('Selecione um pedido primeiro');
    return;
  }
  if (!allowedTransitions(order.status).includes(status)) {
    toast(`${order.id} nao aceita a mudanca para ${STATUS_LABELS[status]}.`, 'warn');
    return;
  }
  if (status === 'CANCELLED' && view.pendingConfirm !== order.id) {
    view.pendingConfirm = order.id;
    render(true);
    setStatus('Confirme o cancelamento para aplicar');
    return;
  }
  void sendStatus(order.id, status);
}

async function refresh(): Promise<void> {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    const data = (await response.json()) as OperatorState;
    applyState(data);
  } catch {
    setStatus('Sistema operador nao respondeu');
  }
}

function applyState(data: OperatorState): void {
  const previousIds = new Set(view.data?.orders.map((order) => order.id) ?? []);
  const arrived = data.orders.filter((order) => !previousIds.has(order.id) && order.isNew);
  view.data = data;

  if (!view.soundTouched) {
    view.soundOn = data.soundEnabled;
    els.soundToggle.textContent = `Som: ${view.soundOn ? 'ON' : 'OFF'}`;
  }

  const stillThere = data.orders.some((order) => order.id === view.selectedId);
  if (!stillThere) {
    view.selectedId = null;
  }
  if (arrived.length > 0) {
    const first = arrived[0];
    if (first !== undefined) {
      view.selectedId = first.id;
      toast(`Novo pedido: ${first.id}`, 'warn');
      playNewOrderSound();
    }
  }
  if (view.selectedId === null) {
    const firstVisible = data.orders[0];
    view.selectedId = firstVisible === undefined ? null : firstVisible.id;
  }
  view.lastSeenNewIds = new Set(data.newOrderIds);
  render();
}

function tick(): void {
  const now = new Date();
  els.clock.textContent = formatClock(now);
  if (view.data !== null) {
    const data = view.data;
    const text =
      data.lastUpdatedAt === null
        ? 'Aguardando primeira resposta da API'
        : `Atualizado ${formatAge(data.lastUpdatedAt, now.getTime())} atras | a cada ${data.pollIntervalMs / 1000}s`;
    els.lastUpdate.textContent = text;
    if (data.connection.state === 'connected') {
      const age = formatAge(data.lastUpdatedAt, now.getTime());
      els.connectionText.textContent = data.lastUpdatedAt === null ? 'API CONECTADA' : `API CONECTADA ${age}`;
    }
  }
}

function nextNew(): void {
  const newIds = view.data?.newOrderIds ?? [];
  const currentIndex = newIds.indexOf(view.selectedId ?? '');
  const next = newIds[(currentIndex + 1) % newIds.length];
  if (next !== undefined) {
    selectOrder(next);
    setStatus(`Novo pedido ${next}`);
  } else {
    setStatus('Nenhum pedido novo');
  }
}

function bindEvents(): void {
  els.filters.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const filter = target.dataset['filter'];
    if (filter === undefined) {
      return;
    }
    view.filter = filter as Filter;
    for (const chip of els.filters.querySelectorAll('.chip')) {
      chip.classList.toggle('active', chip === target);
    }
    render(true);
  });

  els.orderList.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-select]');
    const id = target?.dataset['select'];
    if (id !== undefined) {
      selectOrder(id);
    }
  });

  els.detail.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    const action = target?.dataset['action'];
    const id = target?.dataset['id'];
    if (action === undefined || id === undefined) {
      return;
    }
    requestAction(action as OrderStatus);
  });

  els.refresh.addEventListener('click', () => {
    void fetch('/api/refresh', { method: 'POST' });
    setStatus('Atualizacao solicitada');
  });

  els.clearNew.addEventListener('click', () => {
    void fetch('/api/clear-new', { method: 'POST' }).then(() => refresh());
    setStatus('Avisos limpos');
  });

  els.soundToggle.addEventListener('click', () => {
    view.soundOn = !view.soundOn;
  view.soundTouched = true;
    view.soundTouched = true;
    els.soundToggle.textContent = `Som: ${view.soundOn ? 'ON' : 'OFF'}`;
    if (view.soundOn) {
      playNewOrderSound();
    }
  });

  els.fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement === null) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'a') {
      requestAction('ACCEPTED');
    } else if (key === 'm') {
      requestAction('BUILDING');
    } else if (key === 'c') {
      requestAction('COMPLETED');
    } else if (key === 'x') {
      requestAction('CANCELLED');
    } else if (key === 'r') {
      els.refresh.click();
    } else if (key === 'n') {
      nextNew();
    } else if (/^[1-9]$/.test(key)) {
      const order = visibleOrders()[Number(key) - 1];
      if (order !== undefined) {
        selectOrder(order.id);
      }
    } else {
      return;
    }
    event.preventDefault();
  });
}

async function loop(): Promise<void> {
  await refresh();
  window.setTimeout(() => void loop(), UI_POLL_MS);
}

function boot(): void {
  bindEvents();
  setStatus('Iniciando...');
  window.setInterval(tick, 1000);
  tick();
  void loop();
}

boot();
