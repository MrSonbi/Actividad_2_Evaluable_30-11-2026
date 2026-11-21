import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';

/** Turno de trabajo: decide la paleta visual (día = clara, noche = oscura). */
export type Shift = 'day' | 'night';

/** Clave de localStorage donde se guarda el turno elegido por el operario. */
export const SHIFT_STORAGE_KEY = 'logitrack.shift';

/** Clase de <html> que activa la paleta oscura de Ionic (dark.class.css) y los tokens de noche. */
export const NIGHT_CLASS = 'ion-palette-dark';

/** Consulta de preferencia del sistema que se usa cuando el operario aún no ha elegido turno. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Comprueba en tiempo de ejecución que un valor (p. ej. el guardado) es un turno válido. */
export function isShift(value: unknown): value is Shift {
  return value === 'day' || value === 'night';
}

/**
 * Turno visual de la app.
 *
 * Valor inicial: el guardado en localStorage; si no hay, el de `prefers-color-scheme`. Mientras el operario no
 * elija, sigue los cambios de preferencia del sistema; en cuanto elige, se guarda y manda su elección.
 * Todo acceso a localStorage va en try/catch: puede lanzar (modo privado, cuota, política del navegador).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = this.resolveStorage();
  private readonly darkQuery = this.resolveDarkQuery();

  /** Hay una elección explícita (guardada o hecha en esta sesión): deja de seguir al sistema. */
  private readonly hasUserChoice = signal(false);

  /** Turno activo. */
  readonly shift = signal<Shift>(this.initialShift());

  constructor() {
    // Aplica la clase al <html> y, si el operario ha elegido, guarda la elección.
    effect(() => {
      const shift = this.shift();
      this.document.documentElement.classList.toggle(NIGHT_CLASS, shift === 'night');
      if (this.hasUserChoice()) {
        this.writeStoredShift(shift);
      }
    });

    // Sigue la preferencia del sistema hasta que el operario elige. El listener se retira al destruirse el
    // inyector raíz: sin fugas.
    const query = this.darkQuery;
    if (query) {
      const onChange = (event: MediaQueryListEvent): void => {
        if (!this.hasUserChoice()) {
          this.shift.set(event.matches ? 'night' : 'day');
        }
      };
      query.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    }
  }

  /** Elección explícita del operario. */
  setShift(shift: Shift): void {
    this.hasUserChoice.set(true);
    this.shift.set(shift);
  }

  private initialShift(): Shift {
    const stored = this.readStoredShift();
    if (stored) {
      this.hasUserChoice.set(true);
      return stored;
    }
    return this.darkQuery?.matches ? 'night' : 'day';
  }

  private resolveStorage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private resolveDarkQuery(): MediaQueryList | null {
    const view = this.document.defaultView;
    return view && typeof view.matchMedia === 'function' ? view.matchMedia(DARK_QUERY) : null;
  }

  private readStoredShift(): Shift | null {
    try {
      const value = this.storage?.getItem(SHIFT_STORAGE_KEY);
      return isShift(value) ? value : null;
    } catch {
      return null;
    }
  }

  private writeStoredShift(shift: Shift): void {
    try {
      this.storage?.setItem(SHIFT_STORAGE_KEY, shift);
    } catch {
      // Sin almacenamiento disponible: el turno se aplica igual, solo no se recuerda.
    }
  }
}
