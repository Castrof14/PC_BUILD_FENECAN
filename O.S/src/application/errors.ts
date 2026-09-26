export type ApplicationErrorCode = 'ORDER_NOT_FOUND' | 'ORDER_ALREADY_EXISTS' | 'ORDER_ID_UNAVAILABLE';

/** Erro de caso de uso. Assim como `DomainError`, tem um `code` estavel. */
export abstract class ApplicationError extends Error {
  abstract readonly code: ApplicationErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class OrderNotFoundError extends ApplicationError {
  readonly code = 'ORDER_NOT_FOUND';

  constructor(readonly orderId: string) {
    super(`O.S. ${orderId} nao encontrada.`);
  }
}

export class OrderAlreadyExistsError extends ApplicationError {
  readonly code = 'ORDER_ALREADY_EXISTS';

  constructor(readonly orderId: string) {
    super(`Ja existe uma O.S. com o id ${orderId}.`);
  }
}

/** O gerador so devolveu IDs ja usados. Indica gerador mal configurado. */
export class OrderIdUnavailableError extends ApplicationError {
  readonly code = 'ORDER_ID_UNAVAILABLE';

  constructor(readonly attempts: number) {
    super(`Nao foi possivel gerar um id livre para a O.S. apos ${attempts} tentativas.`);
  }
}
