import { Injectable, computed, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { delay, of } from 'rxjs';

import { MOCK_PACKAGES } from '../data/packages.mock';
import type { PackageStatus, WarehousePackage } from '../models/package.model';

/** Latencia simulada de `getPackages()` (ms). Solo para el experimento de la rama `ia/original`. */
export const SIMULATED_LATENCY_MS = 200;

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

  /** Número de paquetes por estado; se recalcula solo cuando cambia la lista. */
  readonly statusCounts = computed<Record<PackageStatus, number>>(() => {
    const counts: Record<PackageStatus, number> = { IN_TRANSIT: 0, INSPECTED: 0, REJECTED: 0 };
    for (const pkg of this.packagesState()) {
      counts[pkg.status]++;
    }
    return counts;
  });

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

  /**
   * ADAPTACIÓN PARA EL EXPERIMENTO (Tarea 5, rama `ia/original`): no forma parte del diseño del servicio.
   *
   * El código generado por la IA supone un `getPackages()` que "realiza una petición HTTP". Se simula ese
   * comportamiento: un observable frío que, al suscribirse, emite UNA instantánea (copia) de los paquetes
   * tras `SIMULATED_LATENCY_MS` ms y se completa. No sigue los cambios posteriores del estado.
   * Devuelve un array mutable (copia) porque la IA tipa el resultado como `WarehousePackage[]`.
   */
  getPackages(): Observable<WarehousePackage[]> {
    return of([...this.packagesState()]).pipe(delay(SIMULATED_LATENCY_MS));
  }
}
