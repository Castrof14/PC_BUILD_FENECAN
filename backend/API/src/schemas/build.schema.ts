import { z } from "zod";
import type { ValidationDetail } from "../types/build.js";

/** Campo obrigatório: string não vazia, com mensagem de erro em português. */
const requiredString = (field: string) =>
  z
    .string({ error: `${field} é obrigatório` })
    .trim()
    .min(1, `${field} não pode ser vazio`);

/**
 * Valida a configuração enviada pelo site.
 *
 * Por enquanto apenas o formato é validado (todos os campos são strings).
 * A lista fechada de componentes e a checagem de compatibilidade
 * (socket, VRM, wattagem da fonte, etc.) entram em uma etapa posterior,
 * sem alterar este contrato.
 */
export const buildSchema = z.object({
  cpu: requiredString("cpu"),
  gpu: requiredString("gpu"),
  ram: requiredString("ram"),
  storage: requiredString("storage"),
  motherboard: requiredString("motherboard"),
  psu: requiredString("psu"),
  case: requiredString("case"),
});

/** Campos aceitos no corpo de `POST /build`. */
export type BuildConfig = z.infer<typeof buildSchema>;

/**
 * Converte os issues do Zod no formato de `details` da resposta de erro,
 * sem expor informações internas (stack traces, tipos do Zod, etc).
 */
export function toValidationDetails(error: z.ZodError): ValidationDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "body",
    message: issue.message,
  }));
}
