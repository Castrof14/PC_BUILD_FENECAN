import type { BuildRepository } from "./build.repository.js";
import type { Build, BuildStatus, NewBuild } from "../types/build.js";

export interface BuildChangeListener {
  buildCreated(build: Build): void;
  buildUpdated(build: Build): void;
}

/**
 * Repositório que avisa quem estiver ouvindo (a O.S.) a cada build criada
 * ou alterada.
 *
 * Envolve o repositório real (MySQL ou memória) em vez de espalhar avisos
 * pelas rotas e pela fila: toda mudança de build passa por aqui, então
 * nenhuma escapa, e trocar o banco continua sem tocar em nada disso.
 * O aviso só sai depois que a operação foi salva.
 */
export class NotifyingBuildRepository implements BuildRepository {
  constructor(
    private readonly inner: BuildRepository,
    private readonly listener: BuildChangeListener,
  ) {}

  async create(input: NewBuild): Promise<Build> {
    const build = await this.inner.create(input);
    this.listener.buildCreated(build);
    return build;
  }

  findById(buildId: string): Promise<Build | undefined> {
    return this.inner.findById(buildId);
  }

  findByStatus(status: BuildStatus): Promise<Build[]> {
    return this.inner.findByStatus(status);
  }

  findBuilding(): Promise<Build | undefined> {
    return this.inner.findBuilding();
  }

  async claimNextBuild(): Promise<Build | undefined> {
    const build = await this.inner.claimNextBuild();
    if (build) {
      this.listener.buildUpdated(build);
    }
    return build;
  }

  async updateStatus(
    buildId: string,
    from: readonly BuildStatus[],
    to: BuildStatus,
  ): Promise<Build | undefined> {
    const build = await this.inner.updateStatus(buildId, from, to);
    if (build) {
      this.listener.buildUpdated(build);
    }
    return build;
  }

  countByStatus(): Promise<Record<BuildStatus, number>> {
    return this.inner.countByStatus();
  }

  positionInQueue(buildId: string): Promise<number | undefined> {
    return this.inner.positionInQueue(buildId);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
