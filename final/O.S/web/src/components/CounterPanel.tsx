import type { StatusCounts } from '../domain/selectors';
import { STATUS_LABEL } from '../domain/order-status';
import type { OrderStatus } from '../types';

interface CounterPanelProps {
  counts: StatusCounts;
}

const TONES: Record<OrderStatus, string> = {
  PENDING: 'peach',
  ACCEPTED: 'sky',
  BUILDING: 'periwinkle',
  COMPLETED: 'lime',
  CANCELLED: 'steel',
};

const TRACKED: OrderStatus[] = ['PENDING', 'ACCEPTED', 'BUILDING', 'COMPLETED'];

export function CounterPanel({ counts }: CounterPanelProps) {
  return (
    <section aria-labelledby="counters-title">
      <h2 className="heading-3" id="counters-title">
        Quadro de montagem
      </h2>

      <ul className="counter-grid">
        {TRACKED.map((status) => (
          <li className="counter-cell" data-tone={TONES[status]} key={status}>
            <p className="counter-value">{counts[status]}</p>
            <p className="counter-label">{STATUS_LABEL[status]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
