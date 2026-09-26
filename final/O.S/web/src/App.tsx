import { useMemo } from 'react';
import { CounterPanel } from './components/CounterPanel';
import { CtaBlock } from './components/CtaBlock';
import { EmptyState } from './components/EmptyState';
import { Footer } from './components/Footer';
import { OrderList } from './components/OrderList';
import { OrdersToolbar } from './components/OrdersToolbar';
import { PageFrame } from './components/PageFrame';
import { TopBanner } from './components/TopBanner';
import { useOrders } from './domain/useOrders';

export function App() {
  const orders = useOrders();

  const pending = useMemo(
    () => orders.orders.filter((order) => order.status === 'PENDING'),
    [orders.orders],
  );

  function handleAdvance(id: string): void {
    orders.advance(id);
  }

  function handleCancel(id: string): void {
    orders.cancel(id);
  }

  function handleReset(): void {
    orders.reset();
  }

  return (
    <PageFrame>
      <TopBanner totalOrders={orders.orders.length} lastSync={orders.lastSync} />

      <main className="content">
        <aside className="rail">
          <div id="quadro">
            <CounterPanel counts={orders.counts} />
          </div>
          <CtaBlock pending={pending} onSelect={handleAdvance} />
        </aside>

        <section className="main-column" id="pedidos" aria-labelledby="orders-title">
          <div className="eyebrow eyebrow-sky">
            <h2 className="display" id="orders-title">
              Pedidos
            </h2>
            <p className="caption">
              {orders.visible.length} de {orders.orders.length} &middot; ao vivo
            </p>
          </div>

          <OrdersToolbar
            query={orders.query}
            filter={orders.filter}
            resultCount={orders.visible.length}
            onQueryChange={orders.setQuery}
            onFilterChange={orders.setFilter}
            onReset={handleReset}
          />

          {orders.lastError !== null && (
            <p className="caption" role="alert">
              {orders.lastError}
            </p>
          )}

          {orders.visible.length === 0 ? (
            <EmptyState
              isFiltered={orders.query !== '' || orders.filter !== 'ALL'}
              onReset={handleReset}
            />
          ) : (
            <OrderList
              orders={orders.visible}
              newIds={orders.newIds}
              onAdvance={handleAdvance}
              onCancel={handleCancel}
            />
          )}
        </section>
      </main>

      <Footer />
    </PageFrame>
  );
}
