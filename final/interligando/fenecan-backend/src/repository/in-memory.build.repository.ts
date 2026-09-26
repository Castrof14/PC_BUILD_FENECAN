import type { BuildRepository } from "./build.repository.js";
import type { Build, BuildStatus, NewBuild } from "../types/build.js";

/**
 * Repositório de builds em memória.
 *
 * Mesma interface do `MysqlBuildRepository`, sem banco: as builds ficam só
 * enquanto o processo viver. Serve para desenvolvimento, demonstração e
 * testes de interface sem MySQL instalado.
 *
 * As operações de status continuam sendo condicionais (`from` -> `to`) e o
 * `claimNextBuild` continua sendo exclusivo (uma `BUILDING` por vez), porque
 * essas são as garantias que a fila e a API dependem — o resto (agregação de
 * id, FIFO) é o que o banco fazia.
 */
export class InMemoryBuildRepository implements BuildRepository {
  private readonly builds: Build[] = [];
  private sequence = 0;

  /** `BUILD-001`, `BUILD-002`, ... — igual ao formato do MySQL. */
  private nextBuildId(): string {
    this.sequence += 1;
    return `BUILD-${String(this.sequence).padStart(3, "0")}`;
  }

  async create(input: NewBuild): Promise<Build> {
    const now = new Date().toISOString();
    const build: Build = {
      cpu: input.cpu,
      gpu: input.gpu,
      ram: input.ram,
      storage: input.storage,
      motherboard: input.motherboard,
      psu: input.psu,
      case: input.case,
      buildId: this.nextBuildId(),
      status: "WAITING",
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    };

    this.builds.push(build);
    return { ...build };
  }

  async findById(buildId: string): Promise<Build | undefined> {
    const found = this.builds.find((build) => build.buildId === buildId);
    return found === undefined ? undefined : { ...found };
  }

  /** FIFO: mais antiga primeiro, como o `ORDER BY created_at ASC, id ASC`. */
  async findByStatus(status: BuildStatus): Promise<Build[]> {
    return this.builds
      .filter((build) => build.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.buildId.localeCompare(b.buildId))
      .map((build) => ({ ...build }));
  }

  async findBuilding(): Promise<Build | undefined> {
    return this.findByStatus("BUILDING").then((list) => list[0]);
  }

  async claimNextBuild(): Promise<Build | undefined> {
    if (await this.findBuilding() !== undefined) {
      return undefined;
    }

    const [next] = await this.findByStatus("WAITING");
    if (next === undefined) {
      return undefined;
    }

    return this.updateStatus(next.buildId, ["WAITING"], "BUILDING");
  }

  async updateStatus(
    buildId: string,
    from: readonly BuildStatus[],
    to: BuildStatus,
  ): Promise<Build | undefined> {
    const index = this.builds.findIndex(
      (build) => build.buildId === buildId && from.includes(build.status),
    );

    if (index === -1) {
      return undefined;
    }

    const now = new Date().toISOString();
    const current = this.builds[index];
    if (current === undefined) {
      return undefined;
    }

    const updated: Build = {
      ...current,
      status: to,
      updatedAt: now,
      startedAt: to === "BUILDING" ? now : current.startedAt,
      finishedAt: to === "COMPLETED" || to === "ERROR" ? now : current.finishedAt,
    };

    this.builds[index] = updated;
    return { ...updated };
  }

  async countByStatus(): Promise<Record<BuildStatus, number>> {
    const counts: Record<BuildStatus, number> = {
      WAITING: 0,
      BUILDING: 0,
      COMPLETED: 0,
      ERROR: 0,
    };

    for (const build of this.builds) {
      counts[build.status] += 1;
    }

    return counts;
  }

  /** 1 = próxima a ser montada; 0 para quem já saiu da fila. */
  async positionInQueue(buildId: string): Promise<number | undefined> {
    const waiting = await this.findByStatus("WAITING");
    const index = waiting.findIndex((build) => build.buildId === buildId);
    return index === -1 ? undefined : index + 1;
  }

  /** Nada a fechar: não há conexão de banco. */
  async close(): Promise<void> {}
}
