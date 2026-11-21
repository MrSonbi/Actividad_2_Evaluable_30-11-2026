/**
 * Reloj: Vitest fake timers. `debounceTime` y `delay` usan el `asyncScheduler` de RxJS (setInterval) y el
 * planificador zoneless de Angular usa setTimeout/rAF; todo queda bajo el reloj simulado. Por eso no se usa
 * `fixture.whenStable()` (esperaría a timers que nadie avanza): `settle()` avanza el reloj y sincroniza la vista.
 */
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { Observable } from 'rxjs';
import { delay, finalize, of, tap } from 'rxjs';

import { MOTION_PAUSED_STORAGE_KEY, MotionService } from '../services/motion.service';
import { PackageService, SEARCH_LATENCY_MS } from '../services/package.service';
import { NIGHT_CLASS, SHIFT_STORAGE_KEY, ThemeService } from '../services/theme.service';

import { HomePage, INTRO_MS, SEARCH_DEBOUNCE_MS, SEARCH_INPUT_LABEL, isPriorityFilter } from './home.page';

/** Tiempo hasta que se aplica una búsqueda con la latencia normal del servicio. */
const SEARCH_SETTLE_MS = SEARCH_DEBOUNCE_MS + SEARCH_LATENCY_MS;

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let host: HTMLElement;

  /** El turno vive en <html> y en localStorage: se limpia para que no pase de un test a otro. */
  function resetShift(): void {
    localStorage.removeItem(SHIFT_STORAGE_KEY);
    localStorage.removeItem(MOTION_PAUSED_STORAGE_KEY);
    document.documentElement.classList.remove(NIGHT_CLASS);
  }

  beforeEach(async () => {
    resetShift();
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [HomePage] }).compileComponents();
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    await settle();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetShift();
    // Los toasts presentados quedan en document.body; se retiran para que no pasen de un test a otro.
    for (const el of Array.from(document.body.querySelectorAll(':scope > ion-toast'))) {
      el.remove();
    }
  });

  /** Avanza el reloj simulado (timers y microtareas) y sincroniza la vista si la página sigue viva. */
  async function settle(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    if (!fixture.componentRef.hostView.destroyed) {
      fixture.detectChanges();
    }
  }

  function packageCards(): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('app-package-card'));
  }

  /** Tarjeta que muestra el código indicado. */
  function cardFor(trackingCode: string): HTMLElement {
    const card = packageCards().find((el) => el.querySelector('.package__code')?.textContent?.trim() === trackingCode);
    if (!card) throw new Error(`Tarjeta ${trackingCode} no encontrada`);
    return card;
  }

  function buttonIn(root: HTMLElement, text: string): HTMLIonButtonElement {
    const button = Array.from(root.querySelectorAll('ion-button')).find((el) => el.textContent?.includes(text));
    if (!button) throw new Error(`Botón "${text}" no encontrado`);
    return button;
  }

  /**
   * ion-toast de la página. Se obtiene antes de abrirlo: al presentarse, Ionic lo traslada a `document.body`,
   * así que la referencia se guarda mientras sigue dentro de la página.
   */
  function toast(): HTMLIonToastElement {
    const el = host.querySelector('ion-toast');
    if (!el) throw new Error('ion-toast no encontrado');
    return el;
  }

  function slidingItems(): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('ion-item-sliding'));
  }

  /** Códigos de seguimiento tal como aparecen en el DOM, en orden. */
  function renderedCodes(): string[] {
    return Array.from(host.querySelectorAll('.package__code'), (el) => el.textContent?.trim() ?? '');
  }

  function searchbar(): HTMLIonSearchbarElement {
    const el = host.querySelector('ion-searchbar');
    if (!el) throw new Error('ion-searchbar no encontrado');
    return el;
  }

  /**
   * Simula la escritura en ion-searchbar: el value accessor de Ionic escucha `ionInput` y lee `target.value`,
   * que es exactamente lo que hace el componente real al teclear. Solo sincroniza la vista (sin avanzar el reloj):
   * cada test decide cuánto tiempo pasa.
   */
  async function typeInSearchbar(value: string): Promise<void> {
    const el = searchbar();
    el.value = value;
    el.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
    await settle();
  }

  /** Escribe un término y espera a que su resultado se aplique (debounce + latencia del servicio). */
  async function searchFor(value: string): Promise<void> {
    await typeInSearchbar(value);
    await settle(SEARCH_SETTLE_MS);
  }

  /** Texto de la región viva (role="status") que anuncia el recuento. */
  function announcedText(): string {
    return host.querySelector('[role="status"]')?.textContent?.trim() ?? '';
  }

  function searchingIndicator(): Element | null {
    return host.querySelector('.result-count__searching');
  }

  /** Etiquetas de los hijos directos de ion-list (en minúsculas). */
  function listChildTags(): string[] {
    const list = host.querySelector('ion-list');
    if (!list) throw new Error('ion-list no encontrado');
    return Array.from(list.children, (el) => el.tagName.toLowerCase());
  }

  /** Simula la selección en ion-segment emitiendo `ionChange` desde el propio elemento. */
  async function selectSegment(value: string): Promise<void> {
    const el = host.querySelector('ion-segment');
    if (!el) throw new Error('ion-segment no encontrado');
    el.dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
    await settle();
  }

  describe('render básico', () => {
    it('se crea', () => {
      expect(component).toBeTruthy();
    });

    it('renderiza un ion-item-sliding por paquete (12)', () => {
      expect(slidingItems()).toHaveLength(12);
      expect(host.querySelector('.result-count')?.textContent).toContain('12 paquetes');
    });

    it('muestra primero un paquete de prioridad crítica', () => {
      expect(component.packages()[0].priority).toBe('CRITICAL');
      expect(slidingItems()[0].textContent).toContain('Crítica');
    });

    it('muestra las etiquetas en español', () => {
      const text = host.textContent ?? '';
      for (const label of ['En tránsito', 'Inspeccionado', 'Rechazado', 'Crítica', 'Estándar', 'Baja', 'Todas']) {
        expect(text).toContain(label);
      }
      expect(text).toContain('Carga pesada');
    });

    it('renderiza un app-package-card por paquete (12)', () => {
      expect(packageCards()).toHaveLength(12);
    });

    it('solo ofrece acciones deslizantes en los paquetes en tránsito (6)', () => {
      expect(host.querySelectorAll('ion-item-options')).toHaveLength(6);
    });
  });

  describe('orden de la cola', () => {
    it('los 6 IN_TRANSIT van primero y, dentro, los CRITICAL primero', () => {
      const queue = component.packages();
      const pending = queue.slice(0, 6);

      expect(pending.every((pkg) => pkg.status === 'IN_TRANSIT')).toBe(true);
      expect(queue.slice(6).every((pkg) => pkg.status !== 'IN_TRANSIT')).toBe(true);
      expect(pending.map((pkg) => pkg.priority)).toEqual([
        'CRITICAL',
        'CRITICAL',
        'STANDARD',
        'STANDARD',
        'STANDARD',
        'LOW',
      ]);
      // A igualdad de prioridad, el más antiguo primero.
      expect(pending[0].timestamp.getTime()).toBeLessThan(pending[1].timestamp.getTime());
      expect(renderedCodes().slice(0, 2)).toEqual(['LTK-1634-ES', 'LTK-1968-ES']);
    });

    it('no modifica el array del servicio al ordenar', () => {
      const service = TestBed.inject(PackageService);
      const original = service.packages();
      const snapshot = [...original];

      component.packages();

      expect(service.packages()).toBe(original);
      expect(original).toEqual(snapshot);
    });
  });

  describe('filtro por prioridad', () => {
    it('muestra solo CRITICAL y vuelve a todas con ALL', async () => {
      await selectSegment('CRITICAL');

      expect(component.priorityFilter()).toBe('CRITICAL');
      expect(component.visiblePackages().every((pkg) => pkg.priority === 'CRITICAL')).toBe(true);
      expect(slidingItems()).toHaveLength(4);
      expect(host.querySelector('.result-count')?.textContent).toContain('4 paquetes');

      await selectSegment('ALL');

      expect(component.priorityFilter()).toBe('ALL');
      expect(slidingItems()).toHaveLength(12);
    });

    it('onPriorityChange ignora un valor no válido', async () => {
      await selectSegment('LOW');
      await selectSegment('URGENT');

      expect(component.priorityFilter()).toBe('LOW');
    });

    it('isPriorityFilter acepta solo prioridades conocidas y ALL', () => {
      expect(isPriorityFilter('ALL')).toBe(true);
      expect(isPriorityFilter('CRITICAL')).toBe(true);
      expect(isPriorityFilter('URGENT')).toBe(false);
      expect(isPriorityFilter(undefined)).toBe(false);
      expect(isPriorityFilter(1)).toBe(false);
    });
  });

  describe('búsqueda por trackingCode', () => {
    it.each(['1042', 'ltk-10', '  LTK-1042-es  '])('"%s" encuentra LTK-1042-ES', async (term) => {
      await searchFor(term);

      expect(component.searchTerm()).toBe(term);
      expect(renderedCodes()).toEqual(['LTK-1042-ES']);
      expect(host.querySelector('.result-count')?.textContent).toContain('1 paquete');
      expect(host.querySelector('.result-count')?.textContent).not.toContain('paquetes');
    });

    it('un término inexistente da 0 resultados', async () => {
      await searchFor('9999');

      expect(component.resultCount()).toBe(0);
      expect(slidingItems()).toHaveLength(0);
    });

    it('un término solo con espacios no filtra', async () => {
      await typeInSearchbar('   ');

      expect(component.hasActiveFilters()).toBe(false);
      expect(slidingItems()).toHaveLength(12);
    });

    it('se combina con el filtro de prioridad', async () => {
      await searchFor('20');
      expect(renderedCodes().sort()).toEqual(['LTK-1203-ES', 'LTK-2013-ES']);

      await selectSegment('STANDARD');
      expect(renderedCodes()).toEqual(['LTK-2013-ES']);
    });
  });

  describe('estado vacío', () => {
    it('con filtros activos ofrece limpiarlos y al pulsar vuelven los 12', async () => {
      await selectSegment('LOW');
      await searchFor('no-existe');

      expect(host.textContent).toContain('Ningún paquete coincide con los filtros');
      expect(host.textContent).not.toContain('No hay paquetes que mostrar');
      expect(host.querySelector('.result-count')?.textContent).toContain('0 paquetes');

      const button = host.querySelector<HTMLElement>('.empty-state ion-button');
      expect(button?.textContent).toContain('Limpiar filtros');
      button?.click();
      await settle();

      expect(component.searchTerm()).toBe('');
      expect(component.priorityFilter()).toBe('ALL');
      expect(slidingItems()).toHaveLength(12);
      // ngModel devuelve el valor vacío al ion-searchbar.
      expect(searchbar().value).toBe('');
    });

    it('el mensaje y el botón van dentro de un ion-item y ion-list solo tiene elementos de lista', async () => {
      await searchFor('9999');

      const item = host.querySelector('ion-list > ion-item');
      expect(item).not.toBeNull();
      expect(item?.textContent).toContain('Ningún paquete coincide con los filtros');
      expect(item?.querySelector('ion-button')?.textContent).toContain('Limpiar filtros');
      expect(listChildTags()).toEqual(['ion-item']);
    });

    it('sin filtros y con lista, ion-list solo contiene ion-item-sliding', () => {
      const tags = listChildTags();

      expect(tags).toHaveLength(12);
      expect(tags.every((tag) => tag === 'ion-item-sliding')).toBe(true);
    });
  });

  describe('accesibilidad', () => {
    it('tiene exactamente un h1 con el nombre de la app, dentro de ion-title', () => {
      const headings = host.querySelectorAll('h1');

      expect(headings).toHaveLength(1);
      expect(headings[0].textContent?.trim()).toBe('LogiTrack Express');
      expect(headings[0].closest('ion-title')).not.toBeNull();
    });

    it('las tarjetas siguen usando h2 para el código de seguimiento', () => {
      const cardHeadings = host.querySelectorAll('app-package-card h2.package__code');

      expect(cardHeadings).toHaveLength(12);
      expect(host.querySelectorAll('app-package-card h1')).toHaveLength(0);
    });

    it('el input interno del buscador recibe un aria-label en español', async () => {
      const input = await searchbar().getInputElement();

      await vi.waitFor(() => expect(input.getAttribute('aria-label')).toBe(SEARCH_INPUT_LABEL));
    });
  });

  describe('botón de pausa del fondo (WCAG 2.2.2)', () => {
    function motionToggle(): HTMLIonButtonElement | null {
      return host.querySelector('ion-button.motion-toggle');
    }

    /** Icono del botón: `[name]` se enlaza como propiedad de ion-icon (no se refleja como atributo). */
    function iconName(button: HTMLIonButtonElement): string | undefined {
      return button.querySelector('ion-icon')?.name;
    }

    /**
     * Es un botón de acción cuyo texto cambia, así que no debe exponer aria-pressed (ni en el host ni en el
     * <button> interno al que Ionic traslada los atributos ARIA).
     */
    function expectNoPressedState(button: HTMLIonButtonElement): void {
      expect(button.hasAttribute('aria-pressed')).toBe(false);
      expect(button.shadowRoot?.querySelector('button')?.hasAttribute('aria-pressed') ?? false).toBe(false);
    }

    it('no aparece si no hay atmósfera WebGL (nada que pausar)', () => {
      expect(motionToggle()).toBeNull();
    });

    it('con la atmósfera en marcha: texto e icono cambian, sin aria-pressed, y la elección se guarda', async () => {
      const motion = TestBed.inject(MotionService);
      motion.setBackgroundAvailable(true);
      await settle();
      const button = motionToggle();
      if (!button) throw new Error('Botón de pausa no encontrado');
      expect(button.textContent?.trim()).toBe('Pausar fondo');
      expect(iconName(button)).toBe('pause-outline');
      expectNoPressedState(button);
      expect(button.closest('.list-header')).not.toBeNull(); // en la fila del recuento, no en la cabecera
      expect(button.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');

      button.click();
      await settle();

      expect(motion.backgroundPaused()).toBe(true);
      expect(button.textContent?.trim()).toBe('Reanudar fondo');
      expect(iconName(button)).toBe('play-outline');
      expectNoPressedState(button);
      expect(localStorage.getItem(MOTION_PAUSED_STORAGE_KEY)).toBe('true');

      button.click();
      await settle();
      expect(motion.backgroundPaused()).toBe(false);
      expect(button.textContent?.trim()).toBe('Pausar fondo');
      expect(iconName(button)).toBe('pause-outline');
      expectNoPressedState(button);
      expect(localStorage.getItem(MOTION_PAUSED_STORAGE_KEY)).toBe('false');
    });
  });

  describe('entrada escalonada', () => {
    it('solo en el primer render: la clase se retira tras INTRO_MS y cada fila lleva su índice', async () => {
      const list = host.querySelector('ion-list');
      expect(list?.classList).toContain('package-list--intro');
      expect(slidingItems()[3].style.getPropertyValue('--i')).toBe('3');

      await settle(INTRO_MS);

      expect(list?.classList).not.toContain('package-list--intro');
    });
  });

  describe('selector de turno', () => {
    function shiftButton(text: string): HTMLButtonElement {
      const el = Array.from(host.querySelectorAll('app-shift-toggle button')).find((b) =>
        b.textContent?.includes(text),
      );
      if (!(el instanceof HTMLButtonElement)) throw new Error(`Botón de turno "${text}" no encontrado`);
      return el;
    }

    it('está en la primera toolbar de la cabecera, al final', () => {
      const toggle = host.querySelector('app-shift-toggle');

      expect(toggle).not.toBeNull();
      expect(toggle?.closest('ion-header')).not.toBeNull();
      expect(toggle?.closest('ion-toolbar')).toBe(host.querySelector('ion-header ion-toolbar'));
      expect(toggle?.getAttribute('slot')).toBe('end');
      expect(toggle?.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Modo de visualización');
    });

    it('cambia la clase del <html>, el servicio y aria-pressed al pulsar Oscuro y después Claro', async () => {
      const theme = TestBed.inject(ThemeService);
      const html = document.documentElement;
      expect(theme.shift()).toBe('day');
      expect(html.classList).not.toContain(NIGHT_CLASS);

      shiftButton('Oscuro').click();
      TestBed.tick();
      await settle();

      expect(theme.shift()).toBe('night');
      expect(html.classList).toContain(NIGHT_CLASS);
      expect(localStorage.getItem(SHIFT_STORAGE_KEY)).toBe('night');
      expect(shiftButton('Oscuro').getAttribute('aria-pressed')).toBe('true');
      expect(shiftButton('Claro').getAttribute('aria-pressed')).toBe('false');

      shiftButton('Claro').click();
      TestBed.tick();
      await settle();

      expect(html.classList).not.toContain(NIGHT_CLASS);
      expect(shiftButton('Claro').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('cambios de estado', () => {
    it('refleja en el DOM el cambio de estado hecho en el servicio', async () => {
      const service = TestBed.inject(PackageService);
      const target = component.packages()[0];
      expect(target.status).toBe('IN_TRANSIT');

      expect(service.updateStatus(target.id, 'REJECTED')).toBe(true);
      await settle();

      const row = slidingItems().find((el) => el.textContent?.includes(target.trackingCode));
      expect(row).toBeDefined();
      expect(row?.textContent).toContain('Rechazado');
      expect(row?.querySelector('app-package-card')?.classList).toContain('package-card--rejected');
      expect(row?.querySelector('ion-item-options')).toBeNull();
    });

    it('tras updateStatus el paquete sale del grupo de pendientes y cambia el recuento global', async () => {
      const service = TestBed.inject(PackageService);
      const target = component.packages()[0];

      service.updateStatus(target.id, 'INSPECTED');
      await settle();

      const queue = component.packages();
      expect(queue.slice(0, 5).every((pkg) => pkg.status === 'IN_TRANSIT')).toBe(true);
      expect(queue.slice(0, 5).some((pkg) => pkg.id === target.id)).toBe(false);
      expect(component.statusCounts()).toEqual({ IN_TRANSIT: 5, INSPECTED: 4, REJECTED: 3 });
      expect(host.textContent).toContain('En tránsito: 5');
      expect(host.textContent).toContain('Inspeccionado: 4');
    });

    it('los recuentos globales no dependen de los filtros', async () => {
      await selectSegment('LOW');

      expect(component.statusCounts()).toEqual({ IN_TRANSIT: 6, INSPECTED: 3, REJECTED: 3 });
      expect(host.textContent).toContain('En tránsito: 6');
    });

    it('pulsar "Rechazar" en una tarjeta actualiza el servicio, el DOM y el resumen', async () => {
      const service = TestBed.inject(PackageService);
      const target = component.packages()[0];
      expect(target.status).toBe('IN_TRANSIT');

      buttonIn(cardFor(target.trackingCode), 'Rechazar').click();
      await settle();

      expect(service.packages().find((pkg) => pkg.id === target.id)?.status).toBe('REJECTED');
      const card = cardFor(target.trackingCode);
      expect(card.classList).toContain('package-card--rejected');
      expect(card.textContent).toContain('Rechazado');
      expect(buttonIn(card, 'Rechazar').disabled).toBe(true);
      expect(card.closest('ion-item-sliding')?.querySelector('ion-item-options')).toBeNull();
      expect(component.statusCounts()).toEqual({ IN_TRANSIT: 5, INSPECTED: 3, REJECTED: 4 });
      expect(host.textContent).toContain('En tránsito: 5');
      expect(host.textContent).toContain('Rechazado: 4');
    });

    it('la opción deslizante cierra el item y delega en onStatusChange', async () => {
      const service = TestBed.inject(PackageService);
      const target = component.packages()[0];
      const onStatusChange = vi.spyOn(component, 'onStatusChange');
      const updateStatus = vi.spyOn(service, 'updateStatus');

      const sliding = cardFor(target.trackingCode).closest('ion-item-sliding');
      const option = Array.from(sliding?.querySelectorAll<HTMLElement>('ion-item-option') ?? []).find((el) =>
        el.textContent?.includes('Inspeccionar'),
      );
      expect(option).toBeDefined();
      option?.click();
      await vi.waitFor(() => expect(onStatusChange).toHaveBeenCalledOnce());
      await settle();

      expect(onStatusChange).toHaveBeenCalledWith({ id: target.id, newStatus: 'INSPECTED' });
      expect(updateStatus).toHaveBeenCalledOnce();
      expect(cardFor(target.trackingCode).classList).toContain('package-card--inspected');
    });
  });

  describe('toast de confirmación', () => {
    it('está cerrado al inicio', () => {
      expect(component.toastOpen()).toBe(false);
      expect(toast().isOpen).toBe(false);
    });

    it('se abre con el código y la etiqueta del nuevo estado tras un cambio', async () => {
      const target = component.packages().find((pkg) => pkg.trackingCode === 'LTK-1634-ES');
      expect(target?.status).toBe('IN_TRANSIT');

      const toastEl = toast();
      buttonIn(cardFor('LTK-1634-ES'), 'Inspeccionar').click();
      await settle();

      expect(component.toastOpen()).toBe(true);
      expect(component.toastMessage()).toBe('LTK-1634-ES marcado como Inspeccionado');
      expect(toastEl.isOpen).toBe(true);
      expect(toastEl.message).toBe('LTK-1634-ES marcado como Inspeccionado');
      expect(toastEl.duration).toBe(4000);
      expect(toastEl.position).toBe('bottom');
    });

    it('no se abre si el estado no cambia o el id no existe', async () => {
      const service = TestBed.inject(PackageService);
      const inspected = component.packages().find((pkg) => pkg.status === 'INSPECTED');
      expect(inspected).toBeDefined();
      const before = service.packages();

      component.onStatusChange({ id: inspected?.id ?? '', newStatus: 'INSPECTED' });
      component.onStatusChange({ id: 'no-existe', newStatus: 'REJECTED' });
      await settle();

      expect(service.packages()).toBe(before);
      expect(component.toastOpen()).toBe(false);
      expect(toast().isOpen).toBe(false);
    });

    it('didDismiss lo marca como cerrado', async () => {
      const toastEl = toast();
      buttonIn(cardFor('LTK-1634-ES'), 'Rechazar').click();
      await settle();
      expect(component.toastOpen()).toBe(true);

      toastEl.dispatchEvent(new CustomEvent('didDismiss'));
      await settle();

      expect(component.toastOpen()).toBe(false);
    });
  });

  describe('búsqueda reactiva con RxJS (corrige ia/original)', () => {
    let service: PackageService;

    beforeEach(() => {
      service = TestBed.inject(PackageService);
    });

    function idOf(trackingCode: string): string {
      const pkg = service.packages().find((item) => item.trackingCode === trackingCode);
      if (!pkg) throw new Error(`Paquete ${trackingCode} no encontrado`);
      return pkg.id;
    }

    /** Respuesta simulada de búsqueda con la latencia indicada (sustituto controlable de searchTrackingCodes). */
    function idsWithLatency(term: string, ms: number): Observable<ReadonlySet<string>> {
      const ids: ReadonlySet<string> = new Set(
        service
          .packages()
          .filter((pkg) => pkg.trackingCode.toLowerCase().includes(term))
          .map((pkg) => pkg.id),
      );
      return of(ids).pipe(delay(ms));
    }

    it('1. la lista no se filtra antes de los 300 ms de debounce y sí cuando llega el resultado', async () => {
      const search = vi.spyOn(service, 'searchTrackingCodes');
      await typeInSearchbar('1042');

      await settle(SEARCH_DEBOUNCE_MS - 1);
      expect(search).not.toHaveBeenCalled();
      expect(slidingItems()).toHaveLength(12);

      await settle(1);
      expect(search).toHaveBeenCalledExactlyOnceWith('1042');
      expect(slidingItems()).toHaveLength(12); // la "petición" sigue en curso

      await settle(SEARCH_LATENCY_MS);
      expect(renderedCodes()).toEqual(['LTK-1042-ES']);
    });

    it('2. escribir rápido varios caracteres provoca una sola llamada a searchTrackingCodes (debounceTime)', async () => {
      const search = vi.spyOn(service, 'searchTrackingCodes');

      for (const partial of ['l', 'lt', 'ltk', 'ltk-', 'ltk-1', 'ltk-10', 'ltk-104']) {
        await typeInSearchbar(partial);
        await settle(100); // menos que la ventana de debounce
      }
      await settle(SEARCH_SETTLE_MS);

      expect(search).toHaveBeenCalledExactlyOnceWith('ltk-104');
      expect(renderedCodes()).toEqual(['LTK-1042-ES']);
    });

    it('3. repetir el mismo término normalizado (espacios o mayúsculas) no provoca otra llamada (distinctUntilChanged)', async () => {
      const search = vi.spyOn(service, 'searchTrackingCodes');
      await searchFor('ltk-1042');
      expect(search).toHaveBeenCalledOnce();

      await searchFor('  LTK-1042 ');
      await searchFor('Ltk-1042');

      expect(search).toHaveBeenCalledOnce();
      expect(component.isSearching()).toBe(false);
      expect(renderedCodes()).toEqual(['LTK-1042-ES']);
    });

    it('4. con una primera búsqueda lenta y una segunda rápida, el resultado final es el del último término (switchMap)', async () => {
      const latencies = [1000, 50];
      const search = vi
        .spyOn(service, 'searchTrackingCodes')
        .mockImplementation((term) => idsWithLatency(term, latencies.shift() ?? 0));

      await typeInSearchbar('1042');
      await settle(SEARCH_DEBOUNCE_MS + 100); // la respuesta lenta de "1042" está en vuelo
      await typeInSearchbar('1187');
      await settle(SEARCH_DEBOUNCE_MS + 50);
      expect(renderedCodes()).toEqual(['LTK-1187-ES']);

      await settle(5_000); // tiempo de sobra para que la respuesta antigua hubiera llegado
      expect(search).toHaveBeenCalledTimes(2);
      expect(renderedCodes()).toEqual(['LTK-1187-ES']);
    });

    it('5. con una búsqueda activa, updateStatus() se refleja al momento en la lista filtrada (corrige c1)', async () => {
      await searchFor('1634');
      expect(renderedCodes()).toEqual(['LTK-1634-ES']);
      expect(cardFor('LTK-1634-ES').textContent).toContain('En tránsito');
      const search = vi.spyOn(service, 'searchTrackingCodes');

      expect(service.updateStatus(idOf('LTK-1634-ES'), 'REJECTED')).toBe(true);
      await settle(); // sin avanzar el reloj ni repetir la búsqueda

      const card = cardFor('LTK-1634-ES');
      expect(card.textContent).toContain('Rechazado');
      expect(card.classList).toContain('package-card--rejected');
      expect(search).not.toHaveBeenCalled();
    });

    it('6. la lista completa aparece en el primer render sin esperar al debounce (corrige d1)', () => {
      // beforeEach solo ha creado la página y sincronizado la vista: el reloj no ha avanzado.
      expect(slidingItems()).toHaveLength(12);
      expect(announcedText()).toBe('12 paquetes');
      expect(searchingIndicator()).toBeNull();
      expect(component.isSearching()).toBe(false);
    });

    it('7. al limpiar filtros, la lista completa vuelve sin esperar', async () => {
      await selectSegment('LOW');
      await searchFor('1042');
      expect(slidingItems()).toHaveLength(0);
      const search = vi.spyOn(service, 'searchTrackingCodes');

      component.clearFilters();
      await settle(); // sin avanzar el reloj

      expect(slidingItems()).toHaveLength(12);
      expect(announcedText()).toBe('12 paquetes');
      expect(search).not.toHaveBeenCalled();
    });

    it('8. mientras la búsqueda está pendiente se ve "Buscando…" y el recuento solo se anuncia al aplicarse (M8)', async () => {
      expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(announcedText()).toBe('12 paquetes');

      for (const partial of ['1', '10', '104', '1042']) {
        await typeInSearchbar(partial);
        // Indicador visual fuera de la región viva; la región queda vacía (vaciarla no se anuncia).
        expect(searchingIndicator()?.textContent?.trim()).toBe('Buscando…');
        expect(searchingIndicator()?.closest('[role="status"]')).toBeNull();
        expect(announcedText()).toBe('');
        await settle(100);
      }

      await settle(SEARCH_DEBOUNCE_MS); // debounce cumplido, petición en curso
      expect(searchingIndicator()).not.toBeNull();
      expect(announcedText()).toBe('');

      await settle(SEARCH_LATENCY_MS);
      expect(searchingIndicator()).toBeNull();
      expect(announcedText()).toBe('1 paquete');
    });

    it('9. tras destruir la página, cambiar el término y avanzar el reloj no llama a searchTrackingCodes (sin fugas)', async () => {
      const search = vi.spyOn(service, 'searchTrackingCodes');

      fixture.destroy();
      component.searchTerm.set('1042');
      await settle(10_000);

      expect(search).not.toHaveBeenCalled();
    });

    it('destruir la página con una búsqueda en vuelo la cancela: se ejecuta el teardown y no llega respuesta', async () => {
      let tornDown = false;
      let emitted = false;
      vi.spyOn(service, 'searchTrackingCodes').mockImplementation((term) =>
        idsWithLatency(term, 1000).pipe(
          tap(() => (emitted = true)),
          finalize(() => (tornDown = true)),
        ),
      );
      await typeInSearchbar('1042');
      await settle(SEARCH_DEBOUNCE_MS + 100); // petición en vuelo

      fixture.destroy();
      await settle(10_000);

      expect(tornDown).toBe(true);
      expect(emitted).toBe(false);
    });
  });
});
