import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import type { StatusChangeEvent, WarehousePackage } from '../../models/package.model';

import { PackageCardComponent } from './package-card.component';

const LIGHT_IN_TRANSIT: WarehousePackage = {
  id: '0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8',
  trackingCode: 'LTK-0001-ES',
  destinationHub: 'Sevilla - Majarabique',
  weightKg: 4.2,
  priority: 'CRITICAL',
  status: 'IN_TRANSIT',
  timestamp: new Date('2026-11-18T08:00:00+01:00'),
};

const HEAVY_INSPECTED: WarehousePackage = {
  id: '9f8e7d6c-5b4a-4392-a817-26354f5e6d7c',
  trackingCode: 'LTK-0002-ES',
  destinationHub: 'Bilbao - Arasur',
  weightKg: 30,
  priority: 'LOW',
  status: 'INSPECTED',
  timestamp: new Date('2026-11-18T09:30:00+01:00'),
};

/** Busca un ion-button por su texto visible. */
function buttonByText(root: HTMLElement, text: string): HTMLIonButtonElement {
  const button = Array.from(root.querySelectorAll('ion-button')).find((el) => el.textContent?.includes(text));
  if (!button) throw new Error(`Botón "${text}" no encontrado`);
  return button;
}

describe('PackageCardComponent', () => {
  let fixture: ComponentFixture<PackageCardComponent>;
  let component: PackageCardComponent;
  let host: HTMLElement;
  let emitted: StatusChangeEvent[];

  /** Crea la tarjeta sin proveer ningún servicio: solo recibe el paquete por input. */
  async function render(pkg: WarehousePackage): Promise<void> {
    fixture = TestBed.createComponent(PackageCardComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    emitted = [];
    component.statusChange.subscribe((event) => emitted.push(event));
    fixture.componentRef.setInput('pkg', pkg);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PackageCardComponent] }).compileComponents();
  });

  describe('render', () => {
    it('muestra código, hub y etiquetas de prioridad y estado', async () => {
      await render(LIGHT_IN_TRANSIT);

      expect(host.querySelector('.package__code')?.textContent?.trim()).toBe('LTK-0001-ES');
      expect(host.textContent).toContain('Sevilla - Majarabique');
      expect(host.textContent).toContain('Crítica');
      expect(host.textContent).toContain('En tránsito');
    });

    it('marca "Carga pesada" solo a partir del umbral (incluido)', async () => {
      await render(LIGHT_IN_TRANSIT);
      expect(host.querySelector('.package__heavy')).toBeNull();
      expect(host.textContent).not.toContain('Carga pesada');

      fixture.componentRef.setInput('pkg', HEAVY_INSPECTED);
      await fixture.whenStable();
      expect(host.querySelector('.package__heavy')?.textContent).toContain('Carga pesada');
      expect(host.textContent).toContain('Baja');
      expect(host.textContent).toContain('Inspeccionado');
    });

    it('las clases de host siguen al estado del input', async () => {
      await render(LIGHT_IN_TRANSIT);
      expect(host.classList).toContain('package-card');
      expect(host.classList).toContain('package-card--in-transit');

      fixture.componentRef.setInput('pkg', { ...LIGHT_IN_TRANSIT, status: 'REJECTED' });
      await fixture.whenStable();
      expect(host.classList).toContain('package-card--rejected');
      expect(host.classList).not.toContain('package-card--in-transit');
      expect(host.classList).not.toContain('package-card--inspected');

      fixture.componentRef.setInput('pkg', { ...LIGHT_IN_TRANSIT, status: 'INSPECTED' });
      await fixture.whenStable();
      expect(host.classList).toContain('package-card--inspected');
      expect(host.classList).not.toContain('package-card--rejected');
    });
  });

  describe('emisión de statusChange', () => {
    it('"Inspeccionar" emite una sola vez { id, newStatus: INSPECTED }', async () => {
      await render(LIGHT_IN_TRANSIT);

      buttonByText(host, 'Inspeccionar').click();

      expect(emitted).toEqual([{ id: LIGHT_IN_TRANSIT.id, newStatus: 'INSPECTED' }]);
    });

    it('"Rechazar" emite una sola vez { id, newStatus: REJECTED }', async () => {
      await render(LIGHT_IN_TRANSIT);

      buttonByText(host, 'Rechazar').click();

      expect(emitted).toEqual([{ id: LIGHT_IN_TRANSIT.id, newStatus: 'REJECTED' }]);
    });

    it('en tránsito, ambos botones están habilitados', async () => {
      await render(LIGHT_IN_TRANSIT);

      expect(buttonByText(host, 'Inspeccionar').disabled).toBe(false);
      expect(buttonByText(host, 'Rechazar').disabled).toBe(false);
    });

    it('INSPECTED: "Inspeccionar" deshabilitado y markAsInspected no emite', async () => {
      await render(HEAVY_INSPECTED);

      expect(buttonByText(host, 'Inspeccionar').disabled).toBe(true);
      expect(buttonByText(host, 'Rechazar').disabled).toBe(false);
      component.markAsInspected();
      expect(emitted).toEqual([]);
    });

    it('REJECTED: "Rechazar" deshabilitado y markAsRejected no emite', async () => {
      await render({ ...LIGHT_IN_TRANSIT, status: 'REJECTED' });

      expect(buttonByText(host, 'Rechazar').disabled).toBe(true);
      expect(buttonByText(host, 'Inspeccionar').disabled).toBe(false);
      component.markAsRejected();
      expect(emitted).toEqual([]);
    });
  });
});

/** Contenedor de prueba: reutiliza la tarjeta con dos paquetes y recoge los eventos que recibe. */
@Component({
  selector: 'app-card-list-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PackageCardComponent],
  template: `
    @for (pkg of packages; track pkg.id) {
      <app-package-card [pkg]="pkg" (statusChange)="onStatusChange($event)" />
    }
  `,
})
class CardListHostComponent {
  readonly packages: readonly WarehousePackage[] = [LIGHT_IN_TRANSIT, HEAVY_INSPECTED];
  readonly received = signal<readonly StatusChangeEvent[]>([]);

  onStatusChange(event: StatusChangeEvent): void {
    this.received.update((events) => [...events, event]);
  }
}

describe('PackageCardComponent dentro de un contenedor', () => {
  it('cada instancia emite al padre el evento de su propio paquete', async () => {
    await TestBed.configureTestingModule({ imports: [CardListHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CardListHostComponent);
    await fixture.whenStable();

    const root: HTMLElement = fixture.nativeElement;
    const cards = Array.from(root.querySelectorAll<HTMLElement>('app-package-card'));
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('LTK-0001-ES');
    expect(cards[1].textContent).toContain('LTK-0002-ES');

    buttonByText(cards[1], 'Rechazar').click();
    buttonByText(cards[0], 'Inspeccionar').click();

    expect(fixture.componentInstance.received()).toEqual([
      { id: HEAVY_INSPECTED.id, newStatus: 'REJECTED' },
      { id: LIGHT_IN_TRANSIT.id, newStatus: 'INSPECTED' },
    ]);
  });
});
