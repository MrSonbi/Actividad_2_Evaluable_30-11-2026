import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';

/** Acceso al reloj de fotogramas del navegador (requestAnimationFrame / cancelAnimationFrame). */
export interface AnimationFrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

/**
 * Token de plataforma, como DOCUMENT: por defecto usa la ventana del documento. Permite a los tests observar y
 * controlar los fotogramas de la atmósfera sin interferir con los que usa Angular para su propio planificador.
 */
export const ANIMATION_FRAME = new InjectionToken<AnimationFrameScheduler>('ANIMATION_FRAME', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    return {
      request: (callback) => view?.requestAnimationFrame(callback) ?? 0,
      cancel: (handle) => view?.cancelAnimationFrame(handle),
    };
  },
});
