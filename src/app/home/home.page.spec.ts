import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { PackageService } from '../services/package.service';

import { HomePage } from './home.page';

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

  it('se crea', () => {
    expect(component).toBeTruthy();
  });

  it('renderiza un ion-item-sliding por paquete (12)', () => {
    expect(slidingItems()).toHaveLength(12);
  });

  it('muestra primero un paquete de prioridad crítica', () => {
    expect(component.packages()[0].priority).toBe('CRITICAL');
    expect(slidingItems()[0].textContent).toContain('Crítica');
  });

  it('muestra las etiquetas en español', () => {
    const text = host.textContent ?? '';
    for (const label of ['En tránsito', 'Inspeccionado', 'Rechazado', 'Crítica', 'Estándar', 'Baja']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Carga pesada');
  });

  it('solo ofrece acciones deslizantes en los paquetes en tránsito (6)', () => {
    expect(host.querySelectorAll('ion-item-options')).toHaveLength(6);
  });

  it('refleja en el DOM el cambio de estado hecho en el servicio', async () => {
    const service = TestBed.inject(PackageService);
    const target = component.packages().find((pkg) => pkg.status === 'IN_TRANSIT');
    expect(target).toBeDefined();
    if (!target) return;

    expect(service.updateStatus(target.id, 'REJECTED')).toBe(true);
    await fixture.whenStable();

    const row = slidingItems().find((el) => el.textContent?.includes(target.trackingCode));
    expect(row).toBeDefined();
    expect(row?.textContent).toContain('Rechazado');
    expect(row?.querySelector('ion-item')?.classList).toContain('package--rejected');
    expect(row?.querySelector('ion-item-options')).toBeNull();
    expect(host.textContent).toContain('Rechazado: 4');
  });
});
