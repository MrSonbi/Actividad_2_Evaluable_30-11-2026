import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import type { Shift } from '../../services/theme.service';

import { ShiftToggleComponent } from './shift-toggle.component';

describe('ShiftToggleComponent', () => {
  let fixture: ComponentFixture<ShiftToggleComponent>;
  let host: HTMLElement;
  let emitted: Shift[];

  /** Crea el selector sin proveer ningún servicio: solo recibe el turno por input. */
  async function render(shift: Shift): Promise<void> {
    fixture = TestBed.createComponent(ShiftToggleComponent);
    host = fixture.nativeElement;
    emitted = [];
    fixture.componentInstance.shiftChange.subscribe((value) => emitted.push(value));
    fixture.componentRef.setInput('shift', shift);
    await fixture.whenStable();
  }

  function button(text: string): HTMLButtonElement {
    const el = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!el) throw new Error(`Botón "${text}" no encontrado`);
    return el;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ShiftToggleComponent] }).compileComponents();
  });

  it('es un grupo con nombre accesible y dos botones nativos con texto visible e icono oculto', async () => {
    await render('day');

    const group = host.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Turno de trabajo');
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Claro', 'Oscuro']);
    expect(buttons.every((b) => b.type === 'button')).toBe(true);
    expect(Array.from(host.querySelectorAll('ion-icon')).every((i) => i.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('aria-pressed refleja el turno activo y sigue al input', async () => {
    await render('day');
    expect(button('Claro').getAttribute('aria-pressed')).toBe('true');
    expect(button('Oscuro').getAttribute('aria-pressed')).toBe('false');

    fixture.componentRef.setInput('shift', 'night');
    await fixture.whenStable();
    expect(button('Claro').getAttribute('aria-pressed')).toBe('false');
    expect(button('Oscuro').getAttribute('aria-pressed')).toBe('true');
    expect(button('Oscuro').classList).toContain('shift-toggle__option--active');
    expect(button('Claro').classList).not.toContain('shift-toggle__option--active');
  });

  it('pulsar el turno contrario emite ese turno una sola vez', async () => {
    await render('day');
    button('Oscuro').click();
    expect(emitted).toEqual(['night']);

    await render('night');
    button('Claro').click();
    expect(emitted).toEqual(['day']);
  });

  it('pulsar el turno ya activo no emite', async () => {
    await render('night');

    button('Oscuro').click();

    expect(emitted).toEqual([]);
  });

  it('funciona con teclado: los botones son nativos, enfocables y se activan con Enter/Espacio', async () => {
    await render('day');
    const night = button('Oscuro');

    night.focus();
    expect(document.activeElement).toBe(night);
    expect(night.tabIndex).toBe(0);
    // Un <button> nativo convierte Enter y Espacio en `click`; jsdom no lo simula, así que se comprueba que es
    // un botón real (no un div con role) y que la activación que genera el navegador emite.
    expect(night instanceof HTMLButtonElement).toBe(true);
    night.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); // detail 0 = activación por teclado
    expect(emitted).toEqual(['night']);
  });
});
