import { TestBed } from '@angular/core/testing';

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

  /** jsdom no implementa matchMedia: se instala uno simulado en la ventana del documento. */
  function stubMatchMedia(dark: FakeDarkQuery): void {
    Object.defineProperty(view, 'matchMedia', { configurable: true, writable: true, value: () => dark.query });
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
