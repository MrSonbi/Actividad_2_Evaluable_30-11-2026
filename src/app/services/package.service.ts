import { Injectable, signal } from '@angular/core';

import { MOCK_PACKAGES } from '../data/packages.mock';
import type { PackageStatus, WarehousePackage } from '../models/package.model';

/**
 * Fuente única de verdad de los paquetes del almacén.
 *
 * El estado es privado para que solo este servicio pueda modificarlo; el resto de la app lo lee mediante
 * `packages` (solo lectura). Las actualizaciones son inmutables (array y objeto nuevos) para que Signals
 * detecte el cambio por referencia y nadie pueda alterar datos ya entregados a la vista.
 */
@Injectable({ providedIn: 'root' })
export class PackageService {
  private readonly packagesState = signal<readonly WarehousePackage[]>(MOCK_PACKAGES);

  /** Lista de paquetes en solo lectura; única vía de acceso al estado. */
  readonly packages = this.packagesState.asReadonly();

  /**
   * Cambia el estado de un paquete de forma inmutable.
   *
   * @returns `true` si el paquete cambió; `false` si el id no existe o ya tenía ese estado
   * (en ese caso no se emite un array nuevo).
   */
  updateStatus(id: string, newStatus: PackageStatus): boolean {
    const target = this.packagesState().find((pkg) => pkg.id === id);
    if (!target || target.status === newStatus) {
      return false;
    }

    this.packagesState.update((packages) =>
      packages.map((pkg) => (pkg.id === id ? { ...pkg, status: newStatus } : pkg)),
    );
    return true;
  }
}
