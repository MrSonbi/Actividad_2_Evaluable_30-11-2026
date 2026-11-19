/** Prioridades de envío admitidas, de mayor a menor urgencia. */
export const PACKAGE_PRIORITIES = ['CRITICAL', 'STANDARD', 'LOW'] as const;

/** Prioridad de un paquete; solo admite los valores de `PACKAGE_PRIORITIES`. */
export type PackagePriority = (typeof PACKAGE_PRIORITIES)[number];

/** Estados por los que pasa un paquete en el almacén. */
export const PACKAGE_STATUSES = ['IN_TRANSIT', 'INSPECTED', 'REJECTED'] as const;

/** Estado de un paquete; solo admite los valores de `PACKAGE_STATUSES`. */
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

/** Código de seguimiento con forma `LTK-<dígitos>-ES` comprobada en compilación. */
export type TrackingCode = `LTK-${string}-ES`;

/** Validación en tiempo de ejecución: exactamente 4 dígitos entre `LTK-` y `-ES`. */
export const TRACKING_CODE_PATTERN = /^LTK-\d{4}-ES$/;

/** Paquete registrado en el almacén. Inmutable: los cambios crean un objeto nuevo. */
export interface WarehousePackage {
  /** Identificador único (UUID v4). */
  readonly id: string;
  /** Código de seguimiento visible para el operario. */
  readonly trackingCode: TrackingCode;
  /** Centro logístico de destino. */
  readonly destinationHub: string;
  /** Peso en kilogramos (kg). */
  readonly weightKg: number;
  /** Prioridad de envío. */
  readonly priority: PackagePriority;
  /** Estado actual en el almacén. */
  readonly status: PackageStatus;
  /** Fecha y hora de registro del paquete. */
  readonly timestamp: Date;
}

/**
 * Petición de cambio de estado que una tarjeta de paquete emite hacia su contenedor.
 *
 * `newStatus` se tipa como `PackageStatus` (y no como el `string` genérico del enunciado) para que el
 * compilador rechace cualquier estado inexistente tanto al emitir como al recibir el evento.
 */
export interface StatusChangeEvent {
  /** Identificador del paquete afectado (`WarehousePackage.id`). */
  readonly id: string;
  /** Estado solicitado para el paquete. */
  readonly newStatus: PackageStatus;
}
