import type { ErrorCode, ErrorResponse, ValidationDetail } from "./types/build.js";

/**
 * Erros de domínio.
 *
 * As rotas do módulo de API já respondiam 400/404 na mão, então continuam
 * assim. Estes tipos existem para os serviços (fila, banco) sinalizarem
 * conflito e indisponibilidade sem saber de HTTP: o handler global de
 * erro do Fastify traduz tudo para o mesmo formato de resposta.
 */
export class DomainError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ValidationDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }

  /** Mesmo formato de erro usado por todas as respostas da API. */
  toJSON(): ErrorResponse {
    return {
      success: false,
      error: this.code,
      message: this.message,
      ...(this.details && this.details.length > 0
        ? { details: this.details }
        : {}),
    };
  }
}

/** 404 — a build não existe. */
export function notFound(message = "Build não encontrada"): DomainError {
  return new DomainError(404, "BUILD_NOT_FOUND", message);
}

/** 409 — a operação conflita com o estado atual (ex.: build já em montagem). */
export function conflict(message: string): DomainError {
  return new DomainError(409, "BUILD_CONFLICT", message);
}

/** 503 — banco indisponível. */
export function databaseUnavailable(error: unknown): DomainError {
  return new DomainError(503, "DATABASE_UNAVAILABLE", "Banco de dados indisponível", [
    { field: "database", message: String(error) },
  ]);
}
