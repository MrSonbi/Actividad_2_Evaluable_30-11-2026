import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { moonOutline, sunnyOutline } from 'ionicons/icons';

import type { Shift } from '../../services/theme.service';

/**
 * Selector de turno (Día / Noche).
 *
 * Presentacional, mismo patrón que PackageCard: recibe el turno activo por `shift` y comunica la elección por
 * `shiftChange`; no conoce ThemeService, es el contenedor quien la aplica. Botones nativos con `aria-pressed`,
 * así que funciona con teclado (Tab, Enter, Espacio) sin código adicional.
 */
@Component({
  selector: 'app-shift-toggle',
  templateUrl: './shift-toggle.component.html',
  styleUrl: './shift-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
})
export class ShiftToggleComponent {
  /** Turno activo. */
  readonly shift = input.required<Shift>();

  /** Se emite cuando el operario elige un turno distinto del activo. */
  readonly shiftChange = output<Shift>();

  readonly isDay = computed(() => this.shift() === 'day');
  readonly isNight = computed(() => this.shift() === 'night');

  constructor() {
    addIcons({ moonOutline, sunnyOutline });
  }

  /** Emisión controlada: pulsar el turno ya activo no emite. */
  select(shift: Shift): void {
    if (shift === this.shift()) {
      return;
    }
    this.shiftChange.emit(shift);
  }
}
