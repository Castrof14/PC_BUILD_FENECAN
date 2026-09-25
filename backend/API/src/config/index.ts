import "dotenv/config";

/** Porta do servidor; ignora valores inválidos e cai em 8080. */
function parsePort(value: string | undefined): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 8080;
}

/**
 * Origens liberadas no CORS.
 *
 * Durante o MVP, `CORS_ORIGIN` não definido significa `true` (reflete a
 * origem da requisição), o que permite o site consumir a API em
 * desenvolvimento. Basta definir `CORS_ORIGIN=https://site.fenecan.com`
 * para restringir ao domínio oficial — nenhuma outra linha muda.
 */
function parseCorsOrigin(value: string | undefined): true | string[] {
  if (!value || value === "*" || value === "true") {
    return true;
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const config = {
  port: parsePort(process.env.PORT),
  host: process.env.HOST || "0.0.0.0",
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  isProduction: process.env.NODE_ENV === "production",
};
