/**
 * Armazenamento temporário em memória, usado apenas no MVP.
 *
 * Os dados se perdem quando o servidor reinicia — isso é intencional.
 * A troca por PostgreSQL/Prisma será feita implementando `BuildRepository`.
 */
export class InMemoryBuildRepository {
    store = new Map();
    sequence = 0;
    save(build) {
        this.store.set(build.buildId, build);
        return build;
    }
    findById(buildId) {
        return this.store.get(buildId);
    }
    /** Sequência simples e legível: BUILD-001, BUILD-002, ... */
    generateBuildId() {
        this.sequence += 1;
        return `BUILD-${String(this.sequence).padStart(3, "0")}`;
    }
}
//# sourceMappingURL=in-memory.build.repository.js.map