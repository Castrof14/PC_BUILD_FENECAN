import { STATUS_LABEL, STATUS_SEQUENCE } from '../domain/order-status';

export function Footer() {
  return (
    <footer className="footer-band">
      <div>
        <nav className="footer-nav" aria-label="Navegação do rodapé">
          <a className="footer-nav-link" href="#pedidos">
            Pedidos
          </a>
          <a className="footer-nav-link" href="#quadro">
            Quadro
          </a>
          <a className="footer-nav-link" href="#fluxo">
            Fluxo
          </a>
        </nav>

        <p className="caption" id="fluxo">
          Fluxo: {STATUS_SEQUENCE.map((status) => STATUS_LABEL[status]).join(' &rarr; ')}
        </p>
      </div>

      <div className="footer-meta">
        <p className="caption">Pedidos do site via fenecan-backend &middot; API da O.S. local</p>
        <a className="footer-cert" href="#rodape">
          <span className="cert-seal" aria-hidden="true">
            1996
          </span>
          <span className="caption">
            Painel do operador
            <br />
            Vers&atilde;o de est&uacute;dio
          </span>
        </a>
      </div>
    </footer>
  );
}
