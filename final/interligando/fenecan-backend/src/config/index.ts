import "dotenv/config";

/** Porta do servidor; ignora valores inválidos e cai em 3000. */
function parsePort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

/** Booleanos de .env: "true"/"1"/"sim" ligam, o resto desliga. */
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["true", "1", "yes", "sim"].includes(value.trim().toLowerCase());
}

/**
 * Origens liberadas no CORS.
 *
 * Durante o MVP, `CORS_ORIGIN` não definido significa `true` (reflete a
 * origem da requisição), o que permite o app mobile consumir a API em
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

/**
 * Conexão com o MySQL.
 *
 * `DATABASE_URL` tem prioridade (formato mysql://usuario:senha@host:porta/banco).
 * Se não existir, as variáveis DB_* do módulo de fila original são usadas
 * para montar a URL — assim o .env antigo continua funcionando.
 */
function parseDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    return url;
  }

  const user = process.env.DB_USER?.trim() || "root";
  const password = process.env.DB_PASSWORD ?? "";
  const host = process.env.DB_HOST?.trim() || "127.0.0.1";
  const port = parsePort(process.env.DB_PORT, 3306);
  const database = process.env.DB_NAME?.trim() || "montagens_db";

  const credentials = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);

  return `mysql://${credentials}@${host}:${port}/${database}`;
}

/** Onde as builds ficam guardadas: "mysql" (produção) ou "memory" (sem banco). */
function parseStorage(value: string | undefined): "mysql" | "memory" {
  const raw = value?.trim().toLowerCase();
  return raw === "memory" || raw === "memoria" ? "memory" : "mysql";
}

export const config = {
  port: parsePort(process.env.PORT, 3000),
  host: process.env.HOST || "0.0.0.0",
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  isProduction: process.env.NODE_ENV === "production",
  logLevel: process.env.LOG_LEVEL || "info",

  /** Conexão MySQL usada pelo pool (módulo de banco de dados). */
  databaseUrl: parseDatabaseUrl(),
  /**
   * Repositório de builds. "mysql" é o padrão; "memory" dispense banco e
   * serve para desenvolvimento e demonstração (os dados somem ao encerrar).
   */
  storage: parseStorage(process.env.BUILD_STORAGE),
  /** Nome do banco, usado para criar o schema de testes. */
  databaseName: process.env.DB_NAME?.trim() || "montagens_db",
  /** Aplica `database/schema.sql` ao subir (garante a tabela no primeiro boot). */
  autoMigrate: parseBoolean(process.env.AUTO_MIGRATE, true),

  /** Caminho do WebSocket da Unity. */
  wsPath: process.env.WS_PATH || "/ws",

  /** Caminho do WebSocket da O.S. (sistema do operador). */
  osWsPath: process.env.OS_WS_PATH || "/ws/os",
};
