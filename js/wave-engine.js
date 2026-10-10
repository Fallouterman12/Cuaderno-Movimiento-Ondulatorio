/**
 * ============================================================================
 * MOTOR MATEMÁTICO DE ONDAS — MOVIMIENTO ONDULATORIO (Física 3)
 * Evaluación segura de expresiones matemáticas arbitrarias,
 * modelo de estado de ondas, principio de superposición.
 * ============================================================================
 */

class WaveEngine {
  constructor() {
    this.waves = [];          // Array de objetos WaveData
    this.time  = 0;           // Tiempo actual [s]
    this.speed = 1;           // Velocidad de la animación
    this.playing = false;     // ¿Animación en curso?
    this.showResultant = true;
    this._nextId = 1;

    // Estilo de la resultante (independiente)
    this.resultantStyle = {
      color:     '#f59e0b',
      lineWidth: 3.0,
      opacity:   1.0,
      lineDash:  [],
    };

    // RAF
    this._rafId = null;
    this._lastTs = null;

    // Callbacks
    this.onTick = null;
    this.onError = null;
  }

  // ──────────────────────────────────────────────────────────────
  // GESTIÓN DE ONDAS
  // ──────────────────────────────────────────────────────────────
  addWave(opts = {}) {
    const COLORS = ['#2563eb','#059669','#dc2626','#7c3aed','#ea580c','#0891b2','#be185d','#ca8a04'];
    const idx = this.waves.length;
    const wave = {
      id:            this._nextId++,
      name:          opts.name     || `Onda ${idx + 1}`,
      expression:    opts.expression || '',
      color:         opts.color    || COLORS[idx % COLORS.length],
      lineWidth:     opts.lineWidth !== undefined ? opts.lineWidth : 2.5,
      opacity:       opts.opacity  !== undefined ? opts.opacity  : 1.0,
      lineDash:      opts.lineDash || [],
      visible:       opts.visible  !== undefined ? opts.visible  : true,
      excludeFromSum:opts.excludeFromSum !== undefined ? opts.excludeFromSum : false,
      _compiled:     null,
      _error:        null,
    };
    this._compile(wave);
    this.waves.push(wave);
    return wave;
  }

  removeWave(id) {
    const idx = this.waves.findIndex(w => w.id === id);
    if (idx !== -1) this.waves.splice(idx, 1);
  }

  updateWave(id, changes) {
    const wave = this.waves.find(w => w.id === id);
    if (!wave) return;
    Object.assign(wave, changes);
    if (changes.expression !== undefined) this._compile(wave);
  }

  // ──────────────────────────────────────────────────────────────
  // COMPILACIÓN DE EXPRESIONES
  // ──────────────────────────────────────────────────────────────
  _compile(wave) {
    try {
      const fn = WaveEngine._buildFunction(wave.expression);
      wave._compiled = fn;
      wave._error    = null;
    } catch(e) {
      wave._compiled = null;
      wave._error    = e.message;
    }
  }

  /**
   * Convierte una cadena de expresión en una función f(x, t, v).
   * Se normalizan: sen→sin, π→pi, etc.
   * Variables permitidas: x, t, v (velocidad de propagación), pi, e
   */
  static _buildFunction(expr) {
    if (!expr || expr.trim() === '') return () => 0;

    let s = expr.trim();

    // Extraer el lado derecho si tiene la forma y(x,t) = ... o y = ...
    const eqIdx = s.search(/(?<![<>!=])=(?!=)/);
    if (eqIdx !== -1) s = s.slice(eqIdx + 1).trim();

    // Normalizaciones lingüísticas
    s = s
      .replace(/\bsen\b/gi, 'Math.sin')
      .replace(/\bsin\b/gi, 'Math.sin')
      .replace(/\bcos\b/gi, 'Math.cos')
      .replace(/\btan\b/gi, 'Math.tan')
      .replace(/\basin\b/gi, 'Math.asin')
      .replace(/\bacos\b/gi, 'Math.acos')
      .replace(/\batan\b/gi, 'Math.atan')
      .replace(/\batan2\b/gi, 'Math.atan2')
      .replace(/\bsqrt\b/gi, 'Math.sqrt')
      .replace(/\babs\b/gi, 'Math.abs')
      .replace(/\bexp\b/gi, 'Math.exp')
      .replace(/\blog\b/gi, 'Math.log')
      .replace(/\blog10\b/gi, 'Math.log10')
      .replace(/\bfloor\b/gi, 'Math.floor')
      .replace(/\bceil\b/gi, 'Math.ceil')
      .replace(/\bround\b/gi, 'Math.round')
      .replace(/\bsign\b/gi, 'Math.sign')
      .replace(/\bsinh\b/gi, 'Math.sinh')
      .replace(/\bcosh\b/gi, 'Math.cosh')
      .replace(/\btanh\b/gi, 'Math.tanh')
      .replace(/\bpow\b/gi,  'Math.pow')
      .replace(/\bPI\b/g,   'Math.PI')
      .replace(/\bpi\b/g,   'Math.PI')
      .replace(/\bπ/g,      'Math.PI')
      .replace(/\be\b(?!\s*[a-zA-Z_])/g, 'Math.E')
      // Multiplicación implícita: número seguido de letra o paréntesis
      .replace(/(\d)([\(a-zA-Z])/g, '$1*$2')
      // Potencia: ^ → **
      .replace(/\^/g, '**');

    // Verificación sintáctica básica
    const forbidden = /\b(window|document|fetch|eval|Function|import|require|process|global|self|this)\b/;
    if (forbidden.test(s)) throw new Error('Expresión no permitida');

    // eslint-disable-next-line no-new-func
    return new Function('x', 't', 'v', `"use strict"; return (${s});`);
  }

  // ──────────────────────────────────────────────────────────────
  // EVALUACIÓN
  // ──────────────────────────────────────────────────────────────
  evalWave(wave, x, t) {
    if (!wave._compiled) return 0;
    const v = this._getV(wave);
    try {
      const val = wave._compiled(x, t, v);
      return typeof val === 'number' ? val : 0;
    } catch(e) {
      return 0;
    }
  }

  evalResultant(x, t) {
    let sum = 0;
    for (const w of this.waves) {
      if (w.excludeFromSum) continue;
      sum += this.evalWave(w, x, t);
    }
    return sum;
  }

  /** Extrae v de la expresión (busca v=<número>) o usa default 1 */
  _getV(wave) {
    if (wave._v !== undefined) return wave._v;
    return 1; // valor default de v
  }

  // ──────────────────────────────────────────────────────────────
  // ANIMACIÓN
  // ──────────────────────────────────────────────────────────────
  play() {
    if (this.playing) return;
    this.playing = true;
    this._lastTs = null;
    const loop = ts => {
      if (!this.playing) return;
      if (this._lastTs !== null) {
        const dt = (ts - this._lastTs) / 1000; // segundos
        this.time += dt * this.speed;
      }
      this._lastTs = ts;
      if (this.onTick) this.onTick(this.time);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  pause() {
    this.playing = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._lastTs = null;
  }

  reset() {
    this.pause();
    this.time = 0;
    if (this.onTick) this.onTick(0);
  }

  // ──────────────────────────────────────────────────────────────
  // EJEMPLOS PREDEFINIDOS
  // ──────────────────────────────────────────────────────────────
  static get EXAMPLES() {
    return [
      {
        name: 'Onda Armónica Progresiva (cm, s)',
        desc: 'Distancias en cm, tiempo en s. Amplitud A=3 cm, λ=8 cm, f=0.5 Hz, v=4 cm/s',
        icon: '📐',
        waves: [
          { name: 'y₁(x,t)', expression: '3 * Math.sin((2*Math.PI/8)*x - 2*Math.PI*0.5*t)', color: '#2563eb' }
        ]
      },
      {
        name: 'Pulsos iguales, sentidos opuestos',
        desc: 'Dos pulsos gaussianos que viajan uno hacia el otro',
        icon: '↔️',
        waves: [
          { name: 'Pulso +', expression: '2 / ((x - 3*t)**4 + 1)', color: '#2563eb' },
          { name: 'Pulso −', expression: '2 / ((x + 3*t - 10)**4 + 1)', color: '#059669' },
        ]
      },
      {
        name: 'Pulsos de signos contrarios',
        desc: 'Superposición que se anula en el centro al cruzarse',
        icon: '⊕',
        waves: [
          { name: 'Pulso +', expression:  '2 / ((x - 3*t)**4 + 1)',       color: '#2563eb' },
          { name: 'Pulso −', expression: '-2 / ((x + 3*t - 10)**4 + 1)',   color: '#dc2626' },
        ]
      },
      {
        name: 'Pulsos con distintas amplitudes y anchuras',
        desc: 'Pulsos asimétricos mostrando superposición compleja',
        icon: '〜',
        waves: [
          { name: 'Ancho',   expression: '1.5 / ((x - 2*t)**2 + 1)',       color: '#7c3aed' },
          { name: 'Estrecho',expression: '3   / ((x - 2*t - 3)**6 + 1)',   color: '#ea580c' },
        ]
      },
      {
        name: 'Tres componentes sinusoidales',
        desc: 'Superposición de tres ondas de distinta frecuencia',
        icon: '🎵',
        waves: [
          { name: 'f₁', expression: 'Math.sin(x - t)',         color: '#2563eb' },
          { name: 'f₂', expression: '0.5*Math.sin(2*(x - t))', color: '#059669' },
          { name: 'f₃', expression: '0.3*Math.sin(3*(x - t))', color: '#dc2626' },
        ]
      },
      {
        name: 'Dos ondas con distinta fase',
        desc: 'Interferencia por diferencia de fase π/2',
        icon: '⚡',
        waves: [
          { name: 'Fase 0',    expression: '2*Math.sin(x - t)',             color: '#2563eb' },
          { name: 'Fase π/2',  expression: '2*Math.sin(x - t + Math.PI/2)',  color: '#7c3aed' },
        ]
      },
    ];
  }

  // ──────────────────────────────────────────────────────────────
  // SERIALIZACIÓN JSON
  // ──────────────────────────────────────────────────────────────
  exportJSON() {
    return JSON.stringify({
      time: this.time,
      speed: this.speed,
      showResultant: this.showResultant,
      resultantStyle: this.resultantStyle,
      waves: this.waves.map(w => ({
        id: w.id, name: w.name, expression: w.expression,
        color: w.color, lineWidth: w.lineWidth, opacity: w.opacity,
        lineDash: w.lineDash, visible: w.visible, excludeFromSum: w.excludeFromSum,
      }))
    }, null, 2);
  }

  importJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      this.pause();
      this.time = data.time || 0;
      this.speed = data.speed || 1;
      this.showResultant = data.showResultant !== undefined ? data.showResultant : true;
      if (data.resultantStyle) Object.assign(this.resultantStyle, data.resultantStyle);
      this.waves = [];
      this._nextId = 1;
      (data.waves || []).forEach(w => this.addWave(w));
      return true;
    } catch(e) {
      return false;
    }
  }
}
