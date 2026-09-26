/**
 * Tipos de domínio, contrato da API e protocolo do WebSocket.
 *
 * Nenhuma camada deve usar `any`: tudo aqui é tipado explicitamente.
 * Este arquivo é a única fonte de verdade de `Build` e de `BuildStatus` —
 * API, banco, fila e WebSocket importam daqui.
 */

/** Status possíveis de uma build. Novas builds sempre nacem em `WAITING`. */
export type BuildStatus = "WAITING" | "BUILDING" | "COMPLETED" | "ERROR";

/** Todos os status, na ordem do ciclo de vida. Usado por validações e testes. */
export const BUILD_STATUSES = [
  "WAITING",
  "BUILDING",
  "COMPLETED",
  "ERROR",
] as const satisfies readonly BuildStatus[];

/** Componentes escolhidos no celular. A compatibilidade entre eles é validada depois. */
export interface BuildConfig {
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  motherboard: string;
  psu: string;
  case: string;
}

/**
 * Registro completo de uma build, como devolvido em `GET /build/:id`.
 *
 * As datas são strings ISO-8601 em UTC porque esta interface também é o
 * formato do JSON da API e das mensagens enviadas para a Unity.
 */
export interface Build extends BuildConfig {
  buildId: string;
  status: BuildStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Build salva na fila: a configuração recebida + a identificação do visitante. */
export interface NewBuild extends BuildConfig {
  /** Opcional. O app mobile não precisa enviar. */
  visitante?: string | null;
}

/** Resposta de `POST /build` (201). */
export interface BuildResponse {
  success: true;
  buildId: string;
  status: BuildStatus;
  message: string;
}

/**
 * Build como devolvida em `GET /build/:id`: a mesma de `Build` mais o
 * alias `id`.
 *
 * O app mobile e a Unity usam nomes diferentes para a mesma coisa — o
 * exemplo de contrato do FENECAN e o payload `BUILD_START` chamam de
 * `id`, a API historicamente devolve `buildId`. Mandar os dois (com o
 * mesmo valor) deixa qualquer um dos dois lados funcionando sem
 * tradução. Não é uma segunda interface de `Build`: é o mesmo registro.
 */
export type BuildWithIdAlias = Build & { id: string };

/** Resposta de `GET /build/:id` (200). */
export interface BuildDetailsResponse {
  success: true;
  build: BuildWithIdAlias;
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

/** Códigos de erro estáveis, usados pelo app mobile e pela Unity. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "BUILD_NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "BUILD_CONFLICT"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_SERVER_ERROR";

/** Formato padronizado de erro da API. */
export interface ErrorResponse {
  success: false;
  error: ErrorCode;
  message: string;
  details?: ValidationDetail[];
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

/** Resposta de `GET /queue` (200). */
export interface QueueResponse {
  success: true;
  unity: UnityConnectionState;
  /** Build em montagem agora, ou `null` se a Unity está ociosa. */
  building: Build | null;
  /** Builds aguardando, da primeira para a última. */
  waiting: Build[];
  /** Quantidade de builds por status. */
  counts: Record<BuildStatus, number>;
}

/** Resposta de `GET /build/:id/position` (200). */
export interface QueuePositionResponse {
  success: true;
  buildId: string;
  status: BuildStatus;
  /** 1 = próxima a ser montada. 0 = já saiu da fila (BUILDING/COMPLETED/ERROR). */
  position: number;
}

// ---------------------------------------------------------------------------
// WebSocket (contrato com a Unity — ver docs/WEBSOCKET.md)
// ---------------------------------------------------------------------------

/** Eventos enviados pela Unity para o backend. */
export type UnityInboundType =
  | "BUILD_STARTED"
  | "BUILD_COMPLETED"
  | "BUILD_ERROR";

/** Mensagens que a Unity pode enviar. */
export type UnityInboundMessage =
  | { type: "BUILD_STARTED"; buildId: string }
  | { type: "BUILD_COMPLETED"; buildId: string }
  | { type: "BUILD_ERROR"; buildId: string; message?: string }
  /** Mantido do módulo WebSocket original: a Unity avisa que está livre. */
  | { type: "unity.status"; status: UnityStatus; deviceId?: string }
  /** Aceita o mesmo evento com o nome do padrão novo. */
  | { type: "UNITY_STATUS"; status: UnityStatus; deviceId?: string };

/** O que a Unity declara estar fazendo. `ready` libera a fila. */
export type UnityStatus = "ready" | "busy";

/** Estado da conexão da Unity, exposto em `GET /queue`. */
export interface UnityConnectionState {
  connected: boolean;
  /** `connected` e sem `busy` declarado — ou seja, a fila pode começar. */
  ready: boolean;
  deviceId: string | null;
}

/**
 * Configuração enviada para a Unity em `BUILD_START`.
 *
 * O campo `id` (e não `buildId`) é o que a Unity identifica; o backend
 * traduz o `buildId` do domínio para cá na fronteira do WebSocket.
 * Os IDs dos componentes vão exatamente como vieram do celular.
 */
export interface UnityBuildPayload extends BuildConfig {
  id: string;
}

// ---------------------------------------------------------------------------
// WebSocket da O.S. (sistema do operador — ver docs/WEBSOCKET.md)
// ---------------------------------------------------------------------------

/** Mensagens enviadas pelo backend para a O.S. em `OS_WS_PATH`. */
export type OsOutboundMessage =
  /** Primeira mensagem de cada conexão: todas as builds existentes. */
  | { type: "BUILDS_SNAPSHOT"; builds: Build[] }
  | { type: "BUILD_CREATED"; build: Build }
  | { type: "BUILD_UPDATED"; build: Build };

/** Eventos internos do hub WebSocket, consumidos pelo QueueService. */
export type UnityEvent =
  | { type: "unity.connected"; deviceId: string | null }
  /**
   * `wasActive` diz se a Unity que caiu era a que estava com a build em
   * montagem. Só nesse caso a build fica órfã e volta para a fila; se a
   * que caiu era outra Unity apenas conectada, a montagem continua com
   * quem a havia recebido.
   */
  | { type: "unity.disconnected"; deviceId: string | null; wasActive: boolean }
  | { type: "unity.status"; deviceId: string | null; status: UnityStatus }
  | { type: "BUILD_STARTED"; buildId: string }
  | { type: "BUILD_COMPLETED"; buildId: string }
  | { type: "BUILD_ERROR"; buildId: string; message: string };
