import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/** Clave de localStorage donde se guarda si el operario ha pausado el fondo animado. */
export const MOTION_PAUSED_STORAGE_KEY = 'logitrack.motion-paused';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Preferencias de movimiento de la app.
 *
 * - `reducedMotion`: sigue a `prefers-reduced-motion` (el listener se retira con DestroyRef).
 * - `backgroundPaused`: el fondo animado está en pausa (WCAG 2.2.2). Mientras el operario no elige, vale lo mismo que
 *   `reducedMotion`; su elección se guarda en localStorage (con try/catch: puede fallar).
 * - `animationsEnabled`: se permiten transiciones y microinteracciones.
 * - `backgroundAvailable`: la atmósfera WebGL está funcionando (la comunica AppComponent). Sin ella no hay nada que
 *   pausar ni transición de niebla posible.
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = this.resolveStorage();

  private readonly reducedMotionState = signal(false);
  /** Elección explícita de pausa (null = sin elección: sigue a reducedMotion). */
  private readonly pausedChoice = signal<boolean | null>(this.readStoredPaused());
  private readonly backgroundAvailableState = signal(false);

  /** El sistema pide reducir el movimiento. */
  readonly reducedMotion = this.reducedMotionState.asReadonly();

  /** Fondo animado en pausa. */
  readonly backgroundPaused = computed(() => this.pausedChoice() ?? this.reducedMotion());

  /** Se permiten transiciones y microinteracciones. */
  readonly animationsEnabled = computed(() => !this.reducedMotion());

  /** La atmósfera WebGL está disponible y funcionando. */
  readonly backgroundAvailable = this.backgroundAvailableState.asReadonly();

  constructor() {
    const view = this.document.defaultView;
    const query = view && typeof view.matchMedia === 'function' ? view.matchMedia(REDUCED_MOTION_QUERY) : null;
    if (query) {
      this.reducedMotionState.set(query.matches);
      const onChange = (event: MediaQueryListEvent): void => this.reducedMotionState.set(event.matches);
      query.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    }
  }

  /** Elección explícita del operario (botón «Pausar fondo» / «Reanudar fondo»); se recuerda. */
  setBackgroundPaused(paused: boolean): void {
    this.pausedChoice.set(paused);
    try {
      this.storage?.setItem(MOTION_PAUSED_STORAGE_KEY, String(paused));
    } catch {
      // Sin almacenamiento: la pausa se aplica igual, solo no se recuerda.
    }
  }

  toggleBackgroundPaused(): void {
    this.setBackgroundPaused(!this.backgroundPaused());
  }

  /** Lo comunica el contenedor de la atmósfera cuando WebGL arranca, se pierde o se recupera. */
  setBackgroundAvailable(available: boolean): void {
    this.backgroundAvailableState.set(available);
  }

  private resolveStorage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private readStoredPaused(): boolean | null {
    try {
      const value = this.storage?.getItem(MOTION_PAUSED_STORAGE_KEY);
      return value === 'true' ? true : value === 'false' ? false : null;
    } catch {
      return null;
    }
  }
}
