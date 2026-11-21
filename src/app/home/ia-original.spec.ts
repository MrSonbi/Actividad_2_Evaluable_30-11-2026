/**
 * Tarea 5 — rama experimental `ia/original`.
 *
 * Mide el comportamiento del código de la IA integrado en HomePage (sin corregirlo). Cada test documenta un
 * hallazgo: los que pasan CONFIRMAN o DESCARTAN el problema descrito en su nombre.
 *
 * Reloj: Vitest fake timers. `debounceTime` y `delay` usan el `asyncScheduler` de RxJS (setInterval + Date.now),
 * y el planificador zoneless de Angular usa setTimeout/rAF; todos quedan bajo el reloj simulado.
 */
import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import type { OperatorFunction } from 'rxjs';
import {
  Observable,
  Subject,
  Subscription,
  debounceTime,
  delay,
  distinctUntilChanged,
  map,
  mergeMap,
  of,
  share,
  startWith,
  switchMap,
} from 'rxjs';

import type { WarehousePackage } from '../models/package.model';
import { PackageService, SIMULATED_LATENCY_MS } from '../services/package.service';

import { HomePage } from './home.page';

/** Proyección del operador de aplanado en la réplica del pipeline (test e). */
type Project = (term: string) => Observable<WarehousePackage[]>;

/** Ventana de `debounceTime(300)` del código de la IA. */
const DEBOUNCE_MS = 300;

/** Host de prueba (test b): reutiliza la clase HomePage de la IA tal cual y consume filteredPackages$ en dos sitios. */
@Component({
  selector: 'app-double-async-host',
  imports: [AsyncPipe],
  template: `
    @if (page.filteredPackages$ | async; as a) {
      <p class="first">{{ a.length }}</p>
    }
    @if (page.filteredPackages$ | async; as b) {
      <p class="second">{{ b.length }}</p>
    }
  `,
})
class DoubleAsyncHostComponent {
  // Se crea en el contexto de inyección del constructor del host, así que los inject() de HomePage funcionan.
  readonly page = new HomePage();
}

describe('IA original (Tarea 5): filtrado reactivo con RxJS', () => {
  let fixture: ComponentFixture<HomePage>;
  let component: HomePage;
  let host: HTMLElement;
  let service: PackageService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [HomePage] });
    service = TestBed.inject(PackageService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Crea la página. Se separa del beforeEach para poder espiar el servicio antes del primer render. */
  function render(): void {
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    fixture.detectChanges();
  }

  /** Avanza el reloj simulado (ejecutando timers y microtareas) y sincroniza la vista. */
  async function advance(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    if (!fixture.componentRef.hostView.destroyed) {
      fixture.detectChanges();
    }
  }

  /** Escribe en ion-searchbar igual que el componente real: el value accessor de Ionic escucha `ionInput`. */
  function typeInSearchbar(value: string): void {
    const el = host.querySelector('ion-searchbar');
    if (!el) throw new Error('ion-searchbar no encontrado');
    el.value = value;
    el.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
  }

  /** Códigos de seguimiento renderizados por la plantilla de la IA (h2 de cada ion-item). */
  function renderedCodes(): string[] {
    return Array.from(host.querySelectorAll('ion-list ion-item h2'), (el) => el.textContent?.trim() ?? '');
  }

  /** Texto del ion-badge de la fila con el código indicado (la IA muestra `pkg.status` en crudo). */
  function badgeFor(trackingCode: string): string | undefined {
    const item = Array.from(host.querySelectorAll('ion-list ion-item')).find(
      (el) => el.querySelector('h2')?.textContent?.trim() === trackingCode,
    );
    return item?.querySelector('ion-badge')?.textContent?.trim();
  }

  /**
   * `valueChanges` se tipa como Observable, pero en tiempo de ejecución es un EventEmitter (Subject);
   * su propiedad `observed` indica si queda algún suscriptor.
   */
  function valueChangesSubject(): Subject<string> {
    const changes = component.searchControl.valueChanges;
    if (!(changes instanceof Subject)) throw new Error('valueChanges no es un Subject');
    return changes;
  }

  /** Copia mutable del estado actual, con la latencia indicada (sustituto controlable de getPackages). */
  function snapshotWithLatency(ms: number): Observable<WarehousePackage[]> {
    return of([...service.packages()]).pipe(delay(ms));
  }

  describe('a) Memoria: el async pipe cancela la suscripción', () => {
    it('tras destruir la página, escribir en el control y avanzar el reloj no vuelve a llamar a getPackages (NO hay fuga)', async () => {
      const getPackages = vi.spyOn(service, 'getPackages');
      render();
      await advance(DEBOUNCE_MS + SIMULATED_LATENCY_MS);
      expect(getPackages).toHaveBeenCalledTimes(1);
      expect(renderedCodes()).toHaveLength(12);
      // valueChanges es un EventEmitter (Subject): `observed` indica si alguien sigue suscrito.
      expect(valueChangesSubject().observed).toBe(true);

      fixture.destroy();

      expect(valueChangesSubject().observed).toBe(false);
      component.searchControl.setValue('1042');
      await advance(10_000);
      expect(getPackages).toHaveBeenCalledTimes(1);
    });

    it('destruir la página con un debounce pendiente cancela el temporizador: getPackages no llega a llamarse', async () => {
      const getPackages = vi.spyOn(service, 'getPackages');
      render();
      await advance(DEBOUNCE_MS - 1);

      fixture.destroy();
      await advance(10_000);

      expect(getPackages).not.toHaveBeenCalled();
    });

    it('destruir la página con una "petición" en curso la cancela (se ejecuta el teardown y no hay emisión)', async () => {
      let tornDown = false;
      let emitted = false;
      vi.spyOn(service, 'getPackages').mockImplementation(
        () =>
          new Observable<WarehousePackage[]>((subscriber) => {
            const id = setTimeout(() => {
              emitted = true;
              subscriber.next([...service.packages()]);
              subscriber.complete();
            }, 1000);
            return () => {
              tornDown = true;
              clearTimeout(id);
            };
          }),
      );
      render();
      await advance(DEBOUNCE_MS + 100); // petición en vuelo

      fixture.destroy();
      await advance(10_000);

      expect(tornDown).toBe(true);
      expect(emitted).toBe(false);
    });
  });

  describe('b) Rendimiento: observable frío sin share()', () => {
    it('con dos async pipes sobre filteredPackages$, cada búsqueda llama a getPackages dos veces', async () => {
      const getPackages = vi.spyOn(service, 'getPackages');
      const hostFixture = TestBed.createComponent(DoubleAsyncHostComponent);
      hostFixture.detectChanges();
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + SIMULATED_LATENCY_MS);
      hostFixture.detectChanges();

      expect(getPackages).toHaveBeenCalledTimes(2); // carga inicial duplicada
      expect(hostFixture.nativeElement.querySelector('.first')?.textContent).toBe('12');
      expect(hostFixture.nativeElement.querySelector('.second')?.textContent).toBe('12');

      hostFixture.componentInstance.page.searchControl.setValue('1042');
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + SIMULATED_LATENCY_MS);
      hostFixture.detectChanges();

      expect(getPackages).toHaveBeenCalledTimes(4); // +2 por una sola búsqueda
      expect(hostFixture.nativeElement.querySelector('.first')?.textContent).toBe('1');
      hostFixture.destroy();
    });

    it('control: dos suscripciones manuales duplican las llamadas; con share() (solo en el spec) se hace una', async () => {
      const getPackages = vi.spyOn(service, 'getPackages');
      render();
      const extra = new Subscription();
      extra.add(component.filteredPackages$.subscribe());
      await advance(DEBOUNCE_MS + SIMULATED_LATENCY_MS);
      // async pipe de la plantilla + suscripción manual = 2 pipelines independientes.
      expect(getPackages).toHaveBeenCalledTimes(2);
      extra.unsubscribe();

      getPackages.mockClear();
      const shared$ = component.filteredPackages$.pipe(share());
      const subs = new Subscription();
      subs.add(shared$.subscribe());
      subs.add(shared$.subscribe());
      await advance(DEBOUNCE_MS + SIMULATED_LATENCY_MS);
      // Las dos suscripciones comparten un único pipeline: una sola llamada (startWith('') del pipeline compartido).
      // La suscripción de la plantilla ya cargó y no vuelve a llamar mientras el término no cambie.
      expect(getPackages).toHaveBeenCalledTimes(1);
      subs.unsubscribe();
    });
  });

  describe('c) Datos desactualizados: la lista es una instantánea', () => {
    it('tras una búsqueda, updateStatus() en el servicio NO actualiza la lista filtrada', async () => {
      render();
      typeInSearchbar('1634');
      await advance(DEBOUNCE_MS + SIMULATED_LATENCY_MS);
      expect(renderedCodes()).toEqual(['LTK-1634-ES']);
      expect(badgeFor('LTK-1634-ES')).toBe('IN_TRANSIT');

      const target = service.packages().find((pkg) => pkg.trackingCode === 'LTK-1634-ES');
      expect(target).toBeDefined();
      expect(service.updateStatus(target?.id ?? '', 'REJECTED')).toBe(true);
      await advance(10_000);

      expect(service.packages().find((pkg) => pkg.id === target?.id)?.status).toBe('REJECTED');
      expect(badgeFor('LTK-1634-ES')).toBe('IN_TRANSIT'); // dato obsoleto en pantalla
    });

    it('repetir el mismo término (aunque cambien espacios o mayúsculas) tampoco refresca: distinctUntilChanged lo filtra', async () => {
      const getPackages = vi.spyOn(service, 'getPackages');
      render();
      typeInSearchbar('1634');
      await advance(DEBOUNCE_MS + SIMULATED_LATENCY_MS);
      const target = service.packages().find((pkg) => pkg.trackingCode === 'LTK-1634-ES');
      service.updateStatus(target?.id ?? '', 'REJECTED');
      const callsBefore = getPackages.mock.calls.length;

      typeInSearchbar(' 1634 ');
      await advance(DEBOUNCE_MS + SIMULATED_LATENCY_MS);

      expect(getPackages).toHaveBeenCalledTimes(callsBefore);
      expect(badgeFor('LTK-1634-ES')).toBe('IN_TRANSIT');

      // Solo un término distinto vuelve a pedir datos y entonces sí aparece el estado nuevo.
      typeInSearchbar('LTK-1634');
      await advance(DEBOUNCE_MS + SIMULATED_LATENCY_MS);
      expect(badgeFor('LTK-1634-ES')).toBe('REJECTED');
    });
  });

  describe('d) Retraso inicial: startWith va antes de debounceTime', () => {
    it('con getPackages síncrono, no hay lista antes de 300 ms y sí justo a los 300 ms', async () => {
      const getPackages = vi.spyOn(service, 'getPackages').mockImplementation(() => of([...service.packages()]));
      render();
      expect(host.querySelector('ion-list')).toBeNull();

      await advance(DEBOUNCE_MS - 1);
      expect(getPackages).not.toHaveBeenCalled();
      expect(host.querySelector('ion-list')).toBeNull();

      await advance(1);
      expect(getPackages).toHaveBeenCalledTimes(1);
      expect(host.querySelector('ion-list')).not.toBeNull();
      expect(renderedCodes()).toHaveLength(12);
    });

    it('con la latencia simulada, la primera lista tarda 300 + 200 ms y mientras tanto no hay indicador de carga', async () => {
      render();
      await advance(DEBOUNCE_MS);
      expect(host.querySelector('ion-list')).toBeNull();
      expect(host.querySelector('ion-content')?.children).toHaveLength(0); // ni spinner ni mensaje

      await advance(SIMULATED_LATENCY_MS - 1);
      expect(host.querySelector('ion-list')).toBeNull();

      await advance(1);
      expect(renderedCodes()).toHaveLength(12);
    });
  });

  describe('e) Concurrencia: switchMap descarta respuestas antiguas (acierto de la IA)', () => {
    /** Latencias de las sucesivas llamadas: carga inicial rápida, primera búsqueda lenta, segunda rápida. */
    const LATENCIES = [0, 1000, 50];

    function stubVariableLatency(): void {
      const queue = [...LATENCIES];
      vi.spyOn(service, 'getPackages').mockImplementation(() => snapshotWithLatency(queue.shift() ?? 0));
    }

    /** Escribe "1042", y antes de que llegue su respuesta lenta escribe "1187". */
    async function slowThenFastSearch(write: (term: string) => void): Promise<void> {
      await advance(DEBOUNCE_MS); // carga inicial
      write('1042');
      await advance(DEBOUNCE_MS + 100); // petición lenta de "1042" en vuelo
      write('1187');
      await advance(5_000); // tiempo de sobra para que lleguen ambas
    }

    it('componente real: la lista final corresponde al último término aunque la respuesta antigua llegue después', async () => {
      stubVariableLatency();
      render();

      await slowThenFastSearch((term) => typeInSearchbar(term));

      expect(service.getPackages).toHaveBeenCalledTimes(3);
      expect(renderedCodes()).toEqual(['LTK-1187-ES']);
    });

    /**
     * Réplica literal del pipeline de la IA (mismo orden de operadores y mismo filtro que filterPackages) en la
     * que solo cambia el operador de aplanado. No modifica el código de la IA.
     */
    function replicaPipeline(
      source: Observable<string>,
      flatten: (project: Project) => OperatorFunction<string, WarehousePackage[]>,
    ): Observable<WarehousePackage[]> {
      const filterPackages = (searchTerm: string): Observable<WarehousePackage[]> =>
        service
          .getPackages()
          .pipe(
            map((packages) =>
              searchTerm ? packages.filter((pkg) => pkg.trackingCode.toLowerCase().includes(searchTerm)) : packages,
            ),
          );
      return source.pipe(
        startWith(''),
        map((term) => term.trim().toLowerCase()),
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        flatten((cleanTerm) => filterPackages(cleanTerm)),
      );
    }

    it.each([
      {
        name: 'switchMap',
        flatten: (project: Project) => switchMap(project),
        expectedLast: ['LTK-1187-ES'],
        expectedCount: 2,
      },
      {
        name: 'mergeMap',
        flatten: (project: Project) => mergeMap(project),
        expectedLast: ['LTK-1042-ES'],
        expectedCount: 3,
      },
    ])(
      'comparación $name: emisiones y resultado final con primera búsqueda lenta y segunda rápida',
      async ({ flatten, expectedLast, expectedCount }) => {
        // Sin renderizar la página: la réplica es la única consumidora de getPackages y de su cola de latencias.
        stubVariableLatency();
        const control = new FormControl('', { nonNullable: true }); // misma fuente que searchControl de la IA
        const emissions: string[][] = [];
        const sub = replicaPipeline(control.valueChanges, flatten).subscribe((list) =>
          emissions.push(list.map((pkg) => pkg.trackingCode)),
        );

        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); // carga inicial
        control.setValue('1042');
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100); // petición lenta de "1042" en vuelo
        control.setValue('1187');
        await vi.advanceTimersByTimeAsync(5_000);
        sub.unsubscribe();

        expect(emissions).toHaveLength(expectedCount);
        expect(emissions.at(-1)).toEqual(expectedLast);
      },
    );
  });
});
