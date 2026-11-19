import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonBadge, IonButton, IonIcon, IonLabel } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { barbellOutline, carOutline, checkmarkCircleOutline, closeCircleOutline } from 'ionicons/icons';

import type { PackageStatus, StatusChangeEvent, WarehousePackage } from '../../models/package.model';
import { HEAVY_LOAD_KG, PRIORITY_DISPLAY, STATUS_DISPLAY } from '../../shared/package-display';

/**
 * Tarjeta presentacional de un paquete.
 *
 * Recibe el paquete por `pkg` y comunica la intención del operario por `statusChange`; no conoce ningún
 * servicio, así que es el contenedor quien decide qué hacer con el evento.
 */
@Component({
  selector: 'app-package-card',
  templateUrl: './package-card.component.html',
  styleUrl: './package-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, IonBadge, IonButton, IonIcon, IonLabel],
  host: {
    class: 'package-card',
    '[class.package-card--in-transit]': 'isInTransit()',
    '[class.package-card--inspected]': 'isInspected()',
    '[class.package-card--rejected]': 'isRejected()',
  },
})
export class PackageCardComponent {
  /** Paquete que se muestra. */
  readonly pkg = input.required<WarehousePackage>();

  /** Se emite cuando el operario pide un estado distinto del actual. */
  readonly statusChange = output<StatusChangeEvent>();

  readonly statusDisplay = computed(() => STATUS_DISPLAY[this.pkg().status]);
  readonly priorityDisplay = computed(() => PRIORITY_DISPLAY[this.pkg().priority]);
  readonly isHeavy = computed(() => this.pkg().weightKg >= HEAVY_LOAD_KG);
  readonly isInTransit = computed(() => this.pkg().status === 'IN_TRANSIT');
  readonly isInspected = computed(() => this.pkg().status === 'INSPECTED');
  readonly isRejected = computed(() => this.pkg().status === 'REJECTED');

  constructor() {
    addIcons({ barbellOutline, carOutline, checkmarkCircleOutline, closeCircleOutline });
  }

  markAsInspected(): void {
    this.requestStatus('INSPECTED');
  }

  markAsRejected(): void {
    this.requestStatus('REJECTED');
  }

  /** Emisión controlada: no se pide un estado que el paquete ya tiene. */
  private requestStatus(newStatus: PackageStatus): void {
    const pkg = this.pkg();
    if (pkg.status === newStatus) {
      return;
    }
    this.statusChange.emit({ id: pkg.id, newStatus });
  }
}
