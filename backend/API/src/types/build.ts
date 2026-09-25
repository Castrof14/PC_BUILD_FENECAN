/**
 * Tipos de domínio e de contrato da API.
 *
 * Nenhuma camada deve usar `any`: tudo aqui é tipado explicitamente
 * para que a integração futura (banco, fila, WebSocket, Unity) seja segura.
 */

/** Status possíveis de uma build. Novas builds sempre nacem em `WAITING`. */
export type BuildStatus = "WAITING" | "BUILDING" | "COMPLETED" | "ERROR";

/** Componentes escolhidos no site. A compatibilidade entre eles é validada depois. */
export interface BuildConfig {
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  motherboard: string;
  psu: string;
  case: string;
}

/** Registro completo de uma build, como devolvido em `GET /build/:id`. */
export interface Build extends BuildConfig {
  buildId: string;
  status: BuildStatus;
}

/** Resposta de `POST /build` (201). */
export interface BuildResponse {
  success: true;
  buildId: string;
  status: BuildStatus;
  message: string;
}

/** Resposta de `GET /build/:id` (200). */
export interface BuildDetailsResponse {
  success: true;
  build: Build;
}

/** Resposta de `GET /health` (200). */
export interface HealthResponse {
  status: "ok";
}

/** Um item de `details` em uma resposta de validação. */
export interface ValidationDetail {
  field: string;
  message: string;
}

/** Códigos de erro estáveis, usados pelo site e pela Unity. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "BUILD_NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

/** Formato padronizado de erro da API. */
export interface ErrorResponse {
  success: false;
  error: ErrorCode;
  message: string;
  details?: ValidationDetail[];
}
