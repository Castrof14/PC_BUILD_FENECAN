import { RibbonCard } from './RibbonCard';
import type { Order } from '../types';

interface OrderListProps {
  orders: Order[];
  newIds: ReadonlySet<string>;
  onAdvance: (id: string) => void;
  onCancel: (id: string) => void;
}

export function OrderList({ orders, newIds, onAdvance, onCancel }: OrderListProps) {
  return (
    <ul className="ribbon-list">
      {orders.map((order) => (
        <li key={order.id}>
          <RibbonCard
            order={order}
            isNew={newIds.has(order.id)}
            onAdvance={onAdvance}
            onCancel={onCancel}
          />
        </li>
      ))}
    </ul>
  );
}
