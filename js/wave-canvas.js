/**
 * ============================================================================
 * MOTOR DEL PLANO CARTESIANO ESTILO GEOGEBRA — MOVIMIENTO ONDULATORIO
 * Cuadrícula milimetrada, reescalado, zoom, arrastre, inspector,
 * renderizado a 60 FPS con Canvas 2D de alta densidad (devicePixelRatio).
 * ============================================================================
 */

class WaveCanvas {
  /**
   * @param {string} canvasId - ID del elemento <canvas>
   * @param {WaveEngine} engine - Motor de ondas
   * @param {object} [opts]
   */
  constructor(canvasId, engine, opts = {}) {
    this.canvas  = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx     = this.canvas.getContext('2d');
    this.engine  = engine;

    // Vista del plano cartesiano (coordenadas del mundo)
    this.xMin = opts.xMin !== undefined ? opts.xMin : -1;
    this.xMax = opts.xMax !== undefined ? opts.xMax : 13;
    this.yMin = opts.yMin !== undefined ? opts.yMin : -4;
    this.yMax = opts.yMax !== undefined ? opts.yMax : 4;

    this._defaultView = { xMin: this.xMin, xMax: this.xMax, yMin: this.yMin, yMax: this.yMax };

    // Interacción
    this.mode = 'pan'; // 'pan' | 'select' | 'inspect'
    this.isDragging = false;
    this._dragStart = null;
    this._viewAtDrag = null;

    // Pinch-to-zoom
    this._pinchDist0 = null;
    this._pinchView0 = null;

    // Inspector
    this.inspectorX = null;
    this.showInspector = false;

    // Estilo / tema
    this.theme = opts.theme || 'light';
    this.styleConfig = this._defaultStyleConfig();

    // Estado de DPR (alta densidad)
    this._dpr = 1;

    // Unidades físicas (distancias en cm, tiempo en s)
    this.distanceUnit = opts.distanceUnit || 'cm';
    this.timeUnit     = opts.timeUnit || 's';

    // Visualización de longitud de onda (lambda) y vectores de propagación
    this.showWavelength = opts.showWavelength !== undefined ? opts.showWavelength : true;
    this.showPropagationVectors = opts.showPropagationVectors !== undefined ? opts.showPropagationVectors : true;

    // Cantidad de puntos de muestreo
    this.samples = opts.samples || 1200;

    // Animación
    this._rafId = null;
    this._running = false;

    this._initEvents();
    this.resize();
  }

  // ──────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DE ESTILOS
  // ──────────────────────────────────────────────────────────────
  _defaultStyleConfig() {
    return {
      bgColor:        '#ffffff',
      gridMajorColor: '#e2e8f0',
      gridMajorWidth: 1,
      gridMinorColor: '#f1f5f9',
      gridMinorWidth: 0.5,
      axisColor:      '#1e293b',
      axisWidth:      1.5,
      labelSize:      11,
      labelColor:     '#334155',
      tickLength:     6,
      subTickLength:  3,
    };
  }

  applyTheme(theme) {
    this.theme = theme;
    if (theme === 'dark') {
      this.styleConfig.bgColor        = '#0f172a';
      this.styleConfig.gridMajorColor = '#1e3a5f';
      this.styleConfig.gridMinorColor = '#1a2e4a';
      this.styleConfig.axisColor      = '#94a3b8';
      this.styleConfig.labelColor     = '#94a3b8';
    } else {
      Object.assign(this.styleConfig, this._defaultStyleConfig());
    }
    this.draw();
  }

  // ──────────────────────────────────────────────────────────────
  // RESIZE — MANTIENE NITIDEZ EN PANTALLAS HiDPI
  // ──────────────────────────────────────────────────────────────
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.floor(rect.width)  || 600;
    const h = Math.floor(rect.height) || 400;
    const dpr = window.devicePixelRatio || 1;
    this._dpr = dpr;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.scale(dpr, dpr);
    this._w = w;
    this._h = h;
    this.draw();
  }

  // ──────────────────────────────────────────────────────────────
  // CONVERSIONES MUNDO ↔ PANTALLA
  // ──────────────────────────────────────────────────────────────
  worldToScreen(wx, wy) {
    const sx = (wx - this.xMin) / (this.xMax - this.xMin) * this._w;
    const sy = (1 - (wy - this.yMin) / (this.yMax - this.yMin)) * this._h;
    return { x: sx, y: sy };
  }
  screenToWorld(sx, sy) {
    const wx = this.xMin + sx / this._w * (this.xMax - this.xMin);
    const wy = this.yMin + (1 - sy / this._h) * (this.yMax - this.yMin);
    return { x: wx, y: wy };
  }

  // ──────────────────────────────────────────────────────────────
  // DIBUJADO PRINCIPAL
  // ──────────────────────────────────────────────────────────────
  draw() {
    if (!this.ctx || !this._w) return;
    const ctx = this.ctx;
    const cfg = this.styleConfig;
    const W = this._w, H = this._h;

    // Fondo
    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(0, 0, W, H);

    this._drawGridMinor(ctx, cfg, W, H);
    this._drawGridMajor(ctx, cfg, W, H);
    this._drawAxes(ctx, cfg, W, H);
    this._drawTicks(ctx, cfg, W, H);
    this._drawLabels(ctx, cfg, W, H);
    this._drawWaves(ctx, W, H);
    if (this.showWavelength) {
      this._drawWavelength(ctx, W, H);
    }
    if (this.showInspector && this.inspectorX !== null) {
      this._drawInspectorLine(ctx, W, H);
    }
  }

  // ── Cuadrícula menor (papel milimetrado) ──────────────────────
  _drawGridMinor(ctx, cfg, W, H) {
    const { minor } = this._gridSpacing();
    ctx.strokeStyle = cfg.gridMinorColor;
    ctx.lineWidth   = cfg.gridMinorWidth;

    // Verticales
    const x0 = Math.ceil(this.xMin / minor) * minor;
    for (let x = x0; x <= this.xMax + minor * 0.01; x += minor) {
      const sx = this.worldToScreen(x, 0).x;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    // Horizontales
    const y0 = Math.ceil(this.yMin / minor) * minor;
    for (let y = y0; y <= this.yMax + minor * 0.01; y += minor) {
      const sy = this.worldToScreen(0, y).y;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }
  }

  // ── Cuadrícula mayor ──────────────────────────────────────────
  _drawGridMajor(ctx, cfg, W, H) {
    const { major } = this._gridSpacing();
    ctx.strokeStyle = cfg.gridMajorColor;
    ctx.lineWidth   = cfg.gridMajorWidth;

    const x0 = Math.ceil(this.xMin / major) * major;
    for (let x = x0; x <= this.xMax + major * 0.01; x += major) {
      const sx = this.worldToScreen(x, 0).x;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    const y0 = Math.ceil(this.yMin / major) * major;
    for (let y = y0; y <= this.yMax + major * 0.01; y += major) {
      const sy = this.worldToScreen(0, y).y;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }
  }

  // ── Cálculo de espaciado de cuadrícula ───────────────────────
  _gridSpacing() {
    const rangeX = this.xMax - this.xMin;
    const rangeY = this.yMax - this.yMin;
    const range  = Math.max(rangeX, rangeY);
    const raw    = range / 8;
    const exp    = Math.floor(Math.log10(raw));
    const base   = Math.pow(10, exp);
    let major;
    if (raw / base <= 1.5)       major = base;
    else if (raw / base <= 3.5)  major = base * 2;
    else if (raw / base <= 7.5)  major = base * 5;
    else                         major = base * 10;
    const minor = major / 5;
    return { major, minor };
  }

  // ── Ejes ─────────────────────────────────────────────────────
  _drawAxes(ctx, cfg, W, H) {
    ctx.strokeStyle = cfg.axisColor;
    ctx.lineWidth   = cfg.axisWidth;

    // Eje X
    const oy = Math.max(0, Math.min(H, this.worldToScreen(0, 0).y));
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
    // Flecha eje X
    ctx.beginPath(); ctx.moveTo(W - 12, oy - 5); ctx.lineTo(W, oy); ctx.lineTo(W - 12, oy + 5);
    ctx.stroke();

    // Eje Y
    const ox = Math.max(0, Math.min(W, this.worldToScreen(0, 0).x));
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();
    // Flecha eje Y
    ctx.beginPath(); ctx.moveTo(ox - 5, 12); ctx.lineTo(ox, 0); ctx.lineTo(ox + 5, 12);
    ctx.stroke();

    // Etiquetas de ejes con indicación de unidades
    ctx.font = `700 ${cfg.labelSize + 1}px 'Outfit', sans-serif`;
    ctx.fillStyle = cfg.axisColor;
    const xUnit = this.distanceUnit || 'cm';
    const yUnit = this.distanceUnit || 'cm';
    ctx.fillText(`x [${xUnit}]`, W - 44, oy - 10);
    ctx.fillText(`y [${yUnit}]`, ox + 8, 15);
  }

  // ── Ticks y sub-ticks sobre los ejes ─────────────────────────
  _drawTicks(ctx, cfg, W, H) {
    const { major, minor } = this._gridSpacing();
    const ox = Math.max(0, Math.min(W, this.worldToScreen(0, 0).x));
    const oy = Math.max(0, Math.min(H, this.worldToScreen(0, 0).y));
    ctx.strokeStyle = cfg.axisColor;

    // Sub-ticks (menor)
    ctx.lineWidth = 0.8;
    const sx0 = Math.ceil(this.xMin / minor) * minor;
    for (let x = sx0; x <= this.xMax + minor * 0.01; x += minor) {
      const sx = this.worldToScreen(x, 0).x;
      ctx.beginPath(); ctx.moveTo(sx, oy - cfg.subTickLength); ctx.lineTo(sx, oy + cfg.subTickLength); ctx.stroke();
    }
    const sy0 = Math.ceil(this.yMin / minor) * minor;
    for (let y = sy0; y <= this.yMax + minor * 0.01; y += minor) {
      const sy = this.worldToScreen(0, y).y;
      ctx.beginPath(); ctx.moveTo(ox - cfg.subTickLength, sy); ctx.lineTo(ox + cfg.subTickLength, sy); ctx.stroke();
    }

    // Ticks mayores
    ctx.lineWidth = 1.2;
    const mx0 = Math.ceil(this.xMin / major) * major;
    for (let x = mx0; x <= this.xMax + major * 0.01; x += major) {
      const sx = this.worldToScreen(x, 0).x;
      ctx.beginPath(); ctx.moveTo(sx, oy - cfg.tickLength); ctx.lineTo(sx, oy + cfg.tickLength); ctx.stroke();
    }
    const my0 = Math.ceil(this.yMin / major) * major;
    for (let y = my0; y <= this.yMax + major * 0.01; y += major) {
      const sy = this.worldToScreen(0, y).y;
      ctx.beginPath(); ctx.moveTo(ox - cfg.tickLength, sy); ctx.lineTo(ox + cfg.tickLength, sy); ctx.stroke();
    }
  }

  // ── Números sobre marcas ─────────────────────────────────────
  _drawLabels(ctx, cfg, W, H) {
    const { major } = this._gridSpacing();
    const ox = Math.max(0, Math.min(W, this.worldToScreen(0, 0).x));
    const oy = Math.max(0, Math.min(H, this.worldToScreen(0, 0).y));

    ctx.font = `${cfg.labelSize}px 'Fira Code', monospace`;
    ctx.fillStyle = cfg.labelColor;
    ctx.textAlign = 'center';

    const decimals = major >= 1 ? 0 : (major >= 0.1 ? 1 : 2);

    const x0 = Math.ceil(this.xMin / major) * major;
    for (let x = x0; x <= this.xMax + major * 0.01; x += major) {
      if (Math.abs(x) < major * 0.01) continue; // no 0 doble
      const sx = this.worldToScreen(x, 0).x;
      const label = parseFloat(x.toFixed(decimals + 2)).toString();
      ctx.fillText(label, sx, oy + 18);
    }

    ctx.textAlign = 'right';
    const y0 = Math.ceil(this.yMin / major) * major;
    for (let y = y0; y <= this.yMax + major * 0.01; y += major) {
      if (Math.abs(y) < major * 0.01) continue;
      const sy = this.worldToScreen(0, y).y;
      const label = parseFloat(y.toFixed(decimals + 2)).toString();
      ctx.fillText(label, ox - 10, sy + 4);
    }
  }

  // ── Curvas de onda ────────────────────────────────────────────
  _drawWaves(ctx, W, H) {
    const t = this.engine.time;
    const waves = this.engine.waves;
    const xRange = this.xMax - this.xMin;
    const N = Math.min(this.samples, Math.ceil(W * this._dpr * 1.5));
    const dx = xRange / N;

    // Calcular todos los valores de x
    const xs = [];
    for (let i = 0; i <= N; i++) xs.push(this.xMin + i * dx);

    // Dibujar componentes (ocultas no se dibujan, pero SÍ se suman si no excluidas)
    waves.forEach(wave => {
      if (!wave.visible) return;
      if (!wave.expression) return;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth   = wave.lineWidth;
      ctx.globalAlpha = wave.opacity !== undefined ? wave.opacity : 1;
      this._setLineDash(ctx, wave.lineDash);

      ctx.beginPath();
      let penDown = false;
      let prevValid = false;

      for (let i = 0; i <= N; i++) {
        const x = xs[i];
        let y;
        try { y = this.engine.evalWave(wave, x, t); } catch(e) { prevValid = false; continue; }

        if (!isFinite(y) || isNaN(y)) { prevValid = false; continue; }
        // Evitar conectar a través de singularidades (saltos > 3 * rango)
        const screenY = this.worldToScreen(x, y).y;
        if (screenY < -H || screenY > H * 2) { prevValid = false; continue; }

        const sx = this.worldToScreen(x, y).x;
        const sy = screenY;

        if (!penDown || !prevValid) {
          ctx.moveTo(sx, sy); penDown = true;
        } else {
          ctx.lineTo(sx, sy);
        }
        prevValid = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });

    // Dibujar resultante
    if (this.engine.showResultant) {
      const rs = this.engine.resultantStyle;
      ctx.strokeStyle = rs.color;
      ctx.lineWidth   = rs.lineWidth;
      ctx.globalAlpha = rs.opacity !== undefined ? rs.opacity : 1;
      this._setLineDash(ctx, rs.lineDash);

      ctx.beginPath();
      let penDown = false;
      let prevValid = false;
      for (let i = 0; i <= N; i++) {
        const x = xs[i];
        let y;
        try { y = this.engine.evalResultant(x, t); } catch(e) { prevValid = false; continue; }
        if (!isFinite(y) || isNaN(y)) { prevValid = false; continue; }
        const screenY = this.worldToScreen(x, y).y;
        if (screenY < -H || screenY > H * 2) { prevValid = false; continue; }

        const sx = this.worldToScreen(x, y).x;
        const sy = screenY;
        if (!penDown || !prevValid) { ctx.moveTo(sx, sy); penDown = true; }
        else { ctx.lineTo(sx, sy); }
        prevValid = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  _setLineDash(ctx, dash) {
    if (!dash || dash.length === 0) ctx.setLineDash([]);
    else ctx.setLineDash(dash);
  }

  // ── Línea del inspector ───────────────────────────────────────
  _drawInspectorLine(ctx, W, H) {
    const x = this.inspectorX;
    const sx = this.worldToScreen(x, 0).x;
    ctx.strokeStyle = 'rgba(245,158,11,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Visualización de Longitud de Onda (λ) y Parámetros Físicos ──
  _drawWavelength(ctx, W, H) {
    const wave = this.engine.waves.find(w => w.visible && w.expression) ||
                 (this.engine.showResultant ? { isResultant: true } : null);
    if (!wave) return;

    const t = this.engine.time;
    const evalFn = (x) => {
      try {
        return wave.isResultant ? this.engine.evalResultant(x, t) : this.engine.evalWave(wave, x, t);
      } catch(e) { return 0; }
    };

    const numSamples = 360;
    const xStep = (this.xMax - this.xMin) / numSamples;
    const peaks = [];
    const nodes = [];

    let prevY = evalFn(this.xMin);
    let prevSlope = 0;

    for (let i = 1; i <= numSamples; i++) {
      const x = this.xMin + i * xStep;
      const y = evalFn(x);
      const slope = y - prevY;

      // Cresta (máximo local positivo)
      if (prevSlope > 0 && slope <= 0 && prevY > 0.05) {
        const peakX = x - xStep;
        peaks.push({ x: peakX, y: prevY });
      }

      // Nodo (cruce por cero)
      if ((prevY <= 0 && y > 0) || (prevY >= 0 && y < 0)) {
        const zeroX = (x - xStep) + (0 - prevY) / (y - prevY) * xStep;
        nodes.push({ x: zeroX, y: 0 });
      }

      prevSlope = slope;
      prevY = y;
    }

    // Dibujar nodos sutiles
    nodes.forEach(node => {
      const pt = this.worldToScreen(node.x, 0);
      if (pt.x >= 0 && pt.x <= W) {
        ctx.fillStyle = 'rgba(5, 150, 105, 0.45)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (peaks.length >= 2) {
      // Elegir las 2 crestas más centradas en la vista actual
      const xCenter = (this.xMin + this.xMax) / 2;
      let crest1 = peaks[0];
      let crest2 = peaks[1];
      let minCenterDist = Infinity;

      for (let i = 0; i < peaks.length - 1; i++) {
        const mid = (peaks[i].x + peaks[i+1].x) / 2;
        const dist = Math.abs(mid - xCenter);
        if (dist < minCenterDist) {
          minCenterDist = dist;
          crest1 = peaks[i];
          crest2 = peaks[i+1];
        }
      }

      const p1 = this.worldToScreen(crest1.x, crest1.y);
      const p2 = this.worldToScreen(crest2.x, crest2.y);
      const lambda = crest2.x - crest1.x;

      if (lambda > 0.01) {
        const cotaY = Math.max(26, Math.min(p1.y, p2.y) - 34);

        // Líneas guía verticales punteadas
        ctx.strokeStyle = 'rgba(5, 150, 105, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x, cotaY);
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x, cotaY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Flecha / barra de cota horizontal
        ctx.strokeStyle = '#059669';
        ctx.fillStyle   = '#059669';
        ctx.lineWidth   = 2.2;
        ctx.beginPath();
        ctx.moveTo(p1.x, cotaY);
        ctx.lineTo(p2.x, cotaY);
        ctx.stroke();

        // Puntas de flecha
        const arrowSize = 6;
        ctx.beginPath();
        ctx.moveTo(p1.x, cotaY);
        ctx.lineTo(p1.x + arrowSize, cotaY - arrowSize);
        ctx.lineTo(p1.x + arrowSize, cotaY + arrowSize);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(p2.x, cotaY);
        ctx.lineTo(p2.x - arrowSize, cotaY - arrowSize);
        ctx.lineTo(p2.x - arrowSize, cotaY + arrowSize);
        ctx.closePath();
        ctx.fill();

        // Puntos brillantes en las crestas
        [p1, p2].forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // Badge central: "λ = X.XX cm"
        const midX = (p1.x + p2.x) / 2;
        const text = `λ = ${lambda.toFixed(2)} ${this.distanceUnit}`;
        ctx.font = "bold 12px 'Fira Code', monospace";
        const textWidth = ctx.measureText(text).width;
        const pillW = textWidth + 24;
        const pillH = 24;
        const pillX = midX - pillW / 2;
        const pillY = cotaY - pillH / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#064e3b';
        ctx.beginPath();
        this._roundRect(ctx, pillX, pillY, pillW, pillH, 12);
        ctx.fill();
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, midX, cotaY);
        ctx.textBaseline = 'alphabetic';

        // Vector de velocidad de propagación
        if (this.showPropagationVectors && p1.x > 0 && p1.x < W) {
          this._drawPropagationVector(ctx, crest1.x, crest1.y, p1);
        }
      }
    } else {
      // Indicador si solo hay 1 cresta en la vista actual
      ctx.font = "600 11px 'Outfit', sans-serif";
      ctx.fillStyle = 'rgba(5, 150, 105, 0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(`📏 Medidor de λ activo · Aleje el zoom (zoom out) para abarcar 2 crestas consecutivas`, 14, 24);
    }
  }

  _drawPropagationVector(ctx, wx, wy, sp) {
    const arrowLen = 34;
    const ax = sp.x + 8;
    const ay = sp.y - 12;

    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + arrowLen, ay);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ax + arrowLen, ay);
    ctx.lineTo(ax + arrowLen - 6, ay - 4);
    ctx.lineTo(ax + arrowLen - 6, ay + 4);
    ctx.closePath();
    ctx.fill();

    ctx.font = "bold 10px 'Fira Code', monospace";
    ctx.fillText('v', ax + arrowLen + 4, ay + 3);
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }


  // ──────────────────────────────────────────────────────────────
  // ANIMACIÓN
  // ──────────────────────────────────────────────────────────────
  startAnimation() {
    if (this._running) return;
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      this.draw();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stopAnimation() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  // ──────────────────────────────────────────────────────────────
  // ZOOM (SÓLO ESCALA VISUAL — no modifica parámetros físicos)
  // ──────────────────────────────────────────────────────────────
  zoom(factor, cx, cy) {
    // cx, cy en coordenadas de pantalla
    const wx = cx !== undefined ? this.screenToWorld(cx, 0).x : (this.xMin + this.xMax) / 2;
    const wy = cy !== undefined ? this.screenToWorld(0, cy).y : (this.yMin + this.yMax) / 2;
    const xRange = (this.xMax - this.xMin) * factor;
    const yRange = (this.yMax - this.yMin) * factor;
    const fx = (wx - this.xMin) / (this.xMax - this.xMin);
    const fy = (wy - this.yMin) / (this.yMax - this.yMin);
    this.xMin = wx - fx * xRange;
    this.xMax = wx + (1 - fx) * xRange;
    this.yMin = wy - fy * yRange;
    this.yMax = wy + (1 - fy) * yRange;
    if (!this._running) this.draw();
  }

  resetView() {
    const d = this._defaultView;
    this.xMin = d.xMin; this.xMax = d.xMax;
    this.yMin = d.yMin; this.yMax = d.yMax;
    if (!this._running) this.draw();
  }

  // ──────────────────────────────────────────────────────────────
  // EVENTOS DE INTERACCIÓN
  // ──────────────────────────────────────────────────────────────
  _initEvents() {
    const c = this.canvas;

    // Mouse Wheel — zoom
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 1.12 : 0.88;
      this.zoom(factor, cx, cy);
    }, { passive: false });

    // Mouse down
    c.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (this.mode === 'inspect') {
        this.showInspector = true;
        this._updateInspector(e);
        return;
      }
      this.isDragging = true;
      const rect = c.getBoundingClientRect();
      this._dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this._viewAtDrag = { xMin: this.xMin, xMax: this.xMax, yMin: this.yMin, yMax: this.yMax };
      c.classList.add('is-dragging');
    });

    // Mouse move
    c.addEventListener('mousemove', e => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (this.mode === 'inspect') {
        this.inspectorX = this.screenToWorld(sx, sy).x;
        if (!this._running) this.draw();
        this._fireInspectorUpdate();
        return;
      }
      if (!this.isDragging || !this._dragStart) return;
      const ddx = sx - this._dragStart.x;
      const ddy = sy - this._dragStart.y;
      const dw  = -(ddx / this._w) * (this._viewAtDrag.xMax - this._viewAtDrag.xMin);
      const dh  =  (ddy / this._h) * (this._viewAtDrag.yMax - this._viewAtDrag.yMin);
      this.xMin = this._viewAtDrag.xMin + dw;
      this.xMax = this._viewAtDrag.xMax + dw;
      this.yMin = this._viewAtDrag.yMin + dh;
      this.yMax = this._viewAtDrag.yMax + dh;
      if (!this._running) this.draw();
    });

    // Mouse up
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas.classList.remove('is-dragging');
    });

    // Mouse leave — ocultar inspector
    c.addEventListener('mouseleave', () => {
      if (this.mode === 'inspect') {
        // mantener la última posición
      }
    });

    // Touch — pan y pinch
    c.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t0 = e.touches[0];
        const rect = c.getBoundingClientRect();
        this.isDragging = true;
        this._dragStart = { x: t0.clientX - rect.left, y: t0.clientY - rect.top };
        this._viewAtDrag = { xMin: this.xMin, xMax: this.xMax, yMin: this.yMin, yMax: this.yMax };
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        this._pinchDist0 = this._pinchDist(e.touches);
        this._pinchView0 = { xMin: this.xMin, xMax: this.xMax, yMin: this.yMin, yMax: this.yMax };
      }
    }, { passive: false });

    c.addEventListener('touchmove', e => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      if (e.touches.length === 1 && this.isDragging && this._dragStart) {
        const t0 = e.touches[0];
        const sx = t0.clientX - rect.left;
        const sy = t0.clientY - rect.top;
        const ddx = sx - this._dragStart.x;
        const ddy = sy - this._dragStart.y;
        const dw = -(ddx / this._w) * (this._viewAtDrag.xMax - this._viewAtDrag.xMin);
        const dh =  (ddy / this._h) * (this._viewAtDrag.yMax - this._viewAtDrag.yMin);
        this.xMin = this._viewAtDrag.xMin + dw;
        this.xMax = this._viewAtDrag.xMax + dw;
        this.yMin = this._viewAtDrag.yMin + dh;
        this.yMax = this._viewAtDrag.yMax + dh;
        if (!this._running) this.draw();
      } else if (e.touches.length === 2 && this._pinchDist0 !== null) {
        const d = this._pinchDist(e.touches);
        const factor = this._pinchDist0 / d;
        const v = this._pinchView0;
        const cx = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
        const cy = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
        const wx = v.xMin + cx / this._w * (v.xMax - v.xMin);
        const wy = v.yMin + (1 - cy / this._h) * (v.yMax - v.yMin);
        const xRange = (v.xMax - v.xMin) * factor;
        const yRange = (v.yMax - v.yMin) * factor;
        const fx = cx / this._w;
        const fy = cy / this._h;
        this.xMin = wx - fx * xRange;
        this.xMax = wx + (1 - fx) * xRange;
        this.yMin = wy - (1 - fy) * yRange;
        this.yMax = wy + fy * yRange;
        if (!this._running) this.draw();
      }
    }, { passive: false });

    c.addEventListener('touchend', e => {
      if (e.touches.length < 2) this._pinchDist0 = null;
      if (e.touches.length === 0) this.isDragging = false;
    });
  }

  _pinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _updateInspector(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    this.inspectorX = this.screenToWorld(sx, sy).x;
    if (!this._running) this.draw();
    this._fireInspectorUpdate();
  }

  _fireInspectorUpdate() {
    if (this.onInspectorUpdate) {
      const x = this.inspectorX;
      const t = this.engine.time;
      const vals = this.engine.waves.map(w => ({
        name: w.name,
        color: w.color,
        value: this.engine.evalWave(w, x, t),
        excluded: w.excludeFromSum
      }));
      const sum = this.engine.evalResultant(x, t);
      this.onInspectorUpdate({ x, vals, sum });
    }
  }

  setMode(mode) {
    this.mode = mode;
    const c = this.canvas;
    c.classList.remove('mode-pan', 'mode-select', 'mode-inspect');
    c.classList.add(`mode-${mode}`);
    this.showInspector = (mode === 'inspect');
    if (!this._running) this.draw();
  }
}
