import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { PackageService } from '../services/package.service';

import { HomePage, isPriorityFilter } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HomePage] }).compileComponents();
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

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
   * que es exactamente lo que hace el componente real al teclear.
   */
  async function typeInSearchbar(value: string): Promise<void> {
    const el = searchbar();
    el.value = value;
    el.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
    await fixture.whenStable();
  }

  /** Simula la selección en ion-segment emitiendo `ionChange` desde el propio elemento. */
  async function selectSegment(value: string): Promise<void> {
    const el = host.querySelector('ion-segment');
    if (!el) throw new Error('ion-segment no encontrado');
    el.dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
    await fixture.whenStable();
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
      await typeInSearchbar(term);

      expect(component.searchTerm()).toBe(term);
      expect(renderedCodes()).toEqual(['LTK-1042-ES']);
      expect(host.querySelector('.result-count')?.textContent).toContain('1 paquete');
      expect(host.querySelector('.result-count')?.textContent).not.toContain('paquetes');
    });

    it('un término inexistente da 0 resultados', async () => {
      await typeInSearchbar('9999');

      expect(component.resultCount()).toBe(0);
      expect(slidingItems()).toHaveLength(0);
    });

    it('un término solo con espacios no filtra', async () => {
      await typeInSearchbar('   ');

      expect(component.hasActiveFilters()).toBe(false);
      expect(slidingItems()).toHaveLength(12);
    });

    it('se combina con el filtro de prioridad', async () => {
      await typeInSearchbar('20');
      expect(renderedCodes().sort()).toEqual(['LTK-1203-ES', 'LTK-2013-ES']);

      await selectSegment('STANDARD');
      expect(renderedCodes()).toEqual(['LTK-2013-ES']);
    });
  });

  describe('estado vacío', () => {
    it('con filtros activos ofrece limpiarlos y al pulsar vuelven los 12', async () => {
      await selectSegment('LOW');
      await typeInSearchbar('no-existe');

      expect(host.textContent).toContain('Ningún paquete coincide con los filtros');
      expect(host.textContent).not.toContain('No hay paquetes que mostrar');
      expect(host.querySelector('.result-count')?.textContent).toContain('0 paquetes');

      const button = host.querySelector<HTMLElement>('.empty-state ion-button');
      expect(button?.textContent).toContain('Limpiar filtros');
      button?.click();
      await fixture.whenStable();

      expect(component.searchTerm()).toBe('');
      expect(component.priorityFilter()).toBe('ALL');
      expect(slidingItems()).toHaveLength(12);
      // ngModel devuelve el valor vacío al ion-searchbar.
      expect(searchbar().value).toBe('');
    });
  });

  describe('cambios de estado', () => {
    it('refleja en el DOM el cambio de estado hecho en el servicio', async () => {
      const service = TestBed.inject(PackageService);
      const target = component.packages()[0];
      expect(target.status).toBe('IN_TRANSIT');

      expect(service.updateStatus(target.id, 'REJECTED')).toBe(true);
      await fixture.whenStable();

      const row = slidingItems().find((el) => el.textContent?.includes(target.trackingCode));
      expect(row).toBeDefined();
      expect(row?.textContent).toContain('Rechazado');
      expect(row?.querySelector('ion-item')?.classList).toContain('package--rejected');
      expect(row?.querySelector('ion-item-options')).toBeNull();
    });

    it('tras updateStatus el paquete sale del grupo de pendientes y cambia el recuento global', async () => {
      const service = TestBed.inject(PackageService);
      const target = component.packages()[0];

      service.updateStatus(target.id, 'INSPECTED');
      await fixture.whenStable();

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
  });
});
