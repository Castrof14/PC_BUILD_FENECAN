interface TopBannerProps {
  totalOrders: number;
  lastSync: string;
}

export function TopBanner({ totalOrders, lastSync }: TopBannerProps) {
  return (
    <header className="top-banner on-dark">
      <div className="banner-title">
        <h1>PC BUILD SIMULATOR</h1>
        <p>PAINEL DE MONTAGENS &middot; OPERADOR</p>
      </div>

      <div className="banner-right">
        <span className="sticker">AO VIVO</span>
        <span className="phone-callout">
          {totalOrders} PEDIDOS NO PAINEL &middot; {lastSync}
        </span>
      </div>
    </header>
  );
}
