/**
 * ============================================================================
 * MÓDULO INTERACTIVO DE ONDA ARMÓNICA SIMPLE (O.A.S.) — FÍSICA 3 (UTP)
 * Renderizado de alta fidelidad HiDPI en HTML5 Canvas con estética GeoGebra.
 * Visualización dual espaciotemporal:
 *   1. Perfil espacial instantáneo y(x, t) con cotas de λ y A, y vectores de
 *      velocidad transversal de partículas (v_y).
 *   2. Registro temporal y(t), v_y(t) y a_y(t) en una partícula fija x_0 con
 *      cota de período T y análisis de desfases del M.A.S.
 * ============================================================================
 */

class HarmonicWaveStudio {
  constructor() {
    // Parámetros físicos (en cm, s, rad)
    this.params = {
      A: 3.0,          // Amplitud [cm]
      lambda: 8.0,     // Longitud de onda [cm]
      f: 0.5,          // Frecuencia [Hz]
      phi0: 0.0,       // Fase inicial [rad]
      direction: 1,    // +1: hacia +x (signo - en argumento), -1: hacia -x (signo +)
      x0: 4.0,         // Posición de la partícula observada en el registro temporal [cm]
    };

    // Estado de la animación
    this.time = 0;
    this.playing = true;
    this.lastTimestamp = null;
    this.animId = null;

    // Opciones visuales del registro temporal
    this.showElongation = true;
    this.showVelocity = true;
    this.showAcceleration = true;

    // Canvases y contextos
    this.spatialCanvas = null;
    this.spatialCtx = null;
    this.temporalCanvas = null;
    this.temporalCtx = null;

    // Transformación espacial (coordenadas mundo -> pantalla)
    this.spatialBounds = { minX: -1.0, maxX: 21.0, minY: -5.5, maxY: 5.5 };
    // Transformación temporal
    this.temporalBounds = { minT: 0.0, maxT: 4.0, minY: -5.5, maxY: 5.5 };

    this.initialized = false;
  }

  // ────────────────────────────────────────────────────────────
  // MAGNITUDES FÍSICAS DEDUCIDAS
  // ────────────────────────────────────────────────────────────
  get k() {
    return (2 * Math.PI) / this.params.lambda; // [rad/cm]
  }

  get omega() {
    return 2 * Math.PI * this.params.f; // [rad/s]
  }

  get T() {
    return 1 / this.params.f; // [s]
  }

  get v() {
    return this.params.lambda * this.params.f; // [cm/s]
  }

  get vyMax() {
    return this.omega * this.params.A; // [cm/s]
  }

  get ayMax() {
    return Math.pow(this.omega, 2) * this.params.A; // [cm/s²]
  }

  // ────────────────────────────────────────────────────────────
  // FUNCIONES ONDULATORIAS ANALÍTICAS
  // ────────────────────────────────────────────────────────────
  /**
   * Elongación y(x, t) = A * sen(kx ∓ ωt + φ₀)
   */
  evaluateY(x, t) {
    const s = this.params.direction; // +1 derecha (-wt), -1 izquierda (+wt)
    const phase = this.k * x - s * this.omega * t + this.params.phi0;
    return this.params.A * Math.sin(phase);
  }

  /**
   * Velocidad transversal v_y(x, t) = ∂y/∂t = -s * ω * A * cos(kx ∓ ωt + φ₀)
   */
  evaluateVy(x, t) {
    const s = this.params.direction;
    const phase = this.k * x - s * this.omega * t + this.params.phi0;
    return -s * this.omega * this.params.A * Math.cos(phase);
  }

  /**
   * Aceleración transversal a_y(x, t) = ∂²y/∂t² = -ω² * y(x, t) (M.A.S.)
   */
  evaluateAy(x, t) {
    return -Math.pow(this.omega, 2) * this.evaluateY(x, t);
  }

  /**
   * Pendiente local ∂y/∂x = k * A * cos(kx ∓ ωt + φ₀)
   */
  evaluateSlope(x, t) {
    const s = this.params.direction;
    const phase = this.k * x - s * this.omega * t + this.params.phi0;
    return this.k * this.params.A * Math.cos(phase);
  }

  // ────────────────────────────────────────────────────────────
  // INICIALIZACIÓN Y BINDING
  // ────────────────────────────────────────────────────────────
  init() {
    this.spatialCanvas = document.getElementById('oas-spatial-canvas');
    this.temporalCanvas = document.getElementById('oas-temporal-canvas');

    if (!this.spatialCanvas || !this.temporalCanvas) return;

    this.spatialCtx = this.spatialCanvas.getContext('2d');
    this.temporalCtx = this.temporalCanvas.getContext('2d');

    this._bindControls();
    this.resize();

    window.addEventListener('resize', () => this.resize());

    this.initialized = true;
    this.updateReadouts();
    this.start();
  }

  resize() {
    [this.spatialCanvas, this.temporalCanvas].forEach(canvas => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = rect.width > 50 ? rect.width : (canvas.parentElement?.clientWidth || 700);
      const height = rect.height > 50 ? rect.height : (canvas.getAttribute('data-height') || 340);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    });

    this.render();
  }

  _bindControls() {
    // Sliders
    const bindSlider = (id, paramKey, formatter) => {
      const slider = document.getElementById(id);
      const valEl = document.getElementById(`${id}-val`);
      if (!slider) return;
      slider.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        this.params[paramKey] = val;
        if (valEl) valEl.textContent = formatter(val);
        this.updateReadouts();
        this.render();
      });
    };

    bindSlider('oas-amp', 'A', v => `${v.toFixed(1)} cm`);
    bindSlider('oas-lambda', 'lambda', v => `${v.toFixed(1)} cm`);
    bindSlider('oas-freq', 'f', v => `${v.toFixed(2)} Hz`);
    bindSlider('oas-phi0', 'phi0', v => {
      const fractions = {
        0: '0',
        0.785: 'π/4',
        1.571: 'π/2',
        2.356: '3π/4',
        3.142: 'π',
        4.712: '3π/2',
        6.283: '2π'
      };
      const closest = Object.keys(fractions).reduce((prev, curr) =>
        Math.abs(curr - v) < Math.abs(prev - v) ? curr : prev
      );
      return Math.abs(closest - v) < 0.15 ? fractions[closest] : `${v.toFixed(2)} rad`;
    });

    // Dirección
    const btnDir = document.getElementById('oas-btn-dir');
    if (btnDir) {
      btnDir.addEventListener('click', () => {
        this.params.direction *= -1;
        btnDir.innerHTML = this.params.direction === 1
          ? '<span>Dirección:</span> <strong>+x (Derecha →)</strong>'
          : '<span>Dirección:</span> <strong>-x (Izquierda ←)</strong>';
        btnDir.classList.toggle('dir-left', this.params.direction === -1);
        this.updateReadouts();
        this.render();
      });
    }

    // Play / Pausa
    const btnPlay = document.getElementById('oas-btn-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        this.playing = !this.playing;
        btnPlay.innerHTML = this.playing
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Pausar</span>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg><span>Animar</span>';
        if (this.playing) {
          this.lastTimestamp = null;
          this.start();
        }
      });
    }

    // Reiniciar t = 0
    const btnReset = document.getElementById('oas-btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.time = 0;
        this.updateTimeBadge();
        this.render();
      });
    }

    // Toggles de curvas temporales
    const bindToggle = (id, prop) => {
      const chk = document.getElementById(id);
      if (chk) {
        chk.addEventListener('change', e => {
          this[prop] = e.target.checked;
          this.render();
        });
      }
    };
    bindToggle('oas-chk-y', 'showElongation');
    bindToggle('oas-chk-vy', 'showVelocity');
    bindToggle('oas-chk-ay', 'showAcceleration');
  }

  updateReadouts() {
    const v = this.v;
    const T = this.T;
    const k = this.k;
    const omega = this.omega;
    const vyMax = this.vyMax;
    const ayMax = this.ayMax;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('oas-calc-v', `${v.toFixed(2)} cm/s`);
    setTxt('oas-calc-t', `${T.toFixed(2)} s`);
    setTxt('oas-calc-k', `${k.toFixed(3)} rad/cm`);
    setTxt('oas-calc-omega', `${omega.toFixed(2)} rad/s`);
    setTxt('oas-calc-vymax', `${vyMax.toFixed(2)} cm/s`);
    setTxt('oas-calc-aymax', `${ayMax.toFixed(1)} cm/s²`);

    // Fórmula canónica viva
    const sign = this.params.direction === 1 ? '−' : '+';
    const phiStr = Math.abs(this.params.phi0) > 0.05
      ? ` + ${this.params.phi0.toFixed(2)}`
      : '';
    const eqStr = `y(x,t) = ${this.params.A.toFixed(1)} · sen(${k.toFixed(2)}x ${sign} ${omega.toFixed(2)}t${phiStr})`;
    setTxt('oas-eq-preview', eqStr);

    // Ajustar límites temporales dinámicamente según el período T
    this.temporalBounds.maxT = Math.max(2.5 * T, 1.0);
    this.spatialBounds.maxY = Math.max(this.params.A * 1.5, 4.0);
    this.spatialBounds.minY = -this.spatialBounds.maxY;
    this.temporalBounds.maxY = this.spatialBounds.maxY;
    this.temporalBounds.minY = this.spatialBounds.minY;
  }

  updateTimeBadge() {
    const el = document.getElementById('oas-time-badge');
    if (el) el.textContent = `t = ${this.time.toFixed(3)} s`;
  }

  start() {
    if (this.animId) cancelAnimationFrame(this.animId);

    const step = ts => {
      if (!this.lastTimestamp) this.lastTimestamp = ts;
      const dt = Math.min((ts - this.lastTimestamp) / 1000, 0.05);
      this.lastTimestamp = ts;

      if (this.playing) {
        this.time += dt;
        this.updateTimeBadge();
        this.render();
      }

      this.animId = requestAnimationFrame(step);
    };

    this.animId = requestAnimationFrame(step);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  // ────────────────────────────────────────────────────────────
  // RENDERIZADO DEL PLANO ESPACIAL (GeoGebra Style)
  // ────────────────────────────────────────────────────────────
  render() {
    this.renderSpatial();
    this.renderTemporal();
  }

  renderSpatial() {
    const canvas = this.spatialCanvas;
    const ctx = this.spatialCtx;
    if (!canvas || !ctx) return;

    const w = canvas.clientWidth || 700;
    const h = canvas.clientHeight || 340;
    const b = this.spatialBounds;

    // Funciones de proyección
    const toPxX = x => ((x - b.minX) / (b.maxX - b.minX)) * w;
    const toPxY = y => h - ((y - b.minY) / (b.maxY - b.minY)) * h;

    ctx.clearRect(0, 0, w, h);

    // 1. Fondo milimetrado GeoGebra
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Cuadrícula menor (cada 0.5 cm)
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#f1f5f9';
    ctx.beginPath();
    for (let x = Math.floor(b.minX); x <= Math.ceil(b.maxX); x += 0.5) {
      const px = toPxX(x);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = Math.floor(b.minY); y <= Math.ceil(b.maxY); y += 0.5) {
      const py = toPxY(y);
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();

    // Cuadrícula mayor (cada 2 cm)
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    for (let x = Math.floor(b.minX); x <= Math.ceil(b.maxX); x += 2) {
      const px = toPxX(x);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = Math.floor(b.minY); y <= Math.ceil(b.maxY); y += 2) {
      const py = toPxY(y);
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();

    // 2. Ejes de coordenadas (X e Y)
    const pyZero = toPxY(0);
    const pxZero = toPxX(0);

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#1e293b';

    // Eje X
    ctx.beginPath();
    ctx.moveTo(0, pyZero);
    ctx.lineTo(w, pyZero);
    ctx.stroke();

    // Flecha eje X
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(w - 2, pyZero);
    ctx.lineTo(w - 10, pyZero - 4);
    ctx.lineTo(w - 10, pyZero + 4);
    ctx.fill();

    // Eje Y
    ctx.beginPath();
    ctx.moveTo(pxZero, 0);
    ctx.lineTo(pxZero, h);
    ctx.stroke();

    // Flecha eje Y
    ctx.beginPath();
    ctx.moveTo(pxZero, 2);
    ctx.lineTo(pxZero - 4, 10);
    ctx.lineTo(pxZero + 4, 10);
    ctx.fill();

    // Etiquetas y ticks en ejes
    ctx.fillStyle = '#475569';
    ctx.font = '10px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let x = 2; x <= b.maxX - 1; x += 2) {
      const px = toPxX(x);
      ctx.beginPath();
      ctx.moveTo(px, pyZero - 3);
      ctx.lineTo(px, pyZero + 3);
      ctx.stroke();
      ctx.fillText(`${x}`, px, pyZero + 5);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = -4; y <= 4; y += 2) {
      if (y === 0) continue;
      const py = toPxY(y);
      ctx.beginPath();
      ctx.moveTo(pxZero - 3, py);
      ctx.lineTo(pxZero + 3, py);
      ctx.stroke();
      ctx.fillText(`${y}`, pxZero - 6, py);
    }

    // Título de los ejes
    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.fillStyle = '#0f2744';
    ctx.fillText('y [cm]', pxZero - 12, 14);
    ctx.textAlign = 'right';
    ctx.fillText('x [cm]', w - 16, pyZero - 10);

    // 3. Dibujar la curva continua de la onda sinusoidal
    ctx.save();
    ctx.lineWidth = 3.0;
    ctx.strokeStyle = '#2563eb';
    ctx.shadowColor = 'rgba(37,99,235,0.25)';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    const stepPx = 2;
    let first = true;
    for (let px = 0; px <= w; px += stepPx) {
      const xWorld = b.minX + (px / w) * (b.maxX - b.minX);
      const yWorld = this.evaluateY(xWorld, this.time);
      const py = toPxY(yWorld);
      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.restore();

    // 4. Marcadores de crestas, valles y nodos
    const lambda = this.params.lambda;
    const v = this.v;
    const s = this.params.direction;
    const t = this.time;
    const phi0 = this.params.phi0;

    // Detectar crestas visibles: kx - s*w*t + phi0 = pi/2 + 2*m*pi
    // => x = (pi/2 - phi0 + s*w*t + 2*m*pi) / k
    const crestsX = [];
    const baseCrest = ((Math.PI / 2 - phi0 + s * this.omega * t) / this.k) % lambda;
    for (let m = -4; m <= 8; m++) {
      const cx = baseCrest + m * lambda;
      if (cx >= b.minX && cx <= b.maxX) crestsX.push(cx);
    }
    crestsX.sort((a, b) => a - b);

    // 5. Cota de Longitud de Onda (λ) entre dos crestas consecutivas
    if (crestsX.length >= 2) {
      const c1 = crestsX[0];
      const c2 = crestsX[1];
      const px1 = toPxX(c1);
      const px2 = toPxX(c2);
      const pyCrest = toPxY(this.params.A);
      const cotaY = Math.max(pyCrest - 30, 24);

      // Líneas guía verticales discontinuas
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px1, pyCrest);
      ctx.lineTo(px1, cotaY);
      ctx.moveTo(px2, pyCrest);
      ctx.lineTo(px2, cotaY);
      ctx.stroke();

      // Flecha bidireccional horizontal de cota
      ctx.setLineDash([]);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(px1, cotaY);
      ctx.lineTo(px2, cotaY);
      ctx.stroke();

      // Flechas en los extremos
      const arrowSize = 6;
      ctx.fillStyle = '#059669';
      // Flecha izquierda
      ctx.beginPath();
      ctx.moveTo(px1, cotaY);
      ctx.lineTo(px1 + arrowSize, cotaY - 3.5);
      ctx.lineTo(px1 + arrowSize, cotaY + 3.5);
      ctx.fill();
      // Flecha derecha
      ctx.beginPath();
      ctx.moveTo(px2, cotaY);
      ctx.lineTo(px2 - arrowSize, cotaY - 3.5);
      ctx.lineTo(px2 - arrowSize, cotaY + 3.5);
      ctx.fill();

      // Badge numérico λ = ...
      const midX = (px1 + px2) / 2;
      const text = `λ = ${lambda.toFixed(1)} cm`;
      ctx.font = 'bold 11px "Outfit", sans-serif';
      const tw = ctx.measureText(text).width;

      ctx.fillStyle = '#ecfdf5';
      ctx.strokeStyle = '#6ee7b7';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(midX - tw / 2 - 8, cotaY - 11, tw + 16, 22, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#065f46';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, midX, cotaY);
      ctx.restore();
    }

    // 6. Cota de Amplitud (A) en la cresta
    if (crestsX.length >= 1) {
      const c = crestsX[0];
      const pxC = toPxX(c);
      const pyA = toPxY(this.params.A);
      const cotaX = pxC + 16;

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pxC, pyA);
      ctx.lineTo(cotaX, pyA);
      ctx.moveTo(pxC, pyZero);
      ctx.lineTo(cotaX, pyZero);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cotaX, pyZero);
      ctx.lineTo(cotaX, pyA);
      ctx.stroke();

      // Flechas de cota A
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(cotaX, pyA);
      ctx.lineTo(cotaX - 3, pyA + 5);
      ctx.lineTo(cotaX + 3, pyA + 5);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cotaX, pyZero);
      ctx.lineTo(cotaX - 3, pyZero - 5);
      ctx.lineTo(cotaX + 3, pyZero - 5);
      ctx.fill();

      // Badge de A
      const textA = `A = ${this.params.A.toFixed(1)} cm`;
      ctx.font = 'bold 10px "Outfit", sans-serif';
      const twA = ctx.measureText(textA).width;
      const midY = (pyA + pyZero) / 2;

      ctx.fillStyle = '#fef2f2';
      ctx.strokeStyle = '#fca5a5';
      ctx.beginPath();
      ctx.roundRect(cotaX + 4, midY - 9, twA + 10, 18, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#991b1b';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(textA, cotaX + 9, midY);
      ctx.restore();
    }

    // 7. VECTORES DE VELOCIDAD TRANSVERSAL DE PARTÍCULA (vy)
    // Se muestrean puntos a lo largo de x para mostrar que la partícula solo sube o baja verticalmente
    const numParticles = 14;
    const xStep = (b.maxX - b.minX - 2) / numParticles;

    ctx.save();
    for (let i = 0; i <= numParticles; i++) {
      const pxWorld = b.minX + 1.2 + i * xStep;
      const pyWorld = this.evaluateY(pxWorld, this.time);
      const vy = this.evaluateVy(pxWorld, this.time);

      const pxScreen = toPxX(pxWorld);
      const pyScreen = toPxY(pyWorld);

      // Partícula (punto sobre la cuerda)
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(pxScreen, pyScreen, 3.5, 0, 2 * Math.PI);
      ctx.fill();

      // Vector de velocidad transversal vertical vy
      const vyScale = 32 / (this.vyMax || 1); // Escala visual para que el vector máximo mida ~32px
      const vyPx = vy * vyScale;

      if (Math.abs(vyPx) > 3) {
        const destY = pyScreen - vyPx; // Si vy > 0, sube (hacia arriba en pantalla es -Y)
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(pxScreen, pyScreen);
        ctx.lineTo(pxScreen, destY);
        ctx.stroke();

        // Flecha vertical
        const headSize = 5;
        const dirSign = Math.sign(vyPx);
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.moveTo(pxScreen, destY);
        ctx.lineTo(pxScreen - 3.5, destY + dirSign * headSize);
        ctx.lineTo(pxScreen + 3.5, destY + dirSign * headSize);
        ctx.fill();
      }
    }
    ctx.restore();

    // 8. Vector de velocidad de propagación de la onda (v horizontal)
    ctx.save();
    const vecVPos = { x: toPxX(2), y: 30 };
    const vecVLen = 50 * s;
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(vecVPos.x, vecVPos.y);
    ctx.lineTo(vecVPos.x + vecVLen, vecVPos.y);
    ctx.stroke();

    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    const tipX = vecVPos.x + vecVLen;
    ctx.moveTo(tipX, vecVPos.y);
    ctx.lineTo(tipX - Math.sign(vecVLen) * 7, vecVPos.y - 4);
    ctx.lineTo(tipX - Math.sign(vecVLen) * 7, vecVPos.y + 4);
    ctx.fill();

    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.fillStyle = '#1d4ed8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Velocidad de fase onda: v = ${v.toFixed(1)} cm/s`, vecVPos.x + 8, vecVPos.y - 12);
    ctx.restore();

    // 9. Leyenda pedagógica de vectores en la esquina inferior
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(w - 230, h - 52, 220, 44, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '10px "Outfit", sans-serif';
    ctx.fillStyle = '#059669';
    ctx.fillText('↑ Flechas verdes: velocidad de partícula (v_y)', w - 220, h - 38);
    ctx.fillStyle = '#2563eb';
    ctx.fillText('→ Flecha azul: velocidad de la onda (v)', w - 220, h - 22);
    ctx.restore();
  }

  // ────────────────────────────────────────────────────────────
  // RENDERIZADO DEL REGISTRO TEMPORAL (M.A.S. de una Partícula)
  // ────────────────────────────────────────────────────────────
  renderTemporal() {
    const canvas = this.temporalCanvas;
    const ctx = this.temporalCtx;
    if (!canvas || !ctx) return;

    const w = canvas.clientWidth || 700;
    const h = canvas.clientHeight || 340;
    const b = this.temporalBounds;
    const T = this.T;
    const x0 = this.params.x0;

    const toPxT = t => ((t - b.minT) / (b.maxT - b.minT)) * w;
    const toPxY = y => h - ((y - b.minY) / (b.maxY - b.minY)) * h;

    ctx.clearRect(0, 0, w, h);

    // Fondo y cuadrícula
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Cuadrícula en múltiplos de T/4
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#f1f5f9';
    ctx.beginPath();
    for (let t = 0; t <= b.maxT; t += T / 4) {
      const pt = toPxT(t);
      ctx.moveTo(pt, 0);
      ctx.lineTo(pt, h);
    }
    for (let y = Math.floor(b.minY); y <= Math.ceil(b.maxY); y += 1) {
      const py = toPxY(y);
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();

    // Líneas mayores de período (cada T)
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    for (let t = 0; t <= b.maxT; t += T) {
      const pt = toPxT(t);
      ctx.moveTo(pt, 0);
      ctx.lineTo(pt, h);
    }
    ctx.stroke();

    // Ejes
    const pyZero = toPxY(0);
    const pxZero = toPxT(0);

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#1e293b';

    ctx.beginPath();
    ctx.moveTo(0, pyZero);
    ctx.lineTo(w, pyZero);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pxZero, 0);
    ctx.lineTo(pxZero, h);
    ctx.stroke();

    // Flechas
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(w - 2, pyZero);
    ctx.lineTo(w - 10, pyZero - 4);
    ctx.lineTo(w - 10, pyZero + 4);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pxZero, 2);
    ctx.lineTo(pxZero - 4, 10);
    ctx.lineTo(pxZero + 4, 10);
    ctx.fill();

    // Ticks en múltiplos de T
    ctx.fillStyle = '#475569';
    ctx.font = '10px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const tickFractions = [
      { f: 0.25, label: 'T/4' },
      { f: 0.5, label: 'T/2' },
      { f: 0.75, label: '3T/4' },
      { f: 1.0, label: 'T' },
      { f: 1.25, label: '5T/4' },
      { f: 1.5, label: '3T/2' },
      { f: 2.0, label: '2T' }
    ];

    tickFractions.forEach(item => {
      const tVal = item.f * T;
      if (tVal <= b.maxT) {
        const pt = toPxT(tVal);
        ctx.beginPath();
        ctx.moveTo(pt, pyZero - 3);
        ctx.lineTo(pt, pyZero + 3);
        ctx.stroke();
        ctx.fillText(item.label, pt, pyZero + 6);
      }
    });

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = -4; y <= 4; y += 2) {
      if (y === 0) continue;
      const py = toPxY(y);
      ctx.beginPath();
      ctx.moveTo(pxZero - 3, py);
      ctx.lineTo(pxZero + 3, py);
      ctx.stroke();
      ctx.fillText(`${y}`, pxZero - 6, py);
    }

    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.fillStyle = '#0f2744';
    ctx.fillText('y, vy, ay', pxZero + 55, 14);
    ctx.textAlign = 'right';
    ctx.fillText('t [s]', w - 16, pyZero - 10);

    // Curvas
    const stepT = (b.maxT - b.minT) / 250;

    // 1. Curva Elongación y(t) en azul
    if (this.showElongation) {
      ctx.save();
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#2563eb';
      ctx.beginPath();
      let first = true;
      for (let t = 0; t <= b.maxT; t += stepT) {
        const yVal = this.evaluateY(x0, t);
        const pt = toPxT(t);
        const py = toPxY(yVal);
        if (first) { ctx.moveTo(pt, py); first = false; }
        else { ctx.lineTo(pt, py); }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Curva Velocidad de partícula vy(t) en verde (escalada a amplitud A para comparar desfase)
    if (this.showVelocity) {
      ctx.save();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#059669';
      ctx.beginPath();
      let first = true;
      for (let t = 0; t <= b.maxT; t += stepT) {
        const vyVal = this.evaluateVy(x0, t);
        const vyNorm = (vyVal / (this.vyMax || 1)) * this.params.A; // Normalizada a la amplitud
        const pt = toPxT(t);
        const py = toPxY(vyNorm);
        if (first) { ctx.moveTo(pt, py); first = false; }
        else { ctx.lineTo(pt, py); }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Curva Aceleración ay(t) en rojo discontinuo (normalizada a A)
    if (this.showAcceleration) {
      ctx.save();
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#dc2626';
      ctx.beginPath();
      let first = true;
      for (let t = 0; t <= b.maxT; t += stepT) {
        const ayVal = this.evaluateAy(x0, t);
        const ayNorm = (ayVal / (this.ayMax || 1)) * this.params.A;
        const pt = toPxT(t);
        const py = toPxY(ayNorm);
        if (first) { ctx.moveTo(pt, py); first = false; }
        else { ctx.lineTo(pt, py); }
      }
      ctx.stroke();
      ctx.restore();
    }

    // Cota del Período T
    if (T <= b.maxT) {
      const pt0 = toPxT(0);
      const ptT = toPxT(T);
      const cotaY = toPxY(this.params.A * 1.15);

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pt0, pyZero);
      ctx.lineTo(pt0, cotaY);
      ctx.moveTo(ptT, pyZero);
      ctx.lineTo(ptT, cotaY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(pt0, cotaY);
      ctx.lineTo(ptT, cotaY);
      ctx.stroke();

      // Flechas
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(pt0, cotaY);
      ctx.lineTo(pt0 + 5, cotaY - 3);
      ctx.lineTo(pt0 + 5, cotaY + 3);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ptT, cotaY);
      ctx.lineTo(ptT - 5, cotaY - 3);
      ctx.lineTo(ptT - 5, cotaY + 3);
      ctx.fill();

      // Badge T
      const midT = (pt0 + ptT) / 2;
      const textT = `T = ${T.toFixed(2)} s`;
      ctx.font = 'bold 10px "Outfit", sans-serif';
      const twT = ctx.measureText(textT).width;

      ctx.fillStyle = '#fffbeb';
      ctx.strokeStyle = '#fcd34d';
      ctx.beginPath();
      ctx.roundRect(midT - twT / 2 - 6, cotaY - 10, twT + 12, 20, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#b45309';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textT, midT, cotaY);
      ctx.restore();
    }

    // Marcador dinámico del tiempo instantáneo actual (barra vertical amber sincronizada)
    const currentTMod = this.time % (b.maxT || 4);
    const ptCurr = toPxT(currentTMod);

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ptCurr, 0);
    ctx.lineTo(ptCurr, h);
    ctx.stroke();

    // Punto instantáneo sobre y(t)
    const currY = this.evaluateY(x0, currentTMod);
    const pyCurr = toPxY(currY);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(ptCurr, pyCurr, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

// Instancia global
let harmonicWaveStudio = null;

function initHarmonicWaveGraphs() {
  if (!harmonicWaveStudio) {
    harmonicWaveStudio = new HarmonicWaveStudio();
    harmonicWaveStudio.init();
  } else {
    harmonicWaveStudio.resize();
  }
}
