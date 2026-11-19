import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  IonBadge,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  barbellOutline,
  carOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  fileTrayOutline,
} from 'ionicons/icons';

import { PACKAGE_STATUSES } from '../models/package.model';
import type { PackageStatus, WarehousePackage } from '../models/package.model';
import { PackageService } from '../services/package.service';
import { HEAVY_LOAD_KG, PRIORITY_DISPLAY, PRIORITY_ORDER, STATUS_DISPLAY } from '../shared/package-display';

/** ViewModel de la cola de paquetes: prepara los datos para la plantilla y delega los cambios al servicio. */
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    IonBadge,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
  ],
})
export class HomePage {
  private readonly packageService = inject(PackageService);

  /** Paquetes ordenados por prioridad y, a igualdad, por hora de registro (más antiguo primero). */
  readonly packages = computed<readonly WarehousePackage[]>(() =>
    // Copia antes de ordenar: el array del servicio nunca se modifica.
    [...this.packageService.packages()].sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.timestamp.getTime() - b.timestamp.getTime(),
    ),
  );

  readonly statusCounts = this.packageService.statusCounts;

  readonly statuses = PACKAGE_STATUSES;
  readonly statusDisplay = STATUS_DISPLAY;
  readonly priorityDisplay = PRIORITY_DISPLAY;
  readonly heavyLoadKg = HEAVY_LOAD_KG;

  constructor() {
    addIcons({ barbellOutline, carOutline, checkmarkCircleOutline, closeCircleOutline, fileTrayOutline });
  }

  /** Cierra las opciones deslizantes y aplica el nuevo estado. */
  async changeStatus(pkg: WarehousePackage, newStatus: PackageStatus, slidingItem: IonItemSliding): Promise<void> {
    await slidingItem.close();
    this.packageService.updateStatus(pkg.id, newStatus);
  }
}
