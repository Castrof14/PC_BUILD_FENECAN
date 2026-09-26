import { OrdersApi } from './api/orders-api.js';
import { ConfigError, getConfig, type AppConfig } from './config.js';
import { connectBridge, createSimulatorBridge } from './integration/index.js';
import { OrderService } from './services/order-service.js';
import { Poller } from './services/poller.js';
import { OperatorUiServer } from './ui/server.js';

const WIDTH = 68;

function line(char = '-'): string {
  return char.repeat(WIDTH);
}

function row(label: string, value: string): string {
  return `  ${label.padEnd(20)}${value}`;
}

function describeConnection(state: string, failures: number): string {
  if (state === 'connected') {
    return 'API CONECTADA';
  }
  if (state === 'disconnected') {
    return `API DESCONECTADA (${failures} falha${failures === 1 ? '' : 's'})`;
  }
  return 'AGUARDANDO API...';
}

function describeBrowser(config: AppConfig): string {
  if (!config.autoOpenBrowser) {
    return 'nao abrir automaticamente';
  }
  return config.kioskMode ? 'abrindo em tela cheia' : 'abrindo em modo aplicativo';
}

async function main(): Promise<void> {
  const config = getConfig();
  let lastConnection: string | null = null;

  const api = new OrdersApi({ baseUrl: config.apiBaseUrl, timeoutMs: config.requestTimeoutMs });
  const orderService = new OrderService(api);

  const poller = new Poller({
    intervalMs: config.pollIntervalMs,
    run: async (signal) => {
      await orderService.listOrders(signal);
    },
  });

  const bridge = createSimulatorBridge();
  const disconnectBridge = connectBridge(bridge, orderService.events);

  orderService.connection.onChange((status) => {
    const changed = lastConnection !== status.state;
    lastConnection = status.state;
    if (changed || status.state === 'disconnected') {
      const detail = status.lastError === null ? '' : ` - ${status.lastError}`;
      console.log(
        `${new Date().toLocaleTimeString('pt-BR')}  ${describeConnection(status.state, status.consecutiveFailures)}${detail}`,
      );
    }
  });

  const ui = new OperatorUiServer({
    port: config.operatorPort,
    autoOpenBrowser: config.autoOpenBrowser,
    kioskMode: config.kioskMode,
    orderService,
    poller,
    pollIntervalMs: config.pollIntervalMs,
    soundEnabled: config.newOrderSound,
  });

  const uiUrl = await ui.start();
  poller.start();

  console.log('');
  console.log(line('='));
  console.log('  PC BUILD SIMULATOR - SISTEMA OPERADOR');
  console.log(line('='));
  console.log('');
  console.log(row('API', config.apiBaseUrl));
  console.log(row('Endpoints', 'GET /orders | GET /orders/:id | PATCH /orders/:id/status'));
  console.log(
    row('Atualizacao', `a cada ${config.pollIntervalMs} ms (${config.pollIntervalMs / 1000}s)`),
  );
  console.log(row('Interface', uiUrl));
  console.log(row('Navegador', describeBrowser(config)));
  console.log(row('Som novo pedido', config.newOrderSound ? 'ligado' : 'desligado'));
  console.log(
    row('Ponte simulador', `${bridge.name} (${bridge.isAvailable() ? 'disponivel' : 'aguardando mod'})`),
  );
  console.log('');
  console.log(`  ${line('.')}`);
  console.log('  Ctrl+C encerra o sistema operador.');
  console.log('');

  const shutdown = async (): Promise<void> => {
    console.log('');
    console.log('  Encerrando o sistema operador...');
    poller.stop();
    disconnectBridge();
    bridge.dispose();
    await ui.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error('');
  console.error('  NAO FOI POSSIVEL INICIAR O SISTEMA OPERADOR');
  console.error('');
  if (error instanceof ConfigError) {
    console.error(`  ${error.message}`);
    console.error('  Copie .env.example para .env e ajuste os valores.');
  } else {
    console.error(error);
  }
  console.error('');
  process.exit(1);
});
