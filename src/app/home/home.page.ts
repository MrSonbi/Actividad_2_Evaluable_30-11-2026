import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
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
import { checkmarkCircleOutline, closeCircleOutline, fileTrayOutline, pauseOutline, playOutline } from 'ionicons/icons';
import type { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { PackageCardComponent } from '../components/package-card/package-card.component';
import { ShiftToggleComponent } from '../components/shift-toggle/shift-toggle.component';
import { PACKAGE_PRIORITIES, PACKAGE_STATUSES } from '../models/package.model';
import type { PackagePriority, PackageStatus, StatusChangeEvent, WarehousePackage } from '../models/package.model';
import { MotionService } from '../services/motion.service';
import { PackageService } from '../services/package.service';
import { ThemeService } from '../services/theme.service';
import type { Shift } from '../services/theme.service';
import { PRIORITY_DISPLAY, PRIORITY_ORDER, STATUS_DISPLAY, STATUS_ORDER } from '../shared/package-display';

/** Nombre accesible del input interno de ion-searchbar. */
export const SEARCH_INPUT_LABEL = 'Buscar paquete por código de seguimiento';

/**
 * Duración de la entrada escalonada de las tarjetas en el primer render (ms): 10 escalones de 40 ms + 280 ms de
 * animación, con margen. Después se retira la clase y las tarjetas que aparecen (filtros) ya no se animan.
 */
export const INTRO_MS = 720;

/** Espera tras la última pulsación antes de lanzar la búsqueda (ms). */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Último resultado de búsqueda aplicado.
 * `ids` es `null` cuando el término está vacío (no se filtra por búsqueda).
 */
export interface SearchResult {
  readonly term: string;
  readonly ids: ReadonlySet<string> | null;
}

/** Resultado inicial: sin búsqueda. */
const NO_SEARCH: SearchResult = { term: '', ids: null };

/** Normaliza el texto del buscador: sin espacios en los extremos y en minúsculas. */
export function normalizeSearchTerm(term: string): string {
  return term.trim().toLowerCase();
}

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
    ShiftToggleComponent,
  ],
})
export class HomePage {
  private readonly packageService = inject(PackageService);
  private readonly themeService = inject(ThemeService);
  private readonly motion = inject(MotionService);

  /** Modo elegido (Claro / Oscuro): el selector lo marca desde el clic, aunque la transición siga en curso. */
  readonly shift = this.themeService.selectedShift;

  /** Fondo animado en pausa (WCAG 2.2.2). */
  readonly backgroundPaused = this.motion.backgroundPaused;
  /**
   * El botón de pausa solo aparece si hay algo que pausar: con la niebla WebGL funcionando y sin reduced motion
   * (con reduced motion el fondo ya está quieto y reanudarlo no tendría efecto).
   */
  readonly showMotionToggle = computed(() => this.motion.backgroundAvailable() && !this.motion.reducedMotion());
  readonly motionToggleLabel = computed(() => (this.backgroundPaused() ? 'Reanudar fondo' : 'Pausar fondo'));
  readonly motionToggleIcon = computed(() => (this.backgroundPaused() ? 'play-outline' : 'pause-outline'));

  /** Entrada escalonada de las tarjetas: solo durante el primer render. */
  readonly introActive = signal(true);

  /** Buscador de la cabecera; se usa solo para dar nombre accesible a su input interno. */
  private readonly searchbar = viewChild.required(IonSearchbar);

  /** Texto escrito en el buscador (enlazado con ngModel). */
  readonly searchTerm = signal('');
  /** Prioridad seleccionada en el segmento. */
  readonly priorityFilter = signal<PriorityFilter>('ALL');

  /** Término normalizado actual (sin esperar al debounce). */
  private readonly normalizedTerm = computed(() => normalizeSearchTerm(this.searchTerm()));

  /**
   * Búsqueda reactiva: del texto escrito al último resultado aplicado.
   * Se declara como inicializador de campo (contexto de inyección): `toSignal` se suscribe una sola vez y se
   * desuscribe solo al destruirse la página, sin `subscribe()` manual. Al ser un signal, todos los consumidores
   * comparten esta única suscripción (no se duplica el pipeline por cada lectura).
   */
  private readonly searchResult = toSignal(
    toObservable(this.searchTerm).pipe(
      // Mismo criterio de normalización que `normalizedTerm`: "  LTK " y "ltk" son el mismo término.
      map(normalizeSearchTerm),
      // Espera a que el usuario deje de teclear: una ráfaga de pulsaciones produce una sola búsqueda.
      debounceTime(SEARCH_DEBOUNCE_MS),
      // No repite la búsqueda si el término normalizado no ha cambiado.
      distinctUntilChanged(),
      // Cancela la búsqueda en curso al llegar un término nuevo: una respuesta antigua nunca pisa a la reciente.
      switchMap((term): Observable<SearchResult> =>
        term
          ? this.packageService.searchTrackingCodes(term).pipe(map((ids) => ({ term, ids })))
          : of({ term, ids: null }),
      ),
    ),
    { initialValue: NO_SEARCH },
  );

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

  /**
   * Paquetes que cumplen el filtro de prioridad y la búsqueda por código.
   * Parte siempre de los paquetes EN VIVO del servicio y solo usa los ids del último resultado aplicado, así que
   * un cambio de estado se refleja al momento. Con el buscador vacío no se filtra por búsqueda (sin esperar).
   */
  readonly visiblePackages = computed<readonly WarehousePackage[]>(() => {
    const priority = this.priorityFilter();
    const matchingIds = this.normalizedTerm() === '' ? null : this.searchResult().ids;
    return this.packages().filter(
      (pkg) => (priority === 'ALL' || pkg.priority === priority) && (matchingIds === null || matchingIds.has(pkg.id)),
    );
  });

  /** Hay un término escrito cuyo resultado todavía no se ha aplicado (debounce o búsqueda en curso). */
  readonly isSearching = computed(() => {
    const term = this.normalizedTerm();
    return term !== '' && term !== this.searchResult().term;
  });

  /** Indica si algún filtro está reduciendo la lista. */
  readonly hasActiveFilters = computed(() => this.priorityFilter() !== 'ALL' || this.normalizedTerm() !== '');

  readonly resultCount = computed(() => this.visiblePackages().length);
  readonly resultCountLabel = computed(() => {
    const count = this.resultCount();
    return `${count} ${count === 1 ? 'paquete' : 'paquetes'}`;
  });

  /**
   * Texto de la región role="status". Queda vacío mientras se busca (vaciarla no se anuncia) y recibe el
   * recuento al aplicarse el resultado: un único anuncio por búsqueda, nunca uno por tecla (M8).
   */
  readonly resultAnnouncement = computed(() => (this.isSearching() ? '' : this.resultCountLabel()));

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
    addIcons({ checkmarkCircleOutline, closeCircleOutline, fileTrayOutline, pauseOutline, playOutline });

    // Fin de la entrada escalonada; el temporizador se cancela si la página se destruye antes.
    let introTimer: ReturnType<typeof setTimeout> | undefined;
    afterNextRender(() => {
      introTimer = setTimeout(() => this.introActive.set(false), INTRO_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(introTimer));

    // ion-searchbar 9.0.12 no traslada el aria-label del host a su input y le fija "search text" (inglés).
    // Se corrige una sola vez tras el primer render con la API pública getInputElement(): no hay suscripciones
    // ni listeners que liberar. Stencil no vuelve a escribir el atributo porque su valor en el vDOM no cambia.
    afterNextRender(() => {
      void this.labelSearchInput();
    });
  }

  /** Nombre accesible en español para el input interno del buscador (WCAG 3.1.2 / 2.5.3). */
  private async labelSearchInput(): Promise<void> {
    const input = await this.searchbar().getInputElement();
    input.setAttribute('aria-label', SEARCH_INPUT_LABEL);
  }

  /** Aplica la prioridad elegida en el segmento; ignora valores no válidos. */
  onPriorityChange(event: SegmentCustomEvent): void {
    const value = event.detail.value;
    if (isPriorityFilter(value)) {
      this.priorityFilter.set(value);
    }
  }

  /** El operario cambia de turno en el selector de la cabecera. */
  onShiftChange(shift: Shift): void {
    this.themeService.requestShift(shift);
  }

  /** Botón «Pausar fondo» / «Reanudar fondo». */
  toggleBackground(): void {
    this.motion.toggleBackgroundPaused();
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
