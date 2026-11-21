import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { MockInstance } from 'vitest';

import type { ShiftTransition } from '../../services/theme.service';

import { ANIMATION_FRAME } from './animation-frame';
import {
  ADAPT_SAMPLES,
  AtmosphereComponent,
  FOG_MAX_WIDTH,
  RISE_MS,
  SINK_MS,
  SLOW_FRAME_MS,
} from './atmosphere.component';
import { FogRenderer } from './fog-renderer';

/** Renderizador simulado: jsdom no tiene WebGL. */
function fakeRenderer() {
  return {
    render: vi.fn(),
    dispose: vi.fn(),
    init: vi.fn(() => true),
    contextLost: false,
  };
}

describe('AtmosphereComponent', () => {
  let fixture: ComponentFixture<AtmosphereComponent>;
  let available: boolean[];
  let midpoints: number[];
  let ends: number[];

  /** Reloj de fotogramas simulado para la atmósfera (null = el real de la ventana). */
  let frameScheduler: { request: MockInstance; cancel: MockInstance } | null = null;

  async function render(inputs: { moving: boolean; night?: boolean; sinkTarget?: HTMLElement | null }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AtmosphereComponent],
      providers: frameScheduler ? [{ provide: ANIMATION_FRAME, useValue: frameScheduler }] : [],
    }).compileComponents();
    fixture = TestBed.createComponent(AtmosphereComponent);
    available = [];
    midpoints = [];
    ends = [];
    const component = fixture.componentInstance;
    component.availableChange.subscribe((value) => available.push(value));
    component.transitionMidpoint.subscribe((id) => midpoints.push(id));
    component.transitionEnd.subscribe((id) => ends.push(id));
    fixture.componentRef.setInput('night', inputs.night ?? false);
    fixture.componentRef.setInput('moving', inputs.moving);
    fixture.componentRef.setInput('sinkTarget', inputs.sinkTarget ?? null);
    await fixture.whenStable();
  }

  function canvases(): HTMLCanvasElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('canvas'));
  }

  afterEach(() => {
    vi.restoreAllMocks();
    frameScheduler = null;
  });

  describe('sin WebGL (jsdom)', () => {
    it('no lanza, no registra errores, avisa como mucho una vez y comunica que no está disponible', async () => {
      const error = vi.spyOn(console, 'error');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await expect(render({ moving: true })).resolves.toBeUndefined();

      expect(available).toEqual([false]);
      expect(error).not.toHaveBeenCalled();
      expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
      // Decorativo: oculto a tecnologías de asistencia y sin capturar el puntero.
      expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
      expect(canvases()).toHaveLength(2);
      expect(canvases()[1].hidden).toBe(true);
    });

    it('una transición pedida sin niebla se completa al momento', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await render({ moving: true });

      fixture.componentRef.setInput('transition', { id: 7, from: 'day', to: 'night' } satisfies ShiftTransition);
      await fixture.whenStable();

      expect(midpoints).toEqual([7]);
      expect(ends).toEqual([7]);
    });
  });

  describe('con WebGL simulado', () => {
    let renderer: ReturnType<typeof fakeRenderer>;
    /** Fotogramas pendientes pedidos por la atmósfera (se ejecutan a mano con runFrame). */
    let frames: Map<number, FrameRequestCallback>;
    let nextId: number;
    let raf: MockInstance<(callback: FrameRequestCallback) => number>;
    let caf: MockInstance<(handle: number) => void>;

    beforeEach(() => {
      renderer = fakeRenderer();
      vi.spyOn(FogRenderer, 'create').mockReturnValue(renderer as unknown as FogRenderer);
      frames = new Map();
      nextId = 1000;
      raf = vi.fn((cb: FrameRequestCallback) => {
        nextId += 1;
        frames.set(nextId, cb);
        return nextId;
      });
      caf = vi.fn((id: number) => {
        frames.delete(id);
      });
      frameScheduler = { request: raf, cancel: caf };
      // Capa de oleada: contexto 2D simulado (jsdom no implementa canvas).
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D);
    });

    /** Ejecuta el fotograma pendiente del componente con la marca de tiempo indicada. */
    function runFrame(now: number): void {
      const pending = Array.from(frames.entries());
      expect(pending).toHaveLength(1);
      const [id, cb] = pending[0];
      frames.delete(id);
      cb(now);
    }

    /** Identificadores de todos los fotogramas que ha pedido la atmósfera. */
    function componentFrameIds(): number[] {
      return raf.mock.results.map((result) => result.value as number);
    }

    it('en marcha programa fotogramas con un único bucle y comunica que está disponible', async () => {
      await render({ moving: true });

      expect(available).toEqual([true]);
      expect(componentFrameIds()).toHaveLength(1);
      runFrame(16);
      runFrame(32);
      expect(componentFrameIds()).toHaveLength(3); // uno por fotograma, nunca dos a la vez
      expect(renderer.render).toHaveBeenCalledTimes(2);
    });

    it('resolución interna limitada a 960 px y reducida a la mitad si el dispositivo no llega', async () => {
      await render({ moving: true });
      const [fog, surge] = canvases();
      const fullWidth = Math.round(Math.min(window.innerWidth * (window.devicePixelRatio || 1), FOG_MAX_WIDTH));
      expect(fog.width).toBe(fullWidth);
      expect(fog.width).toBeLessThanOrEqual(FOG_MAX_WIDTH);

      let now = 0;
      runFrame(now);
      for (let i = 0; i < ADAPT_SAMPLES; i++) {
        now += SLOW_FRAME_MS + 16; // fotogramas lentos
        runFrame(now);
      }

      expect(fog.width).toBe(Math.round(fullWidth * 0.5));
      expect(surge.width).toBe(fog.width);
    });

    it('a buen ritmo mantiene la resolución completa', async () => {
      await render({ moving: true });
      const [fog] = canvases();
      const width = fog.width;

      let now = 0;
      for (let i = 0; i <= ADAPT_SAMPLES + 5; i++) {
        runFrame(now);
        now += 16.7;
      }

      expect(fog.width).toBe(width);
    });

    it('en pausa no programa fotogramas: dibuja un único fotograma estático', async () => {
      await render({ moving: false });

      expect(componentFrameIds()).toHaveLength(0);
      expect(renderer.render).toHaveBeenCalled();
      const calls = renderer.render.mock.calls.length;

      fixture.componentRef.setInput('night', true); // cambio de modo sin transición: otro fotograma estático
      await fixture.whenStable();
      expect(componentFrameIds()).toHaveLength(0);
      expect(renderer.render.mock.calls.length).toBe(calls + 1);
      expect(renderer.render).toHaveBeenLastCalledWith(expect.objectContaining({ night: 1, surge: 0 }));
    });

    it('al pausar cancela el fotograma pendiente', async () => {
      await render({ moving: true });
      const [id] = componentFrameIds();

      fixture.componentRef.setInput('moving', false);
      await fixture.whenStable();

      expect(caf).toHaveBeenCalledWith(id);
    });

    it('al destruirse cancela el rAF, retira todos los listeners y libera WebGL', async () => {
      const windowRemove = vi.spyOn(window, 'removeEventListener');
      const documentRemove = vi.spyOn(document, 'removeEventListener');
      const canvasRemove = vi.spyOn(HTMLCanvasElement.prototype, 'removeEventListener');
      const windowAdd = vi.spyOn(window, 'addEventListener');
      const documentAdd = vi.spyOn(document, 'addEventListener');
      const canvasAdd = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
      await render({ moving: true });
      const [id] = componentFrameIds();

      fixture.destroy();

      expect(caf).toHaveBeenCalledWith(id);
      for (const [add, remove, type] of [
        [windowAdd, windowRemove, 'resize'],
        [documentAdd, documentRemove, 'visibilitychange'],
        [canvasAdd, canvasRemove, 'webglcontextlost'],
        [canvasAdd, canvasRemove, 'webglcontextrestored'],
      ] as const) {
        const added = add.mock.calls.find(([t]) => t === type);
        expect(added).toBeDefined();
        expect(remove).toHaveBeenCalledWith(type, added?.[1]);
      }
      expect(renderer.dispose).toHaveBeenCalledOnce();
    });

    it('coreografía: hunde el contenido, avisa del punto medio a los 240 ms y termina a los 1060 ms', async () => {
      const content = document.createElement('div');
      await render({ moving: false, sinkTarget: content });
      const surge = canvases()[1];

      fixture.componentRef.setInput('transition', { id: 3, from: 'day', to: 'night' } satisfies ShiftTransition);
      await fixture.whenStable();
      expect(surge.hidden).toBe(false);

      runFrame(1000); // inicio
      runFrame(1000 + SINK_MS / 2); // a mitad del hundimiento
      expect(content.style.transform).toMatch(/translate3d\(0(px)?, 14(\.00)?px, 0(px)?\)/);
      expect(Number(content.style.opacity)).toBeCloseTo(0.8, 2);
      expect(midpoints).toEqual([]);

      runFrame(1000 + SINK_MS + 1); // máxima niebla
      expect(midpoints).toEqual([3]);
      expect(Number(surge.style.opacity)).toBeCloseTo(1, 2);
      expect(renderer.render).toHaveBeenLastCalledWith(expect.objectContaining({ surge: 1 }));

      runFrame(1000 + SINK_MS + RISE_MS + 1); // fin
      expect(ends).toEqual([3]);
      expect(content.style.transform).toBe('');
      expect(content.style.opacity).toBe('');
      expect(surge.hidden).toBe(true);
      // En pausa y sin transición, el bucle se detiene.
      expect(Array.from(frames.values())).toHaveLength(0);
    });

    it('si la pestaña se oculta a mitad de la transición, la completa y detiene el bucle', async () => {
      await render({ moving: true });
      fixture.componentRef.setInput('transition', { id: 5, from: 'night', to: 'day' } satisfies ShiftTransition);
      await fixture.whenStable();
      runFrame(0);

      const visibility = vi.spyOn(Document.prototype, 'visibilityState', 'get').mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(midpoints).toEqual([5]);
      expect(ends).toEqual([5]);
      expect(Array.from(frames.values())).toHaveLength(0);

      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(Array.from(frames.values())).toHaveLength(1);
    });

    it('contexto WebGL perdido: lo comunica, completa la transición y permite restaurarlo', async () => {
      await render({ moving: true });
      const fog = canvases()[0];
      fixture.componentRef.setInput('transition', { id: 9, from: 'day', to: 'night' } satisfies ShiftTransition);
      await fixture.whenStable();

      const lost = new Event('webglcontextlost', { cancelable: true });
      fog.dispatchEvent(lost);
      expect(lost.defaultPrevented).toBe(true);
      expect(available).toEqual([true, false]);
      expect(ends).toEqual([9]);

      fog.dispatchEvent(new Event('webglcontextrestored'));
      expect(renderer.init).toHaveBeenCalledOnce();
      expect(available).toEqual([true, false, true]);
    });
  });
});
