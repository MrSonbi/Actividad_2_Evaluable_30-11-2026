import { FOG_FRAGMENT_SHADER, FOG_VERTEX_SHADER } from './fog-shader';

/** Valores de un fotograma de niebla. */
export interface FogFrame {
  /** Reloj de la niebla en segundos (solo avanza mientras el fondo se mueve). */
  readonly time: number;
  /** Oleada de la transición de modo, de 0 (reposo) a 1 (cubre la pantalla). */
  readonly surge: number;
  /** Cantidad de noche, de 0 (día) a 1 (noche). */
  readonly night: number;
}

interface Uniforms {
  readonly resolution: WebGLUniformLocation | null;
  readonly time: WebGLUniformLocation | null;
  readonly surge: WebGLUniformLocation | null;
  readonly night: WebGLUniformLocation | null;
}

/**
 * Recursos WebGL2 de la niebla: un programa, un VAO vacío (el triángulo sale de gl_VertexID) y cuatro uniformes.
 * Nunca lanza: si algo falla devuelve `null`/`false` y el componente se queda con el cielo CSS.
 */
export class FogRenderer {
  private program: WebGLProgram | null = null;
  private vertexArray: WebGLVertexArrayObject | null = null;
  private uniforms: Uniforms | null = null;

  private constructor(private readonly gl: WebGL2RenderingContext) {}

  /** Crea el renderizador, o `null` si no hay WebGL2 o los shaders no compilan. */
  static create(canvas: HTMLCanvasElement): FogRenderer | null {
    // Sin la interfaz WebGL2 ni se intenta (evita además el aviso «not implemented» de entornos como jsdom).
    if (typeof WebGL2RenderingContext === 'undefined') {
      return null;
    }
    let gl: WebGL2RenderingContext | null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      });
    } catch {
      return null;
    }
    if (!gl) {
      return null;
    }
    const renderer = new FogRenderer(gl);
    return renderer.init() ? renderer : null;
  }

  /** (Re)crea programa y VAO; se usa al crear y tras `webglcontextrestored`. */
  init(): boolean {
    const gl = this.gl;
    const vertex = this.compile(gl.VERTEX_SHADER, FOG_VERTEX_SHADER);
    const fragment = this.compile(gl.FRAGMENT_SHADER, FOG_FRAGMENT_SHADER);
    const program = vertex && fragment ? gl.createProgram() : null;
    if (program && vertex && fragment) {
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
    }
    // Los shaders ya no hacen falta una vez enlazado (o fallado) el programa.
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!program || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return false;
    }
    this.program = program;
    this.vertexArray = gl.createVertexArray();
    this.uniforms = {
      resolution: gl.getUniformLocation(program, 'uResolution'),
      time: gl.getUniformLocation(program, 'uTime'),
      surge: gl.getUniformLocation(program, 'uSurge'),
      night: gl.getUniformLocation(program, 'uNight'),
    };
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    return true;
  }

  get contextLost(): boolean {
    return this.gl.isContextLost();
  }

  /** Dibuja un fotograma en todo el canvas. */
  render(frame: FogFrame): void {
    const gl = this.gl;
    if (!this.program || !this.uniforms || gl.isContextLost()) {
      return;
    }
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vertexArray);
    gl.uniform2f(this.uniforms.resolution, width, height);
    gl.uniform1f(this.uniforms.time, frame.time);
    gl.uniform1f(this.uniforms.surge, frame.surge);
    gl.uniform1f(this.uniforms.night, frame.night);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Libera programa y VAO y suelta el contexto para devolver la memoria de GPU cuanto antes. */
  dispose(): void {
    const gl = this.gl;
    if (!gl.isContextLost()) {
      gl.deleteProgram(this.program);
      gl.deleteVertexArray(this.vertexArray);
    }
    this.program = null;
    this.vertexArray = null;
    this.uniforms = null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private compile(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) {
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}
