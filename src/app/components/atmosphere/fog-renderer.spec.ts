import { FogRenderer } from './fog-renderer';

/** Contexto WebGL2 simulado: compila o falla según `compiles`. */
function fakeGl(compiles: boolean) {
  const loseContext = vi.fn();
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    DEPTH_TEST: 5,
    BLEND: 6,
    TRIANGLES: 7,
    drawingBufferWidth: 480,
    drawingBufferHeight: 960,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compiles),
    getShaderInfoLog: vi.fn(() => 'error de compilación simulado'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    createVertexArray: vi.fn(() => ({})),
    deleteVertexArray: vi.fn(),
    bindVertexArray: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    disable: vi.fn(),
    viewport: vi.fn(),
    useProgram: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    drawArrays: vi.fn(),
    isContextLost: vi.fn(() => false),
    getExtension: vi.fn(() => ({ loseContext })),
  };
  return { gl, loseContext };
}

describe('FogRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sin la interfaz WebGL2 devuelve null sin pedir ningún contexto', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

    expect(FogRenderer.create(document.createElement('canvas'))).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
  });

  it('si getContext lanza o devuelve null, devuelve null', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(FogRenderer.create(document.createElement('canvas'))).toBeNull();

    getContext.mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(FogRenderer.create(document.createElement('canvas'))).toBeNull();
  });

  it('si los shaders no compilan devuelve null, libera lo creado y no registra errores', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const { gl } = fakeGl(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as unknown as WebGL2RenderingContext);
    const error = vi.spyOn(console, 'error');

    expect(FogRenderer.create(document.createElement('canvas'))).toBeNull();
    expect(gl.deleteShader).toHaveBeenCalled();
    expect(gl.createProgram).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('con shaders válidos dibuja un triángulo con los uniformes y al liberar suelta el contexto', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const { gl, loseContext } = fakeGl(true);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as unknown as WebGL2RenderingContext);

    const renderer = FogRenderer.create(document.createElement('canvas'));
    expect(renderer).not.toBeNull();

    renderer?.render({ time: 12.5, surge: 0.3, night: 1 });
    expect(gl.uniform2f).toHaveBeenCalledWith(expect.anything(), 480, 960);
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 12.5);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);

    renderer?.dispose();
    expect(gl.deleteProgram).toHaveBeenCalled();
    expect(gl.deleteVertexArray).toHaveBeenCalled();
    expect(loseContext).toHaveBeenCalledOnce();
  });
});
