import type { BuildRepository } from "../repository/build.repository.js";
import type { Build, BuildStatus, QueueResponse, UnityEvent } from "../types/build.js";

/**
 * O que o QueueService precisa da Unity.
 *
 * A interface é declarada aqui (e não no módulo WebSocket) para que a
 * fila dependa do comportamento, não da tecnologia: trocar o WebSocket
 * por outro transporte não toca neste arquivo.
 */
export interface UnityGateway {
  isConnected(): boolean;
  isReady(): boolean;
  sendBuildStart(build: Build): void;
}

export interface QueueServiceOptions {
  logger: {
    info(payload: unknown, message?: string): void;
    warn(payload: unknown, message?: string): void;
    error(payload: unknown, message?: string): void;
  };
}

/**
 * Fila de montagens.
 *
 * Reúne o que o módulo de fila original (`FILA/src/montagemService.js`)
 * já fazia — FIFO, uma montagem por vez, transições de status — e
 * acrescenta a conversa com a Unity: só despacha build quando há Unity
 * livre, e devolve para a fila quando a Unity cai no meio.
 *
 * Estados possíveis de uma build:
 *
 *   WAITING ──(Unity livre + claim atômico)──▶ BUILDING ──▶ COMPLETED
 *      ▲                                          │
 *      └────────────(Unity caiu / envio falhou)───┴──▶ ERROR
 *
 * O bloqueio de "uma build por vez" tem duas camadas: o `dispatching`
 * abaixo (dentro do processo) e a transação `FOR UPDATE` do repositório
 * (contra quem chamar a API de fora). É a segunda que vale.
 */
export class QueueService {
  /** Trava de reentrância: duas chamadas de dispatch no mesmo tick. */
  private dispatching = false;

  constructor(
    private readonly repository: BuildRepository,
    private readonly unity: UnityGateway,
    private readonly options: QueueServiceOptions,
  ) {}

  /**
   * Tenta iniciar a próxima build.
   *
   * Não faz nada se já houver um dispatch em andamento, se a Unity não
   * estiver livre, se a fila estiver vazia ou se já existir uma
   * `BUILDING`. Devolve a build despachada, quando houver.
   */
  async dispatch(): Promise<Build | undefined> {
    if (this.dispatching) {
      return undefined;
    }

    if (!this.unity.isReady()) {
      return undefined;
    }

    this.dispatching = true;

    try {
      // Atômico: só uma build por vez, mesmo com chamadas simultâneas.
      const build = await this.repository.claimNextBuild();

      if (!build) {
        return undefined;
      }

      try {
        this.unity.sendBuildStart(build);
      } catch (error) {
        // A Unity caiu entre a checagem e o envio: a build volta para a
        // fila e será tentada de novo quando houver Unity de novo.
        await this.repository.updateStatus(build.buildId, ["BUILDING"], "WAITING");

        this.options.logger.warn(
          { buildId: build.buildId, err: error },
          "falha ao enviar a build para a Unity; devolvida para a fila",
        );

        return undefined;
      }

      this.options.logger.info({ buildId: build.buildId }, "build despachada");

      return build;
    } finally {
      this.dispatching = false;
    }
  }

  /**
   * Treata os eventos da Unity.
   *
   * É aqui que a máquina de estados anda: `BUILD_STARTED` garante o
   * `BUILDING`, e `BUILD_COMPLETED`/`BUILD_ERROR` liberam a Unity e
   * chamam a próxima da fila.
   */
  async handleUnityEvent(event: UnityEvent): Promise<void> {
    switch (event.type) {
      case "unity.connected":
      case "unity.status":
        // Unity nova ou que acabou de ficar livre: a fila pode andar.
        await this.dispatch();
        return;

      case "unity.disconnected": {
        // A build em montagem só fica órfã se a Unity que a recebeu caiu.
        // Se a que caiu era outra (apenas conectada), a montagem continua
        // com quem a tinha — devolver a build para a fila faria a mesma
        // build ser reenviada e montada duas vezes ao mesmo tempo.
        if (!event.wasActive) {
          return;
        }

        const building = await this.repository.findBuilding();

        if (building) {
          // A Unity caiu no meio da montagem. Em vez de travar a fila
          // para sempre, a build volta para WAITING e é reenviada quando
          // a Unity voltar — a ordem da fila é preservada.
          await this.repository.updateStatus(building.buildId, ["BUILDING"], "WAITING");

          this.options.logger.warn(
            { buildId: building.buildId },
            "Unity desconectou durante a montagem; build devolvida para a fila",
          );

          // Se sobrou outra Unity pronta, ela já recebe a build devolvida
          // (ela é a mais antiga da fila, então a ordem é mantida).
          await this.dispatch();
        }

        return;
      }

      case "BUILD_STARTED": {
        const build = await this.repository.findById(event.buildId);

        if (!build) {
          this.options.logger.warn(
            { buildId: event.buildId },
            "BUILD_STARTED de build inexistente",
          );
          return;
        }

        if (build.status === "BUILDING") {
          return; // já está em montagem, nada a fazer
        }

        if (build.status !== "WAITING") {
          this.options.logger.warn(
            { buildId: build.buildId, status: build.status },
            "BUILD_STARTED ignorado: build não está na fila",
          );
          return;
        }

        await this.repository.updateStatus(build.buildId, ["WAITING"], "BUILDING");

        this.options.logger.info({ buildId: build.buildId }, "Unity iniciou a montagem");
        return;
      }

      case "BUILD_COMPLETED": {
        const completed = await this.repository.updateStatus(
          event.buildId,
          ["BUILDING"],
          "COMPLETED",
        );

        if (!completed) {
          this.options.logger.warn(
            { buildId: event.buildId },
            "BUILD_COMPLETED ignorado: build não está em montagem",
          );
          return;
        }

        this.options.logger.info({ buildId: event.buildId }, "build concluída");

        // Unity liberada: já pode pegar a próxima da fila.
        await this.dispatch();
        return;
      }

      case "BUILD_ERROR": {
        const failed = await this.repository.updateStatus(
          event.buildId,
          ["BUILDING", "WAITING"],
          "ERROR",
        );

        if (!failed) {
          this.options.logger.warn(
            { buildId: event.buildId },
            "BUILD_ERROR ignorado: build não está em montagem nem na fila",
          );
          return;
        }

        this.options.logger.error(
          { buildId: event.buildId, reason: event.message },
          "build terminou com erro",
        );

        await this.dispatch();
        return;
      }
    }
  }

  /**
   * Recupera builds presas em `BUILDING` de uma execução anterior.
   *
   * Sem isso, um servidor reiniciado no meio de uma montagem deixaria a
   * fila travada para sempre, já que ninguém confirmaria o término. No
   * boot não há Unity conectada (o WebSocket morreu com o processo), então
   * qualquer `BUILDING` é resíduo e volta para `WAITING`.
   */
  async recoverInterruptedBuilds(): Promise<number> {
    const building = await this.repository.findBuilding();

    if (!building) {
      return 0;
    }

    await this.repository.updateStatus(building.buildId, ["BUILDING"], "WAITING");

    this.options.logger.warn(
      { buildId: building.buildId },
      "build interrupted pelo reinício do servidor; devolvida para a fila",
    );

    return 1;
  }

  /** Situação da fila e da Unity, usada em `GET /queue`. */
  async snapshot(unityState: QueueResponse["unity"]): Promise<QueueResponse> {
    const [building, waiting, counts] = await Promise.all([
      this.repository.findBuilding(),
      this.repository.findByStatus("WAITING"),
      this.repository.countByStatus(),
    ]);

    return {
      success: true,
      unity: unityState,
      building: building ?? null,
      waiting,
      counts,
    };
  }

  /** Posição de uma build na fila (1 = próxima) e o status atual. */
  async describePosition(
    buildId: string,
  ): Promise<{ status: BuildStatus; position: number } | undefined> {
    const build = await this.repository.findById(buildId);

    if (!build) {
      return undefined;
    }

    if (build.status !== "WAITING") {
      return { status: build.status, position: 0 };
    }

    return { status: build.status, position: (await this.repository.positionInQueue(buildId)) ?? 0 };
  }
}
