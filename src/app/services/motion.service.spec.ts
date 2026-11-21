import { TestBed } from '@angular/core/testing';

import { MOTION_PAUSED_STORAGE_KEY, MotionService } from './motion.service';

/** MediaQueryList simulado de `prefers-reduced-motion: reduce`. */
function fakeReduceQuery(matches: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const add = vi.fn((_type: string, fn: (event: MediaQueryListEvent) => void) => (listener = fn));
  const remove = vi.fn();
  const query = { matches, addEventListener: add, removeEventListener: remove } as unknown as MediaQueryList;
  return { query, add, remove, emit: (next: boolean) => listener?.({ matches: next } as MediaQueryListEvent) };
}

describe('MotionService', () => {
  const view = document.defaultView;
  if (!view) throw new Error('Sin window en el entorno de pruebas');

  function stubReducedMotion(reduce: ReturnType<typeof fakeReduceQuery>): void {
    Object.defineProperty(view, 'matchMedia', { configurable: true, writable: true, value: () => reduce.query });
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(view, 'matchMedia');
    localStorage.clear();
  });

  describe('valores iniciales', () => {
    it('sin reduced motion: fondo en marcha, animaciones activas y atmósfera aún no disponible', () => {
      stubReducedMotion(fakeReduceQuery(false));
      const motion = TestBed.inject(MotionService);

      expect(motion.reducedMotion()).toBe(false);
      expect(motion.backgroundPaused()).toBe(false);
      expect(motion.animationsEnabled()).toBe(true);
      expect(motion.backgroundAvailable()).toBe(false);
    });

    it('con reduced motion: fondo en pausa por defecto y animaciones desactivadas', () => {
      stubReducedMotion(fakeReduceQuery(true));
      const motion = TestBed.inject(MotionService);

      expect(motion.reducedMotion()).toBe(true);
      expect(motion.backgroundPaused()).toBe(true);
      expect(motion.animationsEnabled()).toBe(false);
    });

    it('sin matchMedia disponible se comporta como sin reduced motion', () => {
      const motion = TestBed.inject(MotionService);

      expect(motion.reducedMotion()).toBe(false);
      expect(motion.backgroundPaused()).toBe(false);
    });

    it('la pausa guardada prevalece sobre el valor por defecto', () => {
      localStorage.setItem(MOTION_PAUSED_STORAGE_KEY, 'true');
      stubReducedMotion(fakeReduceQuery(false));

      expect(TestBed.inject(MotionService).backgroundPaused()).toBe(true);
    });

    it('un valor guardado no válido se ignora', () => {
      localStorage.setItem(MOTION_PAUSED_STORAGE_KEY, 'quizá');
      stubReducedMotion(fakeReduceQuery(true));

      expect(TestBed.inject(MotionService).backgroundPaused()).toBe(true);
    });
  });

  describe('persistencia', () => {
    it('setBackgroundPaused y toggleBackgroundPaused guardan la elección', () => {
      const motion = TestBed.inject(MotionService);

      motion.setBackgroundPaused(true);
      expect(motion.backgroundPaused()).toBe(true);
      expect(localStorage.getItem(MOTION_PAUSED_STORAGE_KEY)).toBe('true');

      motion.toggleBackgroundPaused();
      expect(motion.backgroundPaused()).toBe(false);
      expect(localStorage.getItem(MOTION_PAUSED_STORAGE_KEY)).toBe('false');
    });

    it('la elección explícita deja de seguir a reduced motion', () => {
      const reduce = fakeReduceQuery(false);
      stubReducedMotion(reduce);
      const motion = TestBed.inject(MotionService);

      motion.setBackgroundPaused(false);
      reduce.emit(true);

      expect(motion.reducedMotion()).toBe(true);
      expect(motion.backgroundPaused()).toBe(false);
      expect(motion.animationsEnabled()).toBe(false);
    });
  });

  describe('localStorage que lanza excepciones', () => {
    it('al leer y al guardar: no rompe y la pausa se aplica igual', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Bloqueado', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Cuota superada', 'QuotaExceededError');
      });

      const motion = TestBed.inject(MotionService);
      expect(motion.backgroundPaused()).toBe(false);
      expect(() => motion.setBackgroundPaused(true)).not.toThrow();
      expect(motion.backgroundPaused()).toBe(true);
    });
  });

  describe('prefers-reduced-motion', () => {
    it('sigue sus cambios; sin elección explícita, la pausa la acompaña', () => {
      const reduce = fakeReduceQuery(false);
      stubReducedMotion(reduce);
      const motion = TestBed.inject(MotionService);

      reduce.emit(true);
      expect(motion.reducedMotion()).toBe(true);
      expect(motion.backgroundPaused()).toBe(true);
      expect(motion.animationsEnabled()).toBe(false);

      reduce.emit(false);
      expect(motion.animationsEnabled()).toBe(true);
      expect(motion.backgroundPaused()).toBe(false);
    });

    it('retira el listener al destruirse (sin fugas)', () => {
      const reduce = fakeReduceQuery(false);
      stubReducedMotion(reduce);
      TestBed.inject(MotionService);
      const [type, handler] = reduce.add.mock.calls[0];

      TestBed.resetTestingModule();

      expect(reduce.remove).toHaveBeenCalledExactlyOnceWith(type, handler);
    });
  });

  it('setBackgroundAvailable refleja la disponibilidad de la atmósfera', () => {
    const motion = TestBed.inject(MotionService);

    motion.setBackgroundAvailable(true);
    expect(motion.backgroundAvailable()).toBe(true);
    motion.setBackgroundAvailable(false);
    expect(motion.backgroundAvailable()).toBe(false);
  });
});
