import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(moduleDir, '..');

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface AppConfig {
  apiBaseUrl: string;
  pollIntervalMs: number;
  requestTimeoutMs: number;
  operatorPort: number;
  autoOpenBrowser: boolean;
  kioskMode: boolean;
  newOrderSound: boolean;
}

export interface ConfigSummary extends AppConfig {
  projectRoot: string;
  nodeVersion: string;
  envFileFound: boolean;
}

function loadEnvFile(): boolean {
  const envPath = path.join(projectRoot, '.env');
  if (!existsSync(envPath)) {
    return false;
  }
  loadDotenv({ path: envPath, quiet: true });
  return true;
}

/**
 * A URL da API vem sempre do ambiente. Trocar da Mock API para a API real e
 * mudar uma unica linha do .env, sem tocar em codigo.
 * API_URL e o nome canonico; API_BASE_URL e aceito como apelido antigo.
 */
function resolveApiBaseUrl(): string {
  const canonical = process.env['API_URL']?.trim();
  const legacy = process.env['API_BASE_URL']?.trim();
  const raw = canonical !== undefined && canonical !== '' ? canonical : legacy;
  if (raw === undefined || raw === '') {
    throw new ConfigError(
      'Variavel obrigatoria ausente: API_URL. Defina API_URL no arquivo .env (veja .env.example).',
    );
  }
  return normalizeBaseUrl(raw);
}

function normalizeBaseUrl(raw: string): string {
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new ConfigError(`API_BASE_URL invalida: "${raw}". Use algo como http://localhost:3000`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ConfigError(`API_BASE_URL deve usar http ou https. Received: "${raw}"`);
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

function intInRange(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${key} invalido: "${raw}". Use um numero inteiro entre ${min} e ${max}.`);
  }
  return value;
}

function boolValue(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (['true', '1', 'yes', 'sim', 'on'].includes(raw)) {
    return true;
  }
  if (['false', '0', 'no', 'nao', 'off'].includes(raw)) {
    return false;
  }
  throw new ConfigError(`${key} invalido: "${raw}". Use true ou false.`);
}

export function loadConfig(): AppConfig {
  loadEnvFile();
  return {
    apiBaseUrl: resolveApiBaseUrl(),
    pollIntervalMs: intInRange('POLL_INTERVAL_MS', 2000, 500, 600000),
    requestTimeoutMs: intInRange('REQUEST_TIMEOUT_MS', 5000, 500, 120000),
    operatorPort: intInRange('OPERATOR_PORT', 4000, 1, 65535),
    autoOpenBrowser: boolValue('AUTO_OPEN_BROWSER', true),
    kioskMode: boolValue('KIOSK_MODE', true),
    newOrderSound: boolValue('NEW_ORDER_SOUND', true),
  };
}

export function getSummary(): ConfigSummary {
  const envFileFound = loadEnvFile();
  return {
    ...loadConfig(),
    projectRoot,
    nodeVersion: process.versions.node,
    envFileFound,
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached === null) {
    cached = loadConfig();
  }
  return cached;
}
