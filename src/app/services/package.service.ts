import { Injectable, computed, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { defer, delay, of } from 'rxjs';

import { MOCK_PACKAGES } from '../data/packages.mock';
import type { PackageStatus, WarehousePackage } from '../models/package.model';

/** Latencia simulada de la búsqueda remota `searchTrackingCodes()` (ms). */
export const SEARCH_LATENCY_MS = 150;

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
   * Simula una búsqueda remota por código de seguimiento (en una app real sería una petición HTTP).
   *
   * Devuelve un observable frío: la "petición" se lanza al suscribirse, emite UNA vez tras
   * `SEARCH_LATENCY_MS` ms y se completa. Si el consumidor se desuscribe antes (p. ej. `switchMap` ante un
   * término nuevo), la respuesta pendiente se descarta.
   *
   * Solo devuelve ids, no paquetes: quien lo usa cruza esos ids con `packages()`, que sigue siendo la única
   * fuente de verdad, así que los cambios de estado posteriores nunca quedan ocultos tras una copia antigua.
   *
   * @param term término ya normalizado (sin espacios en los extremos y en minúsculas).
   * @returns ids de los paquetes cuyo `trackingCode` contiene `term`, sin distinguir mayúsculas.
   */
  searchTrackingCodes(term: string): Observable<ReadonlySet<string>> {
    return defer(() => {
      const needle = term.toLowerCase();
      const ids: ReadonlySet<string> = new Set(
        this.packagesState()
          .filter((pkg) => pkg.trackingCode.toLowerCase().includes(needle))
          .map((pkg) => pkg.id),
      );
      return of(ids);
    }).pipe(delay(SEARCH_LATENCY_MS));
  }
}
