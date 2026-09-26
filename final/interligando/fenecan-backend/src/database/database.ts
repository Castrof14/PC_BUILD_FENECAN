import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../config/index.js";

/**
 * Conexão com o MySQL (pool) e criação do schema.
 *
 * Pool e migração automática vinham do módulo de fila original
 * (`FILA/src/db.js` + `FILA/database/schema.sql`); a diferença é que
 * a senha deixou de ter valor padrão no código — agora vem do .env.
 */
export const pool: mysql.Pool = mysql.createPool({
  uri: config.databaseUrl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4_unicode_ci",
  // grava/ lê DATETIME em UTC, para as datas da API saírem em ISO-8601
  timezone: "Z",
});

/**
 * Fixa o fuso da sessão em UTC.
 *
 * Sem isso, `CURRENT_TIMESTAMP` (usado em `updated_at ON UPDATE`) devolveria
 * a hora local do servidor MySQL enquanto o código grava `UTC_TIMESTAMP()`:
 * as duas datas da mesma build ficariam com fusos diferentes. O mysql2
 * enfileira as queries da conexão, então o SET entra antes de qualquer uso.
 */
pool.on("connection", (connection) => {
  void connection.query("SET time_zone = '+00:00'");
});

/**
 * Confirma que o banco está de pé. Usado no boot e no `GET /queue`,
 * para o erro de conexão chegar como 503 em vez de 500 genérico.
 */
export async function testConnection(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

/** Fecha o pool no encerramento do servidor. */
export async function closeDatabase(): Promise<void> {
  await pool.end();
}

/**
 * O erro veio do MySQL (ou da rede até ele) e não da regra de negócio?
 *
 * Serve para a API responder `503 DATABASE_UNAVAILABLE` em vez de
 * `500 INTERNAL_SERVER_ERROR` quando o banco está fora do ar — a API está
 * no ar, só sem dados para entregar.
 */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, errno, message } = error as { code?: string; errno?: number; message?: string };

  // mysql2: credencial/banco recusado, conexão perdida, Execução em
  // connection pool (muitas conexões abertas).
  if (
    code === "ER_ACCESS_DENIED_ERROR" ||
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "PROTOCOL_SEQUENCE_TIMEOUT" ||
    code === "ER_CON_COUNT_ERROR" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    errno === 1045
  ) {
    return true;
  }

  // Alguns erros do driver chegam só com mensagem.
  return typeof message === "string" && /getaddrinfo|ECONNREFUSED|Pool is closed/.test(message);
}

/**
 * Aplica `database/schema.sql`.
 *
 * O arquivo só usa DDL idempotente (`CREATE TABLE IF NOT EXISTS`), então
 * rodar a cada boot é seguro. Comentários de linha são removidos e as
 * instruções separadas por `;` — o schema não usa `;` dentro de strings.
 */
export async function applySchema(): Promise<void> {
  const schemaPath = fileURLToPath(
    new URL("../../database/schema.sql", import.meta.url),
  );
  const schema = await readFile(schemaPath, "utf8");

  const statements = schema
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await pool.query(statement);
  }
}
