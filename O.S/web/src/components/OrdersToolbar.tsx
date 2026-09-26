import { FILTERS, STATUS_FILTER_LABEL } from '../domain/order-status';
import type { StatusFilter } from '../types';

interface OrdersToolbarProps {
  query: string;
  filter: StatusFilter;
  resultCount: number;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: StatusFilter) => void;
  onReset: () => void;
}

export function OrdersToolbar({
  query,
  filter,
  resultCount,
  onQueryChange,
  onFilterChange,
  onReset,
}: OrdersToolbarProps) {
  return (
    <div className="toolbar">
      <div className="search-field">
        <label className="ui-label" htmlFor="order-search">
          Buscar pedido
        </label>
        <input
          className="text-input"
          id="order-search"
          type="search"
          value={query}
          placeholder="PED-001 ou nome do cliente"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <div className="filter-group" role="group" aria-label="Filtrar por etapa">
        {FILTERS.map((item) => (
          <button
            className="filter-chip"
            type="button"
            key={item}
            aria-pressed={filter === item}
            onClick={() => onFilterChange(item)}
          >
            {STATUS_FILTER_LABEL[item]}
          </button>
        ))}
      </div>

      <p className="toolbar-count caption">
        {resultCount} de exibidos
        {(query !== '' || filter !== 'ALL') && (
          <>
            {' '}
            &middot;{' '}
            <button className="button-text-link" type="button" onClick={onReset}>
              limpar
            </button>
          </>
        )}
      </p>
    </div>
  );
}
