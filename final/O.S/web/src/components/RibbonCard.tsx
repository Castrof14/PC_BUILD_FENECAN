import { Sticker } from './Sticker';
import { canCancel, primaryActionFor, STATUS_LABEL } from '../domain/order-status';
import type { Order } from '../types';

interface RibbonCardProps {
  order: Order;
  isNew: boolean;
  onAdvance: (id: string) => void;
  onCancel: (id: string) => void;
}

const SPEC_FIELDS: { key: keyof Order['components']; label: string }[] = [
  { key: 'cpu', label: 'Processador' },
  { key: 'motherboard', label: 'Placa-mãe' },
  { key: 'gpu', label: 'Placa de vídeo' },
  { key: 'ram', label: 'Memória' },
  { key: 'storage', label: 'Armazenamento' },
  { key: 'psu', label: 'Fonte' },
  { key: 'case', label: 'Gabinete' },
];

/** A O.S. manda ISO em UTC; mostra no fuso local do operador. */
function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16);
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function RibbonCard({ order, isNew, onAdvance, onCancel }: RibbonCardProps) {
  const action = primaryActionFor(order.status);

  return (
    <article className="ribbon-card" aria-labelledby={`title-${order.id}`}>
      {isNew && (
        <div className="ribbon-card-sticker">
          <Sticker variant="burst">Novo!</Sticker>
        </div>
      )}

      <div className="ribbon-title">
        <h3 id={`title-${order.id}`}>
          {order.id} &middot; {order.customer}
        </h3>
        <p className="ribbon-meta">Recebido &agrave;s {formatTime(order.requestedAt)}</p>
      </div>

      <div className="ribbon-body">
        <dl className="spec-list">
          {SPEC_FIELDS.map((field) => (
            <div className="spec" key={field.key}>
              <dt>{field.label}</dt>
              <dd>{order.components[field.key]}</dd>
            </div>
          ))}
        </dl>

        <p className="ribbon-status" data-status={order.status}>
          {STATUS_LABEL[order.status]}
        </p>
      </div>

      <div className="ribbon-foot">
        <p className="ribbon-foot-note">
          {action === null
            ? 'Pedido encerrado. Nenhuma ação disponível.'
            : `Próximo passo: ${STATUS_LABEL[action.to]}.`}
        </p>

        <div className="ribbon-actions">
          {canCancel(order.status) && (
            <button className="button-secondary" type="button" onClick={() => onCancel(order.id)}>
              Cancelar
            </button>
          )}
          {action !== null && (
            <button className="button-primary" type="button" onClick={() => onAdvance(order.id)}>
              {action.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
