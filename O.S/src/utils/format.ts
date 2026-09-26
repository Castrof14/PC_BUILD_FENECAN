import type { ComponentKey } from '../types/order.js';

const BRAND_TOKENS: Readonly<Record<string, string>> = {
  rtx: 'RTX',
  gtx: 'GTX',
  nvme: 'NVMe',
  ssd: 'SSD',
  hdd: 'HDD',
  m2: 'M.2',
  ryzen: 'Ryzen',
  intel: 'Intel',
  amd: 'AMD',
  core: 'Core',
  i3: 'i3',
  i5: 'i5',
  i7: 'i7',
  i9: 'i9',
  ddr3: 'DDR3',
  ddr4: 'DDR4',
  ddr5: 'DDR5',
  atx: 'ATX',
  micro: 'Micro',
  mini: 'Mini',
  matx: 'mATX',
  eATx: 'E-ATX',
  liquid: 'Líquido',
  cooler: 'Cooler',
  psu: 'PSU',
  cpu: 'CPU',
  gpu: 'GPU',
  ram: 'RAM',
  w: 'W',
  a: 'A',
  v: 'V',
};

const UNIT_TOKEN = /^(\d+(?:\.\d+)?)(gb|tb|mb|kb|w|v|mhz|ghz)$/i;

const UNIT_LABELS: Readonly<Record<string, string>> = {
  gb: 'GB',
  tb: 'TB',
  mb: 'MB',
  kb: 'KB',
  w: 'W',
  v: 'V',
  mhz: 'MHz',
  ghz: 'GHz',
};

function prettifyToken(token: string): string {
  const unit = UNIT_TOKEN.exec(token);
  if (unit) {
    const amount = unit[1] ?? '';
    const suffix = unit[2] ?? '';
    return `${amount} ${UNIT_LABELS[suffix.toLowerCase()] ?? suffix.toUpperCase()}`;
  }
  if (/^\d+$/.test(token)) {
    return token;
  }
  const brand = BRAND_TOKENS[token.toLowerCase()];
  if (brand) {
    return brand;
  }
  if (/^[a-z]?\-?\d{3,4}$/i.test(token)) {
    return token.toUpperCase();
  }
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function prettifyComponentValue(raw: string): string {
  const value = raw.trim();
  if (value === '') {
    return '';
  }
  if (/\s/.test(value)) {
    return value;
  }
  return value
    .split(/[-_/\s]+/)
    .filter((token) => token.length > 0)
    .map(prettifyToken)
    .join(' ');
}

export function formatComponentValue(key: ComponentKey, raw: string): string {
  return prettifyComponentValue(raw);
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatAge(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}min`;
  }
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
