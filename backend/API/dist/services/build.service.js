/**
 * Regras de negócio das builds.
 *
 * Não conhece Fastify nem HTTP: recebe `BuildConfig` já validada e devolve
 * entidades. É o ponto natural para a futura máquina de estados
 * (WAITING -> BUILDING -> COMPLETED/ERROR) controlada pela fila.
 */
export class BuildService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    /** Cria uma nova build com status inicial `WAITING`. */
    createBuild(config) {
        const build = {
            buildId: this.repository.generateBuildId(),
            ...config,
            status: "WAITING",
        };
        return this.repository.save(build);
    }
    /** Busca uma build pelo id. Retorna `undefined` quando não existe. */
    getBuild(buildId) {
        return this.repository.findById(buildId);
    }
}
//# sourceMappingURL=build.service.js.map