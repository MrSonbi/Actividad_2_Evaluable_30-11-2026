import { TestBed } from '@angular/core/testing';

import { MotionService } from './motion.service';
import { NIGHT_CLASS, SHIFT_STORAGE_KEY, ThemeService, isShift } from './theme.service';

/** MediaQueryList simulado y controlable para `prefers-color-scheme: dark`. */
interface FakeDarkQuery {
  readonly query: MediaQueryList;
  readonly add: ReturnType<typeof vi.fn>;
  readonly remove: ReturnType<typeof vi.fn>;
  /** Simula que el sistema cambia de preferencia. */
  emit(matches: boolean): void;
}

function fakeDarkQuery(matches: boolean): FakeDarkQuery {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const add = vi.fn((_type: string, fn: (event: MediaQueryListEvent) => void) => (listener = fn));
  const remove = vi.fn();
  const query = { matches, media: '(prefers-color-scheme: dark)', addEventListener: add, removeEventListener: remove };
  return {
    query: query as unknown as MediaQueryList,
    add,
    remove,
    emit: (next) => listener?.({ matches: next } as MediaQueryListEvent),
  };
}

describe('ThemeService', () => {
  const html = document.documentElement;
  const view = document.defaultView;
  if (!view) throw new Error('Sin window en el entorno de pruebas');

  /**
   * jsdom no implementa matchMedia: se instala uno simulado en la ventana del documento. Solo la consulta de
   * esquema de color usa `dark`; cualquier otra (p. ej. la de reduced motion de MotionService) recibe una aparte.
   */
  function stubMatchMedia(dark: FakeDarkQuery): void {
    const other = fakeDarkQuery(false);
    Object.defineProperty(view, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (media: string) => (media.includes('prefers-color-scheme') ? dark.query : other.query),
    });
  }

  /** Crea el servicio y ejecuta su effect (aplicar clase y guardar). */
  function createService(): ThemeService {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    return service;
  }

  beforeEach(() => {
    localStorage.clear();
    html.classList.remove(NIGHT_CLASS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(view, 'matchMedia');
    localStorage.clear();
    html.classList.remove(NIGHT_CLASS);
  });

  describe('valor inicial', () => {
    it('usa el turno guardado en localStorage aunque el sistema prefiera lo contrario', () => {
      localStorage.setItem(SHIFT_STORAGE_KEY, 'night');
      stubMatchMedia(fakeDarkQuery(false));

      const service = createService();

      expect(service.shift()).toBe('night');
      expect(html.classList).toContain(NIGHT_CLASS);
    });

    it('sin turno guardado usa prefers-color-scheme: dark → noche', () => {
      stubMatchMedia(fakeDarkQuery(true));

      const service = createService();

      expect(service.shift()).toBe('night');
      expect(html.classList).toContain(NIGHT_CLASS);
      // Seguir al sistema no es una elección: no se guarda nada.
      expect(localStorage.getItem(SHIFT_STORAGE_KEY)).toBeNull();
    });

    it('sin turno guardado y con preferencia clara → día', () => {
      stubMatchMedia(fakeDarkQuery(false));

      expect(createService().shift()).toBe('day');
      expect(html.classList).not.toContain(NIGHT_CLASS);
    });

    it('ignora un valor guardado no válido y cae en la preferencia del sistema', () => {
      localStorage.setItem(SHIFT_STORAGE_KEY, 'sunset');
      stubMatchMedia(fakeDarkQuery(true));

      expect(createService().shift()).toBe('night');
    });

    it('sin matchMedia disponible empieza en día', () => {
      expect(createService().shift()).toBe('day');
    });
  });

  describe('setShift', () => {
    it('aplica y quita la clase de noche en <html> y guarda la elección', () => {
      stubMatchMedia(fakeDarkQuery(false));
      const service = createService();

      service.setShift('night');
      TestBed.tick();
      expect(html.classList).toContain(NIGHT_CLASS);
      expect(localStorage.getItem(SHIFT_STORAGE_KEY)).toBe('night');

      service.setShift('day');
      TestBed.tick();
      expect(html.classList).not.toContain(NIGHT_CLASS);
      expect(localStorage.getItem(SHIFT_STORAGE_KEY)).toBe('day');
    });
  });

  describe('preferencia del sistema', () => {
    it('la sigue mientras el operario no elige y la ignora después', () => {
      const dark = fakeDarkQuery(false);
      stubMatchMedia(dark);
      const service = createService();

      dark.emit(true);
      TestBed.tick();
      expect(service.shift()).toBe('night');
      expect(html.classList).toContain(NIGHT_CLASS);

      service.setShift('day');
      dark.emit(true);
      TestBed.tick();
      expect(service.shift()).toBe('day');
    });

    it('retira el listener de matchMedia al destruirse (sin fugas)', () => {
      const dark = fakeDarkQuery(false);
      stubMatchMedia(dark);
      createService();
      expect(dark.add).toHaveBeenCalledOnce();
      const [type, handler] = dark.add.mock.calls[0];

      TestBed.resetTestingModule();

      expect(dark.remove).toHaveBeenCalledExactlyOnceWith(type, handler);
    });
  });

  describe('localStorage que lanza excepciones', () => {
    it('al leer: no rompe y usa la preferencia del sistema', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Bloqueado', 'SecurityError');
      });
      stubMatchMedia(fakeDarkQuery(true));

      expect(() => createService()).not.toThrow();
      expect(TestBed.inject(ThemeService).shift()).toBe('night');
    });

    it('al guardar: el turno se aplica igualmente', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Cuota superada', 'QuotaExceededError');
      });
      const service = createService();

      service.setShift('night');
      expect(() => TestBed.tick()).not.toThrow();

      expect(service.shift()).toBe('night');
      expect(html.classList).toContain(NIGHT_CLASS);
    });
  });

  it('isShift acepta solo day y night', () => {
    expect(isShift('day')).toBe(true);
    expect(isShift('night')).toBe(true);
    expect(isShift('dark')).toBe(false);
    expect(isShift(null)).toBe(false);
  });
});

describe('ThemeService.requestShift', () => {
  const html = document.documentElement;
  const view = document.defaultView;
  if (!view) throw new Error('Sin window en el entorno de pruebas');

  /** Sistema con o sin reduced motion; preferencia de color clara. */
  function stubSystem(reduceMotion: boolean): void {
    Object.defineProperty(view, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (media: string) =>
        ({
          matches: media.includes('reduced-motion') ? reduceMotion : false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    });
  }

  /** Servicio en modo claro con la atmósfera disponible o no. */
  function setup(options: { reduceMotion?: boolean; atmosphere?: boolean } = {}): ThemeService {
    stubSystem(options.reduceMotion ?? false);
    TestBed.inject(MotionService).setBackgroundAvailable(options.atmosphere ?? true);
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    return theme;
  }

  function runningId(theme: ThemeService): number {
    const id = theme.transition()?.id;
    if (id === undefined) throw new Error('No hay transición en curso');
    return id;
  }

  beforeEach(() => {
    localStorage.clear();
    html.classList.remove(NIGHT_CLASS);
  });

  afterEach(() => {
    Reflect.deleteProperty(view, 'matchMedia');
    localStorage.clear();
    html.classList.remove(NIGHT_CLASS);
  });

  it('con reduced motion el cambio es instantáneo, sin transición', () => {
    const theme = setup({ reduceMotion: true });

    theme.requestShift('night');

    expect(theme.transition()).toBeNull();
    expect(theme.shift()).toBe('night');
    expect(html.classList).toContain(NIGHT_CLASS);
  });

  it('sin atmósfera WebGL el cambio es instantáneo, sin transición', () => {
    const theme = setup({ atmosphere: false });

    theme.requestShift('night');

    expect(theme.transition()).toBeNull();
    expect(theme.shift()).toBe('night');
    expect(html.classList).toContain(NIGHT_CLASS);
  });

  it('con animación el tema solo cambia al confirmarse el punto medio; el selector ya marca el destino', () => {
    const theme = setup();

    theme.requestShift('night');
    const id = runningId(theme);
    expect(theme.transition()).toEqual({ id, from: 'day', to: 'night' });
    expect(theme.shift()).toBe('day');
    expect(html.classList).not.toContain(NIGHT_CLASS);
    expect(theme.selectedShift()).toBe('night');

    theme.applyTransitionMidpoint(id + 1); // id ajeno: no hace nada
    expect(theme.shift()).toBe('day');

    theme.applyTransitionMidpoint(id);
    expect(theme.shift()).toBe('night');
    expect(html.classList).toContain(NIGHT_CLASS); // de forma síncrona, sin esperar al effect
    expect(theme.transition()).not.toBeNull();

    theme.completeTransition(id);
    expect(theme.transition()).toBeNull();
    expect(theme.selectedShift()).toBe('night');
  });

  it('un segundo clic durante la transición se encola y arranca al terminar la actual', () => {
    const theme = setup();
    theme.requestShift('night');
    const first = runningId(theme);

    theme.requestShift('day');
    expect(theme.selectedShift()).toBe('day');
    expect(runningId(theme)).toBe(first); // no interrumpe la actual

    theme.applyTransitionMidpoint(first);
    theme.completeTransition(first);

    const second = runningId(theme);
    expect(second).not.toBe(first);
    expect(theme.transition()).toEqual({ id: second, from: 'night', to: 'day' });
    expect(theme.shift()).toBe('night');
  });

  it('ignora el destino repetido: el actual sin transición, o el de la transición en curso', () => {
    const theme = setup();

    theme.requestShift('day');
    expect(theme.transition()).toBeNull();

    theme.requestShift('night');
    const id = runningId(theme);
    theme.requestShift('day'); // encola
    theme.requestShift('night'); // vuelve al destino en curso: descarta lo encolado
    expect(theme.selectedShift()).toBe('night');

    theme.completeTransition(id);
    expect(theme.transition()).toBeNull();
    expect(theme.shift()).toBe('night');
  });

  it('si la atmósfera deja de estar disponible a mitad, aplica ya el destino', () => {
    const theme = setup();
    theme.requestShift('night');

    TestBed.inject(MotionService).setBackgroundAvailable(false);
    TestBed.tick();

    expect(theme.transition()).toBeNull();
    expect(theme.shift()).toBe('night');
    expect(html.classList).toContain(NIGHT_CLASS);
  });
});
