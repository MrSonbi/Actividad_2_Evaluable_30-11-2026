import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular';
import type { SegmentCustomEvent } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, closeCircleOutline, fileTrayOutline } from 'ionicons/icons';

import { PackageCardComponent } from '../components/package-card/package-card.component';
import { PACKAGE_PRIORITIES, PACKAGE_STATUSES } from '../models/package.model';
import type { PackagePriority, PackageStatus, StatusChangeEvent, WarehousePackage } from '../models/package.model';
import { PackageService } from '../services/package.service';
import { PRIORITY_DISPLAY, PRIORITY_ORDER, STATUS_DISPLAY, STATUS_ORDER } from '../shared/package-display';

/** Filtro de prioridad de la vista: una prioridad concreta o todas. */
export type PriorityFilter = PackagePriority | 'ALL';

/** Comprueba en tiempo de ejecución que un valor (p. ej. el de ion-segment) es un filtro válido. */
export function isPriorityFilter(value: unknown): value is PriorityFilter {
  return value === 'ALL' || PACKAGE_PRIORITIES.some((priority) => priority === value);
}

/** ViewModel de la cola de paquetes: prepara los datos para la plantilla y delega los cambios al servicio. */
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonBadge,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonTitle,
    IonToast,
    IonToolbar,
    PackageCardComponent,
  ],
})
export class HomePage {
  private readonly packageService = inject(PackageService);

  /** Texto escrito en el buscador (enlazado con ngModel). */
  readonly searchTerm = signal('');
  /** Prioridad seleccionada en el segmento. */
  readonly priorityFilter = signal<PriorityFilter>('ALL');

  /** Término normalizado: sin espacios en los extremos y en minúsculas. */
  private readonly normalizedTerm = computed(() => this.searchTerm().trim().toLowerCase());

  /**
   * Cola completa ordenada: primero los pendientes (IN_TRANSIT); dentro de cada grupo, por prioridad
   * y después por hora de registro (más antiguo primero).
   */
  readonly packages = computed<readonly WarehousePackage[]>(() =>
    // Copia antes de ordenar: el array del servicio nunca se modifica.
    [...this.packageService.packages()].sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        a.timestamp.getTime() - b.timestamp.getTime(),
    ),
  );

  /** Paquetes que cumplen el filtro de prioridad y la búsqueda parcial por código (sin distinguir mayúsculas). */
  readonly visiblePackages = computed<readonly WarehousePackage[]>(() => {
    const priority = this.priorityFilter();
    const term = this.normalizedTerm();
    return this.packages().filter(
      (pkg) =>
        (priority === 'ALL' || pkg.priority === priority) &&
        (term === '' || pkg.trackingCode.toLowerCase().includes(term)),
    );
  });

  /** Indica si algún filtro está reduciendo la lista. */
  readonly hasActiveFilters = computed(() => this.priorityFilter() !== 'ALL' || this.normalizedTerm() !== '');

  readonly resultCount = computed(() => this.visiblePackages().length);
  readonly resultCountLabel = computed(() => {
    const count = this.resultCount();
    return `${count} ${count === 1 ? 'paquete' : 'paquetes'}`;
  });

  /** Recuentos globales por estado (no dependen de los filtros). */
  readonly statusCounts = this.packageService.statusCounts;

  readonly statuses = PACKAGE_STATUSES;
  readonly priorities = PACKAGE_PRIORITIES;
  readonly statusDisplay = STATUS_DISPLAY;
  readonly priorityDisplay = PRIORITY_DISPLAY;

  /** Toast de confirmación tras un cambio de estado. */
  readonly toastOpen = signal(false);
  readonly toastMessage = signal('');

  constructor() {
    addIcons({ checkmarkCircleOutline, closeCircleOutline, fileTrayOutline });
  }

  /** Aplica la prioridad elegida en el segmento; ignora valores no válidos. */
  onPriorityChange(event: SegmentCustomEvent): void {
    const value = event.detail.value;
    if (isPriorityFilter(value)) {
      this.priorityFilter.set(value);
    }
  }

  /** Restablece búsqueda y filtro de prioridad. */
  clearFilters(): void {
    this.searchTerm.set('');
    this.priorityFilter.set('ALL');
  }

  /**
   * Único punto que escribe en el servicio: lo usan las tarjetas (`statusChange`) y las opciones deslizantes.
   * Solo confirma con un toast si el estado cambió de verdad.
   */
  onStatusChange(event: StatusChangeEvent): void {
    const pkg = this.packageService.packages().find((item) => item.id === event.id);
    if (!pkg || !this.packageService.updateStatus(event.id, event.newStatus)) {
      return;
    }
    this.toastMessage.set(`${pkg.trackingCode} marcado como ${STATUS_DISPLAY[event.newStatus].label}`);
    this.toastOpen.set(true);
  }

  /** Opción deslizante: cierra el item y delega en `onStatusChange`. */
  async onSlidingOption(id: string, newStatus: PackageStatus, slidingItem: IonItemSliding): Promise<void> {
    await slidingItem.close();
    this.onStatusChange({ id, newStatus });
  }

  /** El toast se cerró (por tiempo o gesto): se sincroniza el estado para poder volver a abrirlo. */
  onToastDismiss(): void {
    this.toastOpen.set(false);
  }
}
