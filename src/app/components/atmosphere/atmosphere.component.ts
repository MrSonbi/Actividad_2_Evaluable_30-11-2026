import { DOCUMENT } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  input,
  isDevMode,
  output,
  untracked,
  viewChild,
} from '@angular/core';

import type { ShiftTransition } from '../../services/theme.service';

import { ANIMATION_FRAME } from './animation-frame';
import { FogRenderer } from './fog-renderer';

/** Ancho máximo de la resolución interna del canvas (px de dispositivo); el CSS lo escala a pantalla completa. */
export const FOG_MAX_WIDTH = 960;

/**
 * Calidad adaptativa: si los primeros ADAPT_SAMPLES fotogramas en movimiento promedian más de SLOW_FRAME_MS, la
 * resolución interna baja a la mitad (una sola vez). La niebla es de baja frecuencia y apenas cambia de aspecto.
 */
export const ADAPT_SAMPLES = 60;
export const SLOW_FRAME_MS = 24;

/** Coreografía del cambio de modo (ms). */
export const SINK_MS = 240;
export const RISE_MS = 820;
/** Fracción inicial de la subida en la que la niebla se mantiene al máximo (margen para aplicar el tema). */
const PEAK_HOLD = 0.08;
/** Desplazamiento máximo del contenido hacia abajo (px) y opacidad que pierde. */
const SINK_PX = 28;
const SINK_FADE = 0.4;

const smoothstep = (x: number): number => {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * (3 - 2 * c);
};
const easeOutCubic = (x: number): number => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

/** Transición en ejecución (estado interno del bucle, no un signal: cambia en cada fotograma). */
interface RunningTransition {
  readonly id: number;
  readonly fromNight: number;
  readonly toNight: number;
  start: number | null;
  midpointSent: boolean;
}

let fallbackWarned = false;

/**
 * Atmósfera: niebla WebGL2 detrás del contenido y oleada de niebla por encima durante el cambio de modo.
 *
 * Presentacional (no inyecta servicios): recibe el modo, si el fondo debe moverse, la transición pedida y el
 * elemento que se hunde; comunica la disponibilidad de WebGL, el punto de máxima niebla y el final.
 *
 * Un único bucle requestAnimationFrame. Corre mientras el fondo se mueve o hay una transición; en pausa, con reduced
 * motion o con la pestaña oculta se detiene y queda un fotograma estático. Ningún signal se escribe por fotograma.
 */
@Component({
  selector: 'app-atmosphere',
  templateUrl: './atmosphere.component.html',
  styleUrl: './atmosphere.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class AtmosphereComponent {
  /** Modo aplicado: noche (true) o día (false). */
  readonly night = input.required<boolean>();
  /** El fondo debe moverse (ni en pausa ni con reduced motion). */
  readonly moving = input.required<boolean>();
  /** Transición de modo pedida (null si no hay). */
  readonly transition = input<ShiftTransition | null>(null);
  /** Elemento que se hunde durante la transición (el contenido de la página). */
  readonly sinkTarget = input<HTMLElement | null>(null);

  /** WebGL2 arrancó (true), o no está / se perdió el contexto (false). */
  readonly availableChange = output<boolean>();
  /** Punto de máxima niebla de la transición `id`: el contenedor aplica aquí el tema. */
  readonly transitionMidpoint = output<number>();
  /** Fin de la transición `id`. */
  readonly transitionEnd = output<number>();

  private readonly fogCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('fog');
  private readonly surgeCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('surge');
  private readonly document = inject(DOCUMENT);
  private readonly animationFrame = inject(ANIMATION_FRAME);

  private renderer: FogRenderer | null = null;
  private surgeContext: CanvasRenderingContext2D | null = null;
  private rafId = 0;
  /** Marca del fotograma anterior (null = no hay: el siguiente no avanza el reloj). */
  private lastNow: number | null = null;
  private fogTime = 0;
  private isMoving = false;
  private nightTarget = 0;
  private running: RunningTransition | null = null;
  /** Última transición atendida: otro cambio de inputs no la vuelve a arrancar. */
  private handledTransitionId = 0;
  private hidden = false;
  private renderScale = 1;
  private adaptFrames = 0;
  private adaptTotalMs = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor() {
    effect(() => {
      this.isMoving = this.moving();
      this.nightTarget = this.night() ? 1 : 0;
      const requested = this.transition();
      untracked(() => {
        if (requested && requested.id !== this.handledTransitionId) {
          this.handledTransitionId = requested.id;
          this.begin(requested);
        }
        this.sync();
      });
    });

    afterNextRender(() => this.start());

    inject(DestroyRef).onDestroy(() => this.destroy());
  }

  private start(): void {
    const canvas = this.fogCanvas().nativeElement;
    const view = this.document.defaultView;
    this.hidden = this.document.visibilityState === 'hidden';
    this.renderer = FogRenderer.create(canvas);
    if (!this.renderer) {
      if (isDevMode() && !fallbackWarned) {
        fallbackWarned = true;
        console.warn('LogiTrack: WebGL2 no disponible; el fondo queda solo con el cielo CSS.');
      }
      this.availableChange.emit(false);
      return;
    }
    this.listen(canvas, 'webglcontextlost', this.onContextLost);
    this.listen(canvas, 'webglcontextrestored', this.onContextRestored);
    this.listen(this.document, 'visibilitychange', this.onVisibilityChange);
    if (view) {
      this.listen(view, 'resize', this.onResize);
    }
    this.resize();
    this.availableChange.emit(true);
    this.sync();
  }

  private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler, { passive: type !== 'webglcontextlost' });
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  /** Arranca o detiene el bucle según el estado; si se detiene, deja un fotograma estático. */
  private sync(): void {
    if (!this.renderer || this.renderer.contextLost) {
      return;
    }
    if (this.shouldRun()) {
      this.schedule();
    } else {
      this.cancel();
      this.draw(performance.now());
    }
  }

  private shouldRun(): boolean {
    return !this.hidden && (this.isMoving || this.running !== null);
  }

  private schedule(): void {
    if (!this.rafId) {
      this.rafId = this.animationFrame.request(this.frame);
    }
  }

  private cancel(): void {
    if (this.rafId) {
      this.animationFrame.cancel(this.rafId);
      this.rafId = 0;
    }
    this.lastNow = null;
  }

  private readonly frame = (now: number): void => {
    this.rafId = 0;
    this.draw(now);
    if (this.shouldRun()) {
      this.schedule();
    } else {
      this.lastNow = null;
    }
  };

  private draw(now: number): void {
    const renderer = this.renderer;
    if (!renderer) {
      return;
    }
    const elapsed = this.lastNow === null ? 0 : Math.min(now - this.lastNow, 100);
    this.lastNow = now;
    if (this.isMoving) {
      this.fogTime += elapsed / 1000;
      this.adaptQuality(elapsed);
    }
    const step = this.running ? this.step(this.running, now) : { surge: 0, night: this.nightTarget };
    renderer.render({ time: this.fogTime, surge: step.surge, night: step.night });
    if (this.running) {
      this.paintSurge(step.surge);
    }
  }

  /** Avanza la coreografía: hundimiento (smoothstep) → punto medio → subida (salida suave). */
  private step(t: RunningTransition, now: number): { surge: number; night: number } {
    t.start ??= now;
    const elapsed = now - t.start;
    const total = SINK_MS + RISE_MS;
    const night = t.fromNight + (t.toNight - t.fromNight) * smoothstep(elapsed / total);
    let surge: number;
    let sink: number;
    if (elapsed < SINK_MS) {
      surge = smoothstep(elapsed / SINK_MS);
      sink = surge;
    } else {
      if (!t.midpointSent) {
        t.midpointSent = true;
        this.transitionMidpoint.emit(t.id);
      }
      const rise = (elapsed - SINK_MS) / RISE_MS;
      surge = 1 - smoothstep((rise - PEAK_HOLD) / (1 - PEAK_HOLD));
      sink = 1 - easeOutCubic(rise);
      if (rise >= 1) {
        this.end(t);
        return { surge: 0, night: t.toNight };
      }
    }
    this.applySink(sink);
    return { surge, night };
  }

  private adaptQuality(elapsed: number): void {
    if (this.renderScale < 1 || elapsed <= 0 || this.adaptFrames >= ADAPT_SAMPLES) {
      return;
    }
    this.adaptFrames += 1;
    this.adaptTotalMs += elapsed;
    if (this.adaptFrames === ADAPT_SAMPLES && this.adaptTotalMs / ADAPT_SAMPLES > SLOW_FRAME_MS) {
      this.renderScale = 0.5;
      this.resize();
    }
  }

  private begin(transition: ShiftTransition): void {
    if (this.running) {
      this.end(this.running);
    }
    if (!this.renderer || this.renderer.contextLost) {
      // Sin niebla no hay oleada que ocultar el cambio: se completa al momento.
      this.transitionMidpoint.emit(transition.id);
      this.transitionEnd.emit(transition.id);
      return;
    }
    this.running = {
      id: transition.id,
      fromNight: transition.from === 'night' ? 1 : 0,
      toNight: transition.to === 'night' ? 1 : 0,
      start: null,
      midpointSent: false,
    };
    const surge = this.surgeCanvas().nativeElement;
    surge.hidden = false;
    surge.style.opacity = '0';
    const target = this.sinkTarget();
    if (target) {
      target.style.willChange = 'transform, opacity';
    }
  }

  /** Termina la transición: garantiza el punto medio, retira la capa de oleada y devuelve el contenido a su sitio. */
  private end(t: RunningTransition): void {
    if (!t.midpointSent) {
      t.midpointSent = true;
      this.transitionMidpoint.emit(t.id);
    }
    this.running = null;
    this.clearSurge();
    this.resetSink();
    this.transitionEnd.emit(t.id);
  }

  /** Capa de oleada: copia del fotograma recién dibujado, por encima del contenido, con opacidad = oleada. */
  private paintSurge(surge: number): void {
    const canvas = this.surgeCanvas().nativeElement;
    this.surgeContext ??= canvas.getContext('2d');
    const ctx = this.surgeContext;
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.fogCanvas().nativeElement, 0, 0, canvas.width, canvas.height);
    canvas.style.opacity = surge.toFixed(3);
  }

  private clearSurge(): void {
    const canvas = this.surgeCanvas().nativeElement;
    this.surgeContext?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.opacity = '0';
    canvas.hidden = true;
  }

  private applySink(amount: number): void {
    const target = this.sinkTarget();
    if (target) {
      target.style.transform = `translate3d(0, ${(SINK_PX * amount).toFixed(2)}px, 0)`;
      target.style.opacity = (1 - SINK_FADE * amount).toFixed(3);
    }
  }

  private resetSink(): void {
    const target = this.sinkTarget();
    if (target) {
      target.style.transform = '';
      target.style.opacity = '';
      target.style.willChange = '';
    }
  }

  /**
   * Resolución interna: la del dispositivo, sin pasar de FOG_MAX_WIDTH de ancho (por la escala adaptativa, si el
   * dispositivo no llega); el CSS la estira a pantalla completa.
   */
  private resize(): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const cssWidth = Math.max(view.innerWidth, 1);
    const cssHeight = Math.max(view.innerHeight, 1);
    const width = Math.round(Math.min(cssWidth * (view.devicePixelRatio || 1), FOG_MAX_WIDTH) * this.renderScale);
    const height = Math.round((cssHeight * width) / cssWidth);
    for (const canvas of [this.fogCanvas().nativeElement, this.surgeCanvas().nativeElement]) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }
  }

  /** Si una transición no puede seguir (pestaña oculta, contexto perdido), se completa ya. */
  private abortTransition(): void {
    if (this.running) {
      this.end(this.running);
    }
  }

  private readonly onResize = (): void => {
    this.resize();
    if (!this.rafId) {
      this.draw(performance.now());
    }
  };

  private readonly onVisibilityChange = (): void => {
    this.hidden = this.document.visibilityState === 'hidden';
    if (this.hidden) {
      this.abortTransition();
      this.cancel();
    } else {
      this.sync();
    }
  };

  private readonly onContextLost = (event: Event): void => {
    // Sin preventDefault el navegador no intentará restaurar el contexto.
    event.preventDefault();
    this.cancel();
    this.abortTransition();
    this.availableChange.emit(false);
  };

  private readonly onContextRestored = (): void => {
    if (this.renderer?.init()) {
      this.availableChange.emit(true);
      this.sync();
    }
  };

  private destroy(): void {
    this.cancel();
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
    if (this.running) {
      this.running = null;
      this.resetSink();
    }
    this.renderer?.dispose();
    this.renderer = null;
    this.surgeContext = null;
  }
}
