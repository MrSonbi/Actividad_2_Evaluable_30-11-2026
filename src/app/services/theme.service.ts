import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

import { MotionService } from './motion.service';

/** Turno de trabajo: decide la paleta visual (día = clara, noche = oscura). */
export type Shift = 'day' | 'night';

/** Clave de localStorage donde se guarda el turno elegido por el operario. */
export const SHIFT_STORAGE_KEY = 'logitrack.shift';

/** Clase de <html> que activa la paleta oscura de Ionic (dark.class.css) y los tokens de noche. */
export const NIGHT_CLASS = 'ion-palette-dark';

/** Consulta de preferencia del sistema que se usa cuando el operario aún no ha elegido turno. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Cambio de turno animado en curso: lo ejecuta la atmósfera (oleada de niebla). */
export interface ShiftTransition {
  /** Identificador único: permite distinguir una transición de la siguiente aunque tengan el mismo destino. */
  readonly id: number;
  readonly from: Shift;
  readonly to: Shift;
}

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
 *
 * Cambio pedido por el operario (`requestShift`): instantáneo si el sistema pide reducir el movimiento o la atmósfera
 * WebGL no está disponible; si no, queda como transición pendiente que ejecuta la atmósfera. Esta avisa en el punto
 * de máxima niebla (`applyTransitionMidpoint`: aquí cambia el tema) y al terminar (`completeTransition`: arranca el
 * cambio encolado, si lo hay).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly motion = inject(MotionService);
  private readonly storage = this.resolveStorage();
  private readonly darkQuery = this.resolveDarkQuery();

  /** Hay una elección explícita (guardada o hecha en esta sesión): deja de seguir al sistema. */
  private readonly hasUserChoice = signal(false);

  /** Turno activo (el que pintan los estilos). */
  readonly shift = signal<Shift>(this.initialShift());

  private readonly transitionState = signal<ShiftTransition | null>(null);
  /** Destino pedido durante una transición: se aplica al terminar la actual. */
  private readonly queuedShift = signal<Shift | null>(null);
  private nextTransitionId = 1;

  /** Transición animada en curso (null si no hay). */
  readonly transition = this.transitionState.asReadonly();

  /** Turno elegido por el operario, aunque su transición aún no haya terminado: lo muestra el selector. */
  readonly selectedShift = computed(() => this.queuedShift() ?? this.transitionState()?.to ?? this.shift());

  constructor() {
    // Aplica la clase al <html> y, si el operario ha elegido, guarda la elección.
    effect(() => {
      const shift = this.shift();
      this.document.documentElement.classList.toggle(NIGHT_CLASS, shift === 'night');
      if (this.hasUserChoice()) {
        this.writeStoredShift(shift);
      }
    });

    // Si durante una transición el sistema pasa a reduced motion o la atmósfera deja de estar disponible, nadie
    // completaría la oleada: se aplica ya el destino para no dejar el tema a medias.
    effect(() => {
      const canAnimate = this.motion.animationsEnabled() && this.motion.backgroundAvailable();
      if (!canAnimate && this.transitionState()) {
        this.finishTransitionsNow();
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

  /** Elección explícita del operario, aplicada al instante (sin transición). */
  setShift(shift: Shift): void {
    this.hasUserChoice.set(true);
    this.shift.set(shift);
    // También aquí, de forma síncrona: en el punto medio de la oleada el cambio no puede esperar al effect.
    this.document.documentElement.classList.toggle(NIGHT_CLASS, shift === 'night');
  }

  /**
   * Cambio de turno pedido desde el selector.
   * - Destino igual al ya elegido: se ignora.
   * - Con reduced motion o sin atmósfera WebGL: cambio instantáneo.
   * - Con una transición en curso: se encola (solo el último destino; si vuelve al destino en curso, se descarta).
   */
  requestShift(target: Shift): void {
    const running = this.transitionState();
    if (running) {
      this.queuedShift.set(target === running.to ? null : target);
      return;
    }
    if (target === this.shift()) {
      return;
    }
    if (!this.motion.animationsEnabled() || !this.motion.backgroundAvailable()) {
      this.setShift(target);
      return;
    }
    this.transitionState.set({ id: this.nextTransitionId++, from: this.shift(), to: target });
  }

  /** Punto de máxima niebla de la transición `id`: aquí cambia el tema, oculto tras la oleada. */
  applyTransitionMidpoint(id: number): void {
    const running = this.transitionState();
    if (running?.id === id && this.shift() !== running.to) {
      this.setShift(running.to);
    }
  }

  /** Fin de la transición `id`: garantiza el destino y arranca el cambio encolado, si sigue siendo un cambio. */
  completeTransition(id: number): void {
    const running = this.transitionState();
    if (running?.id !== id) {
      return;
    }
    this.applyTransitionMidpoint(id);
    this.transitionState.set(null);
    const queued = this.queuedShift();
    this.queuedShift.set(null);
    if (queued) {
      this.requestShift(queued);
    }
  }

  /**
   * Interrumpe cualquier transición aplicando ya el destino final (pestaña oculta, contexto WebGL perdido, el
   * sistema pasa a reduced motion…). No deja nunca el tema a medias.
   */
  finishTransitionsNow(): void {
    const target = this.selectedShift();
    this.transitionState.set(null);
    this.queuedShift.set(null);
    if (target !== this.shift()) {
      this.setShift(target);
    }
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
