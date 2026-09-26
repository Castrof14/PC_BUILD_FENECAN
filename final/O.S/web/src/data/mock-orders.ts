import type { Order } from '../types';

/**
 * Dados MOCK do frontend.
 *
 * A API real ainda não está pronta. Os pedidos abaixo são fictícios e ficam
 * apenas no navegador: nenhuma requisição HTTP é feita nesta etapa.
 */
export const MOCK_ORDERS: Order[] = [
  {
    id: 'PED-001',
    status: 'PENDING',
    customer: 'Ana Souza',
    requestedAt: '2026-09-25T14:02:00',
    components: {
      cpu: 'Ryzen 5 5600',
      gpu: 'RTX 4060',
      ram: '16GB',
      storage: 'NVMe 1TB',
      motherboard: 'B550',
      psu: '650W',
      case: 'Mid Tower',
    },
  },
  {
    id: 'PED-002',
    status: 'PENDING',
    customer: 'Bruno Lima',
    requestedAt: '2026-09-25T14:05:00',
    components: {
      cpu: 'Ryzen 7 5700X',
      gpu: 'RTX 4070',
      ram: '32GB',
      storage: 'NVMe 2TB',
      motherboard: 'B550',
      psu: '750W',
      case: 'Mid Tower',
    },
  },
  {
    id: 'PED-003',
    status: 'ACCEPTED',
    customer: 'Carla Dias',
    requestedAt: '2026-09-25T13:58:00',
    components: {
      cpu: 'Intel Core i5-13400F',
      gpu: 'GTX 1660 SUPER',
      ram: '16GB',
      storage: 'SSD 512GB',
      motherboard: 'B660',
      psu: '550W',
      case: 'Compacta',
    },
  },
  {
    id: 'PED-004',
    status: 'BUILDING',
    customer: 'Diego Alves',
    requestedAt: '2026-09-25T13:47:00',
    components: {
      cpu: 'Ryzen 7 7700X',
      gpu: 'RTX 4070 SUPER',
      ram: '32GB',
      storage: 'NVMe 1TB',
      motherboard: 'B650',
      psu: '750W',
      case: 'Mid Tower',
    },
  },
  {
    id: 'PED-005',
    status: 'COMPLETED',
    customer: 'Elisa Rocha',
    requestedAt: '2026-09-25T13:20:00',
    components: {
      cpu: 'Ryzen 7 5800X',
      gpu: 'RTX 3080',
      ram: '32GB',
      storage: 'NVMe 1TB',
      motherboard: 'B550',
      psu: '750W',
      case: 'Full Tower',
    },
  },
  {
    id: 'PED-006',
    status: 'COMPLETED',
    customer: 'Felipe Nunes',
    requestedAt: '2026-09-25T13:05:00',
    components: {
      cpu: 'Intel Core i7-14700K',
      gpu: 'RTX 4070',
      ram: '32GB',
      storage: 'NVMe 2TB',
      motherboard: 'Z790',
      psu: '850W',
      case: 'Full Tower',
    },
  },
  {
    id: 'PED-007',
    status: 'CANCELLED',
    customer: 'Gabriela Melo',
    requestedAt: '2026-09-25T12:50:00',
    components: {
      cpu: 'Intel Core i3-12100F',
      gpu: 'GTX 1650',
      ram: '8GB',
      storage: 'SSD 480GB',
      motherboard: 'H610',
      psu: '500W',
      case: 'Mini',
    },
  },
  {
    id: 'PED-008',
    status: 'COMPLETED',
    customer: 'Henrique Torres',
    requestedAt: '2026-09-25T12:35:00',
    components: {
      cpu: 'Ryzen 5 7600',
      gpu: 'RTX 4060 Ti',
      ram: '16GB',
      storage: 'SSD 1TB',
      motherboard: 'B650',
      psu: '650W',
      case: 'Mid Tower',
    },
  },
];
