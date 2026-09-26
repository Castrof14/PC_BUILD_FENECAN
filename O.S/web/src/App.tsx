import { useMemo, useState } from 'react';
import { CounterPanel } from './components/CounterPanel';
import { CtaBlock } from './components/CtaBlock';
import { EmptyState } from './components/EmptyState';
import { Footer } from './components/Footer';
import { OrderList } from './components/OrderList';
import { OrdersToolbar } from './components/OrdersToolbar';
import { PageFrame } from './components/PageFrame';
import { TopBanner } from './components/TopBanner';
import { useOrders } from './domain/useOrders';

const NEW_IDS = ['PED-001', 'PED-002'] as const;

export function App() {
  const orders = useOrders();
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set(NEW_IDS));

  const pending = useMemo(
    () => orders.orders.filter((order) => order.status === 'PENDING'),
    [orders.orders],
  );

  function clearNew(id: string): void {
    setTouched((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function handleAdvance(id: string): void {
    orders.advance(id);
    clearNew(id);
  }

  function handleCancel(id: string): void {
    orders.cancel(id);
    clearNew(id);
  }

  function handleReset(): void {
    orders.reset();
  }

  const lastSync = useMemo(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }, []);

  return (
    <PageFrame>
      <TopBanner totalOrders={orders.orders.length} lastSync={lastSync} />

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
              {orders.visible.length} de {orders.orders.length} &middot; mocked local
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
              newIds={touched}
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
