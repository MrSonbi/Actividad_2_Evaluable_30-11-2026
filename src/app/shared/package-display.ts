import type { PackagePriority, PackageStatus } from '../models/package.model';

/** Texto, color de Ionic e icono (ionicons) con que se muestra cada estado. */
export const STATUS_DISPLAY: Record<PackageStatus, { label: string; color: string; icon: string }> = {
  IN_TRANSIT: { label: 'En tránsito', color: 'primary', icon: 'car-outline' },
  INSPECTED: { label: 'Inspeccionado', color: 'success', icon: 'checkmark-circle-outline' },
  REJECTED: { label: 'Rechazado', color: 'danger', icon: 'close-circle-outline' },
};

/** Texto y color de Ionic con que se muestra cada prioridad. */
export const PRIORITY_DISPLAY: Record<PackagePriority, { label: string; color: string }> = {
  CRITICAL: { label: 'Crítica', color: 'warning' },
  STANDARD: { label: 'Estándar', color: 'secondary' },
  LOW: { label: 'Baja', color: 'medium' },
};

/** Orden de prioridad para listar: menor número, antes en la lista (CRITICAL primero). */
export const PRIORITY_ORDER: Record<PackagePriority, number> = {
  CRITICAL: 0,
  STANDARD: 1,
  LOW: 2,
};

/** Peso (kg) a partir del cual un paquete se marca como carga pesada (incluido el propio umbral). */
export const HEAVY_LOAD_KG = 30;
