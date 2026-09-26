interface EmptyStateProps {
  isFiltered: boolean;
  onReset: () => void;
}

export function EmptyState({ isFiltered, onReset }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-mark" aria-hidden="true">
        404
      </p>
      <h3 className="heading-3">
        {isFiltered ? 'Nenhum pedido corresponde ao filtro' : 'Nenhum pedido na fila'}
      </h3>
      <p className="caption">
        {isFiltered
          ? 'Ajuste a busca ou selecione outra etapa do quadro.'
          : 'Quando um novo pedido chegar, ele aparece aqui.'}
      </p>
      {isFiltered && (
        <button className="button-secondary" type="button" onClick={onReset}>
          Mostrar todos
        </button>
      )}
    </div>
  );
}
