import type { Order } from '../types';

interface CtaBlockProps {
  pending: Order[];
  onSelect: (id: string) => void;
}

/**
 * cta-block-red — o único bloco vermelho da página, o ponto de atenção
 * singular. No site de 1996 era a proposta de compra; aqui é a fila de
 * trabalho que ainda não foi aceita pelo operador.
 */
export function CtaBlock({ pending, onSelect }: CtaBlockProps) {
  return (
    <section className="cta-block" aria-labelledby="cta-title">
      <h2 id="cta-title">Fila de montagem</h2>

      <p className="cta-block-body">
        {pending.length === 0
          ? 'Nenhum pedido aguardando aceite no momento.'
          : `${pending.length} pedido${pending.length > 1 ? 's' : ''} aguardando aceite.`}
      </p>

      {pending.length > 0 && (
        <ul className="cta-list">
          {pending.map((order) => (
            <li key={order.id}>
              <button
                className="button-secondary"
                type="button"
                onClick={() => onSelect(order.id)}
              >
                {order.id} &middot; {order.customer}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
