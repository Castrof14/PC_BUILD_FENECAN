import { EventEmitter } from 'node:events';
import type { ConnectionState, ConnectionStatus } from '../types/api.js';
import { ApiError } from '../api/http-client.js';

export type ConnectionListener = (status: ConnectionStatus) => void;

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'network') {
      return 'API nao respondeu (sem conexao com o servidor)';
    }
    if (error.kind === 'timeout') {
      return `API nao respondeu a tempo (${error.message})`;
    }
    if (error.kind === 'parse') {
      return 'API respondeu com formato invalido';
    }
    return error.body ? `${error.message} - ${error.body}` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Erro desconhecido';
}

export class ConnectionMonitor {
  private readonly emitter = new EventEmitter();
  private state: ConnectionState = 'checking';
  private lastSuccessAt: string | null = null;
  private lastErrorAt: string | null = null;
  private lastError: string | null = null;
  private consecutiveFailures = 0;

  constructor(private readonly apiBaseUrl: string) {}

  onChange(listener: ConnectionListener): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }

  get status(): ConnectionStatus {
    return {
      state: this.state,
      apiBaseUrl: this.apiBaseUrl,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  markChecking(): void {
    if (this.state === 'checking') {
      return;
    }
    this.state = 'checking';
    this.emit();
  }

  markSuccess(): void {
    const changed = this.state !== 'connected';
    this.state = 'connected';
    this.lastSuccessAt = new Date().toISOString();
    this.consecutiveFailures = 0;
    if (changed) {
      this.lastError = null;
    }
    this.emit();
  }

  markFailure(error: unknown): void {
    const changed = this.state !== 'disconnected';
    this.state = 'disconnected';
    this.lastErrorAt = new Date().toISOString();
    this.lastError = describeError(error);
    this.consecutiveFailures += 1;
    if (changed || this.consecutiveFailures === 1) {
      this.emit();
    }
  }

  private emit(): void {
    this.emitter.emit('change', this.status);
  }
}
