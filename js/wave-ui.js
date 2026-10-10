/**
 * ============================================================================
 * INTERFAZ DE USUARIO DEL SIMULADOR DE ONDAS — MOVIMIENTO ONDULATORIO
 * Gestión del DOM: panel de ondas, teclado virtual, paleta de estilos,
 * modal ampliada, inspector, ejemplos, exportar/importar.
 * ============================================================================
 */

class WaveUI {
  constructor() {
    this.engine = new WaveEngine();

    // Canvases (principal y modal) — distancias en cm y tiempo en s por defecto
    this.mainCanvas  = new WaveCanvas('wave-canvas',       this.engine, { xMin: -2, xMax: 18, yMin: -5, yMax: 5, distanceUnit: 'cm', timeUnit: 's', showWavelength: true });
    this.modalCanvas = new WaveCanvas('wave-canvas-modal', this.engine, { xMin: -2, xMax: 18, yMin: -5, yMax: 5, distanceUnit: 'cm', timeUnit: 's', showWavelength: true });

    // ID de onda en edición
    this._editingWaveId = null;

    // Estado del teclado virtual
    this._vkExpr = '';
    this._vkWaveName = '';

    // ── Conectar el onTick del motor ──────────────────────────
    this.engine.onTick = (t) => {
      this._updateTimeBar(t);
      if (this._inspectorActive) this._refreshInspector();
    };

    // ── Conectar el inspector de cada canvas ─────────────────
    [this.mainCanvas, this.modalCanvas].forEach(cv => {
      cv.onInspectorUpdate = (data) => this._renderInspectorData(data);
    });

    this._init();
  }

  // ──────────────────────────────────────────────────────────────
  // INICIALIZACIÓN
  // ──────────────────────────────────────────────────────────────
  _init() {
    this._bindPlayControls();
    this._bindToolbar();
    this._bindPanelTabs();
    this._bindAddWave();
    this._bindVirtualKeyboard();
    this._bindPalette();
    this._bindModal();
    this._bindExport();
    this._bindExamples();
    this._bindResultantToggle();
    this._bindWindowResize();
    this._bindLambdaToggle();
    this._bindPhysicalParams();

    // Cargar la onda armónica con parámetros físicos en cm y s por defecto
    this._loadExampleByIndex(0); // "Onda Armónica Progresiva (cm, s)"

    // Arrancar animación (paused)
    this.mainCanvas.startAnimation();
    this.modalCanvas.startAnimation();
    this._updateTimeBar(0);
  }

  // ──────────────────────────────────────────────────────────────
  // CONTROLES DE REPRODUCCIÓN
  // ──────────────────────────────────────────────────────────────
  _bindPlayControls() {
    const btnPlay  = document.getElementById('sim-btn-play');
    const btnReset = document.getElementById('sim-btn-reset');
    const slider   = document.getElementById('sim-speed-slider');
    const speedVal = document.getElementById('sim-speed-val');

    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        if (this.engine.playing) {
          this.engine.pause();
          btnPlay.innerHTML = this._iconPlay() + ' <span>Reproducir</span>';
          btnPlay.classList.remove('is-paused');
        } else {
          this.engine.play();
          btnPlay.innerHTML = this._iconPause() + ' <span>Pausar</span>';
          btnPlay.classList.add('is-paused');
        }
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.engine.reset();
        if (btnPlay) {
          btnPlay.innerHTML = this._iconPlay() + ' <span>Reproducir</span>';
          btnPlay.classList.remove('is-paused');
        }
        this.mainCanvas.draw();
        this.modalCanvas.draw();
        this._updateTimeBar(0);
      });
    }

    if (slider) {
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.engine.speed = v;
        if (speedVal) speedVal.textContent = `×${v.toFixed(1)}`;
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // BARRA DE HERRAMIENTAS (MODOS + ZOOM)
  // ──────────────────────────────────────────────────────────────
  _bindToolbar() {
    const modes = ['pan', 'inspect'];
    modes.forEach(mode => {
      const btn = document.getElementById(`sim-btn-${mode}`);
      if (!btn) return;
      btn.addEventListener('click', () => {
        [this.mainCanvas, this.modalCanvas].forEach(cv => cv.setMode(mode));
        document.querySelectorAll('.btn-tool[id^="sim-btn-"]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const insp = document.getElementById('wave-inspector-panel');
        if (insp) insp.classList.toggle('is-visible', mode === 'inspect');
        this._inspectorActive = (mode === 'inspect');
      });
    });

    document.getElementById('sim-btn-pan')?.classList.add('is-active');

    document.getElementById('sim-btn-zoomin')?.addEventListener('click',  () => {
      this.mainCanvas.zoom(0.8); this.modalCanvas.zoom(0.8);
    });
    document.getElementById('sim-btn-zoomout')?.addEventListener('click', () => {
      this.mainCanvas.zoom(1.25); this.modalCanvas.zoom(1.25);
    });
    document.getElementById('sim-btn-reset-view')?.addEventListener('click', () => {
      this.mainCanvas.resetView(); this.modalCanvas.resetView();
    });

    // Botón de pantalla completa
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // TABS DEL PANEL
  // ──────────────────────────────────────────────────────────────
  _bindPanelTabs() {
    const tabs = document.querySelectorAll('.btn-panel-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        const target = tab.dataset.tab;
        document.querySelectorAll('.sim-tab-content').forEach(c => {
          c.style.display = c.id === `tab-${target}` ? 'flex' : 'none';
        });
      });
    });
  }

  // ──────────────────────────────────────────────────────────────
  // AGREGAR ONDA
  // ──────────────────────────────────────────────────────────────
  _bindAddWave() {
    document.getElementById('btn-add-wave')?.addEventListener('click', () => {
      this._openKeyboard(null);
    });
  }

  // ──────────────────────────────────────────────────────────────
  // PANEL DE ONDAS — RENDERIZADO
  // ──────────────────────────────────────────────────────────────
  renderWaveList() {
    const container = document.getElementById('wave-list-container');
    if (!container) return;
    container.innerHTML = '';

    this.engine.waves.forEach(wave => {
      const card = document.createElement('div');
      card.className = 'wave-card';
      card.dataset.waveId = wave.id;
      card.innerHTML = `
        <div class="wave-card-header">
          <div class="wave-color-dot" style="background:${wave.color}"></div>
          <span class="wave-card-name" title="${wave.name}">${wave.name}</span>
          <label class="wave-toggle" title="${wave.visible ? 'Ocultar onda' : 'Mostrar onda'}">
            <input type="checkbox" ${wave.visible ? 'checked' : ''} data-wave-id="${wave.id}" class="wave-visible-chk">
            <span class="wave-toggle-slider"></span>
          </label>
          <button class="btn-wave-action" title="Editar onda" data-action="edit" data-wave-id="${wave.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          </button>
          <button class="btn-wave-action delete" title="Eliminar onda" data-action="delete" data-wave-id="${wave.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
        <div class="wave-card-body">
          <div class="wave-formula-display" data-action="edit" data-wave-id="${wave.id}" title="Haz clic para editar">
            ${wave.expression || '<span style="color:#94a3b8">Sin expresión</span>'}
          </div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap;">
            <label style="font-size:.74rem;color:#64748b;font-weight:600;">Excluir de suma:</label>
            <label class="wave-toggle" title="Excluir del principio de superposición" style="width:30px;height:16px;">
              <input type="checkbox" ${wave.excludeFromSum ? 'checked' : ''} data-wave-id="${wave.id}" class="wave-exclude-chk">
              <span class="wave-toggle-slider"></span>
            </label>
          </div>
        </div>`;
      container.appendChild(card);
    });

    // Eventos
    container.querySelectorAll('[data-action="edit"]').forEach(el => {
      el.addEventListener('click', () => this._openKeyboard(parseInt(el.dataset.waveId)));
    });
    container.querySelectorAll('[data-action="delete"]').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.waveId);
        this.engine.removeWave(id);
        this.renderWaveList();
      });
    });
    container.querySelectorAll('.wave-visible-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        this.engine.updateWave(parseInt(chk.dataset.waveId), { visible: chk.checked });
      });
    });
    container.querySelectorAll('.wave-exclude-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        this.engine.updateWave(parseInt(chk.dataset.waveId), { excludeFromSum: chk.checked });
      });
    });
  }

  // ──────────────────────────────────────────────────────────────
  // TECLADO VIRTUAL
  // ──────────────────────────────────────────────────────────────
  _bindVirtualKeyboard() {
    const overlay = document.getElementById('vk-overlay');
    if (!overlay) return;

    // Cerrar con Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (overlay.classList.contains('is-open')) {
          this._closeKeyboard();
          e.preventDefault();
        }
      }
    });

    // Cerrar con botón
    document.getElementById('btn-vk-close')?.addEventListener('click', () => this._closeKeyboard());
    overlay.addEventListener('click', e => { if (e.target === overlay) this._closeKeyboard(); });

    // Confirmar
    document.getElementById('btn-vk-confirm')?.addEventListener('click', () => this._vkConfirm());

    // Limpiar
    document.getElementById('btn-vk-clear')?.addEventListener('click', () => {
      this._vkExpr = '';
      this._updateVkDisplay();
    });

    // Botones del teclado
    document.querySelectorAll('.btn-vk[data-insert]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._vkExpr += btn.dataset.insert;
        this._updateVkDisplay();
        this._updateVkPreview();
      });
    });

    // Backspace
    document.getElementById('btn-vk-backspace')?.addEventListener('click', () => {
      this._vkExpr = this._vkExpr.slice(0, -1);
      this._updateVkDisplay();
      this._updateVkPreview();
    });

    // Input de nombre
    document.getElementById('vk-name-input')?.addEventListener('input', e => {
      this._vkWaveName = e.target.value;
    });
  }

  _openKeyboard(waveId) {
    this._editingWaveId = waveId;
    const overlay = document.getElementById('vk-overlay');
    if (!overlay) return;

    if (waveId !== null) {
      const wave = this.engine.waves.find(w => w.id === waveId);
      if (wave) {
        this._vkExpr = wave.expression || '';
        this._vkWaveName = wave.name || '';
        const nameInput = document.getElementById('vk-name-input');
        if (nameInput) nameInput.value = this._vkWaveName;
      }
    } else {
      this._vkExpr = '';
      this._vkWaveName = `Onda ${this.engine.waves.length + 1}`;
      const nameInput = document.getElementById('vk-name-input');
      if (nameInput) nameInput.value = this._vkWaveName;
    }

    this._updateVkDisplay();
    this._updateVkPreview();
    overlay.classList.add('is-open');
    document.getElementById('vk-name-input')?.focus();
  }

  _closeKeyboard() {
    document.getElementById('vk-overlay')?.classList.remove('is-open');
    this._editingWaveId = null;
  }

  _vkConfirm() {
    const nameInput = document.getElementById('vk-name-input');
    const name = (nameInput?.value || this._vkWaveName).trim() || `Onda ${this.engine.waves.length + 1}`;

    if (this._editingWaveId !== null) {
      this.engine.updateWave(this._editingWaveId, { expression: this._vkExpr, name });
    } else {
      this.engine.addWave({ expression: this._vkExpr, name });
    }

    this.renderWaveList();
    this._closeKeyboard();
  }

  _updateVkDisplay() {
    const display = document.getElementById('vk-formula-text');
    if (!display) return;
    display.textContent = this._vkExpr || '';
  }

  _updateVkPreview() {
    const preview = document.getElementById('vk-preview');
    if (!preview) return;
    try {
      const fn = WaveEngine._buildFunction(this._vkExpr);
      const val = fn(1, 0, 1);
      if (isFinite(val)) {
        preview.innerHTML = `✓ Válida &nbsp;|&nbsp; y(1, 0) ≈ <strong>${val.toFixed(4)}</strong>`;
        preview.style.color = '#34d399';
      } else {
        preview.textContent = '⚠ Resultado no finito en x=1, t=0';
        preview.style.color = '#fbbf24';
      }
    } catch(e) {
      preview.textContent = `✗ ${e.message}`;
      preview.style.color = '#f87171';
    }
  }

  // ──────────────────────────────────────────────────────────────
  // PALETA DE ESTILOS
  // ──────────────────────────────────────────────────────────────
  _bindPalette() {
    document.getElementById('btn-open-palette')?.addEventListener('click', () => {
      document.getElementById('palette-overlay')?.classList.add('is-open');
    });
    document.getElementById('btn-palette-close')?.addEventListener('click', () => {
      document.getElementById('palette-overlay')?.classList.remove('is-open');
    });
    document.getElementById('palette-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) document.getElementById('palette-overlay').classList.remove('is-open');
    });

    // Tema
    document.querySelectorAll('.btn-palette-theme').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        document.querySelectorAll('.btn-palette-theme').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        [this.mainCanvas, this.modalCanvas].forEach(cv => cv.applyTheme(theme));
      });
    });

    // Fondo del gráfico
    const bgColor = document.getElementById('pal-bg-color');
    bgColor?.addEventListener('input', () => {
      [this.mainCanvas, this.modalCanvas].forEach(cv => {
        cv.styleConfig.bgColor = bgColor.value;
        if (!cv._running) cv.draw();
      });
    });

    // Cuadrícula mayor
    document.getElementById('pal-grid-major-color')?.addEventListener('input', e => {
      [this.mainCanvas, this.modalCanvas].forEach(cv => { cv.styleConfig.gridMajorColor = e.target.value; if (!cv._running) cv.draw(); });
    });
    this._bindRangeSync('pal-grid-major-width', 'pal-grid-major-width-val', (v) => {
      [this.mainCanvas, this.modalCanvas].forEach(cv => { cv.styleConfig.gridMajorWidth = parseFloat(v); if (!cv._running) cv.draw(); });
    });
    // Cuadrícula menor
    document.getElementById('pal-grid-minor-color')?.addEventListener('input', e => {
      [this.mainCanvas, this.modalCanvas].forEach(cv => { cv.styleConfig.gridMinorColor = e.target.value; if (!cv._running) cv.draw(); });
    });
    this._bindRangeSync('pal-grid-minor-width', 'pal-grid-minor-width-val', (v) => {
      [this.mainCanvas, this.modalCanvas].forEach(cv => { cv.styleConfig.gridMinorWidth = parseFloat(v); if (!cv._running) cv.draw(); });
    });

    // Ejes
    document.getElementById('pal-axis-color')?.addEventListener('input', e => {
      [this.mainCanvas, this.modalCanvas].forEach(cv => { cv.styleConfig.axisColor = e.target.value; if (!cv._running) cv.draw(); });
    });
    this._bindRangeSync('pal-axis-width', 'pal-axis-width-val', v => {
      [this.mainCanvas, this.modalCanvas].forEach(cv => { cv.styleConfig.axisWidth = parseFloat(v); if (!cv._running) cv.draw(); });
    });

    // Tamaño etiquetas
    this._bindRangeSync('pal-label-size', 'pal-label-size-val', v => {
      [this.mainCanvas, this.modalCanvas].forEach(cv => { cv.styleConfig.labelSize = parseInt(v); if (!cv._running) cv.draw(); });
    });

    // Estilos de la onda seleccionada
    document.getElementById('pal-wave-select')?.addEventListener('change', () => this._updatePaletteForWave());
    document.getElementById('pal-wave-color')?.addEventListener('input', e => this._applyWavePalette('color', e.target.value));
    this._bindRangeSync('pal-wave-width', 'pal-wave-width-val', v => this._applyWavePalette('lineWidth', parseFloat(v)));
    this._bindRangeSync('pal-wave-opacity', 'pal-wave-opacity-val', v => this._applyWavePalette('opacity', parseFloat(v)));
    document.getElementById('pal-wave-dash')?.addEventListener('change', e => {
      const map = { solid: [], dashed: [8,5], dotted: [2,5], dashdot: [10,4,2,4] };
      this._applyWavePalette('lineDash', map[e.target.value] || []);
    });

    // Estilo de la resultante
    document.getElementById('pal-res-color')?.addEventListener('input', e => {
      this.engine.resultantStyle.color = e.target.value;
    });
    this._bindRangeSync('pal-res-width', 'pal-res-width-val', v => { this.engine.resultantStyle.lineWidth = parseFloat(v); });
    this._bindRangeSync('pal-res-opacity', 'pal-res-opacity-val', v => { this.engine.resultantStyle.opacity = parseFloat(v); });
    document.getElementById('pal-res-dash')?.addEventListener('change', e => {
      const map = { solid: [], dashed: [8,5], dotted: [2,5], dashdot: [10,4,2,4] };
      this.engine.resultantStyle.lineDash = map[e.target.value] || [];
    });
  }

  _bindRangeSync(rangeId, valId, callback) {
    const range = document.getElementById(rangeId);
    const val   = document.getElementById(valId);
    if (!range) return;
    range.addEventListener('input', () => {
      if (val) val.textContent = range.value;
      callback(range.value);
    });
  }

  _updatePaletteForWave() {
    const sel = document.getElementById('pal-wave-select');
    if (!sel) return;
    const id = parseInt(sel.value);
    const wave = this.engine.waves.find(w => w.id === id);
    if (!wave) return;
    const c = document.getElementById('pal-wave-color');   if (c) c.value = wave.color;
    const w = document.getElementById('pal-wave-width');   if (w) { w.value = wave.lineWidth; document.getElementById('pal-wave-width-val').textContent = wave.lineWidth; }
    const o = document.getElementById('pal-wave-opacity'); if (o) { o.value = wave.opacity;   document.getElementById('pal-wave-opacity-val').textContent = wave.opacity; }
  }

  _applyWavePalette(prop, value) {
    const sel = document.getElementById('pal-wave-select');
    if (!sel) return;
    const id = parseInt(sel.value);
    if (!isNaN(id)) {
      this.engine.updateWave(id, { [prop]: value });
      this.renderWaveList();
    }
  }

  _refreshPaletteWaveSelect() {
    const sel = document.getElementById('pal-wave-select');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = this.engine.waves.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    if (prev) sel.value = prev;
    this._updatePaletteForWave();
  }

  // ──────────────────────────────────────────────────────────────
  // MODAL AMPLIADA
  // ──────────────────────────────────────────────────────────────
  _bindModal() {
    const overlay = document.getElementById('wave-modal-overlay');
    const modal   = document.getElementById('wave-modal');

    document.getElementById('btn-open-modal')?.addEventListener('click', () => {
      overlay?.classList.add('is-open');
      setTimeout(() => this.modalCanvas.resize(), 50);
    });

    document.getElementById('btn-modal-close')?.addEventListener('click', () => {
      overlay?.classList.remove('is-open');
    });

    // Tecla Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay?.classList.contains('is-open') && !document.getElementById('vk-overlay')?.classList.contains('is-open')) {
        overlay.classList.remove('is-open');
        e.preventDefault();
      }
    });

    // Maximizar
    document.getElementById('btn-modal-maximize')?.addEventListener('click', () => {
      modal?.classList.toggle('is-maximized');
      setTimeout(() => this.modalCanvas.resize(), 50);
    });

    // Pantalla completa
    document.getElementById('btn-modal-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        modal?.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    // Minimizar (colapsar cuerpo)
    document.getElementById('btn-modal-minimize')?.addEventListener('click', () => {
      const body = modal?.querySelector('.wave-modal-body');
      if (body) body.style.display = body.style.display === 'none' ? 'grid' : 'none';
    });

    // Resize de la ventana modal
    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => this.modalCanvas.resize(), 50);
    });

    // Click fuera del modal
    overlay?.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('is-open');
    });

    // Toolbar del modal (los mismos botones del main)
    ['zoomin','zoomout','reset-view','pan','inspect'].forEach(id => {
      document.getElementById(`modal-btn-${id}`)?.addEventListener('click', () => {
        if (id === 'zoomin')     { this.modalCanvas.zoom(0.8); this.mainCanvas.zoom(0.8); }
        else if (id === 'zoomout')    { this.modalCanvas.zoom(1.25); this.mainCanvas.zoom(1.25); }
        else if (id === 'reset-view') { this.modalCanvas.resetView(); this.mainCanvas.resetView(); }
        else if (id === 'pan')   {
          [this.mainCanvas, this.modalCanvas].forEach(cv => cv.setMode('pan'));
          document.getElementById('sim-btn-pan')?.classList.add('is-active');
          document.getElementById('sim-btn-inspect')?.classList.remove('is-active');
        }
        else if (id === 'inspect') {
          [this.mainCanvas, this.modalCanvas].forEach(cv => cv.setMode('inspect'));
          document.getElementById('sim-btn-inspect')?.classList.add('is-active');
          document.getElementById('sim-btn-pan')?.classList.remove('is-active');
        }
      });
    });
  }

  // ──────────────────────────────────────────────────────────────
  // EJEMPLOS PREDEFINIDOS
  // ──────────────────────────────────────────────────────────────
  _bindExamples() {
    const container = document.getElementById('examples-container');
    if (!container) return;

    WaveEngine.EXAMPLES.forEach((ex, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn-example';
      btn.innerHTML = `
        <div class="example-icon">${ex.icon}</div>
        <div class="example-text">
          <div class="example-name">${ex.name}</div>
          <div class="example-desc">${ex.desc}</div>
        </div>`;
      btn.addEventListener('click', () => this._loadExampleByIndex(i));
      container.appendChild(btn);
    });
  }

  _loadExampleByIndex(i) {
    const ex = WaveEngine.EXAMPLES[i];
    if (!ex) return;
    this.engine.waves = [];
    this.engine._nextId = 1;
    ex.waves.forEach(w => this.engine.addWave(w));
    this.renderWaveList();
    this._refreshPaletteWaveSelect();
  }

  // ──────────────────────────────────────────────────────────────
  // TOGGLE RESULTANTE
  // ──────────────────────────────────────────────────────────────
  _bindResultantToggle() {
    document.getElementById('resultant-toggle')?.addEventListener('change', e => {
      this.engine.showResultant = e.target.checked;
    });
  }

  // ──────────────────────────────────────────────────────────────
  // INSPECTOR
  // ──────────────────────────────────────────────────────────────
  get _inspectorActive() { return this.__inspectorActive || false; }
  set _inspectorActive(v) { this.__inspectorActive = v; }

  _refreshInspector() {
    const x = this.mainCanvas.inspectorX ?? 0;
    const t = this.engine.time;
    const vals = this.engine.waves.map(w => ({
      name: w.name, color: w.color,
      value: this.engine.evalWave(w, x, t),
      excluded: w.excludeFromSum
    }));
    const sum = this.engine.evalResultant(x, t);
    this._renderInspectorData({ x, vals, sum });
  }

  _renderInspectorData({ x, vals, sum }) {
    const panel = document.getElementById('wave-inspector-panel');
    if (!panel) return;
    let html = `<div class="inspector-title">🔍 Inspector x = ${x.toFixed(3)}</div>`;
    vals.forEach(v => {
      const y = isFinite(v.value) ? v.value.toFixed(4) : '—';
      html += `<div class="inspector-row">
        <span class="inspector-label" style="color:${v.color}">${v.name}${v.excluded ? ' (excl.)' : ''}</span>
        <span class="inspector-value" style="color:${v.color}">${y}</span>
      </div>`;
    });
    html += `<div class="inspector-row inspector-sum">
      <span class="inspector-label">Σ Resultante</span>
      <span class="inspector-value">${isFinite(sum) ? sum.toFixed(4) : '—'}</span>
    </div>`;
    panel.innerHTML = html;
    panel.classList.add('is-visible');
  }

  // ──────────────────────────────────────────────────────────────
  // EXPORTAR / IMPORTAR
  // ──────────────────────────────────────────────────────────────
  _bindExport() {
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      const json = this.engine.exportJSON();
      const a = document.createElement('a');
      a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
      a.download = 'ondas-config.json';
      a.click();
    });

    document.getElementById('btn-import-json')?.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const ok = this.engine.importJSON(reader.result);
          if (ok) {
            this.renderWaveList();
            this._refreshPaletteWaveSelect();
            this.mainCanvas.draw();
            this.modalCanvas.draw();
          } else {
            alert('Error al importar el archivo JSON.');
          }
        };
        reader.readAsText(file);
      });
      inp.click();
    });

    document.getElementById('btn-export-img')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = this.mainCanvas.canvas.toDataURL('image/png');
      a.download = 'ondas.png';
      a.click();
    });
  }

  // ──────────────────────────────────────────────────────────────
  // BARRA DE TIEMPO
  // ──────────────────────────────────────────────────────────────
  _updateTimeBar(t) {
    const el = document.getElementById('sim-time-value');
    if (el) el.textContent = `t = ${t.toFixed(3)} s`;
  }

  // ──────────────────────────────────────────────────────────────
  // RESIZE DE VENTANA
  // ──────────────────────────────────────────────────────────────
  _bindWindowResize() {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.mainCanvas.resize();
        if (document.getElementById('wave-modal-overlay')?.classList.contains('is-open')) {
          this.modalCanvas.resize();
        }
      }, 100);
    });
  }

  // ──────────────────────────────────────────────────────────────
  // ICONOS SVG INLINE
  // ──────────────────────────────────────────────────────────────
  _iconPlay()  { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>`; }
  _iconPause() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; }

  // ──────────────────────────────────────────────────────────────
  // TOGGLE DE MEDICIÓN DE LONGITUD DE ONDA (λ) Y UNIDADES
  // ──────────────────────────────────────────────────────────────
  _bindLambdaToggle() {
    const btn = document.getElementById('btn-toggle-lambda');
    const modalBtn = document.getElementById('modal-btn-lambda');
    const unitSelect = document.getElementById('sim-unit-select');

    const toggle = () => {
      const active = !this.mainCanvas.showWavelength;
      this.mainCanvas.showWavelength = active;
      this.modalCanvas.showWavelength = active;
      [btn, modalBtn].forEach(b => {
        if (!b) return;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (!this.engine.playing) {
        this.mainCanvas.draw();
        this.modalCanvas.draw();
      }
    };

    btn?.addEventListener('click', toggle);
    modalBtn?.addEventListener('click', toggle);

    unitSelect?.addEventListener('change', (e) => {
      const u = e.target.value;
      this.mainCanvas.distanceUnit = u;
      this.modalCanvas.distanceUnit = u;
      document.querySelectorAll('.unit-dist-label').forEach(el => el.textContent = u);
      if (!this.engine.playing) {
        this.mainCanvas.draw();
        this.modalCanvas.draw();
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // PARÁMETROS FÍSICOS (A, λ, f, v, k, ω)
  // ──────────────────────────────────────────────────────────────
  _bindPhysicalParams() {
    const inA = document.getElementById('param-amplitude');
    const inLambda = document.getElementById('param-lambda');
    const inFreq = document.getElementById('param-freq');
    const valA = document.getElementById('param-amp-val');
    const valLambda = document.getElementById('param-lambda-val');
    const valFreq = document.getElementById('param-freq-val');
    const calcV = document.getElementById('param-calc-v');
    const calcK = document.getElementById('param-calc-k');
    const calcOmega = document.getElementById('param-calc-omega');
    const calcT = document.getElementById('param-calc-t');
    const eqPreview = document.getElementById('param-eq-preview');
    const btnApply = document.getElementById('btn-apply-phys-params');

    if (!inA || !inLambda || !inFreq) return;

    const updateCalc = () => {
      const A = parseFloat(inA.value) || 3;
      const lambda = parseFloat(inLambda.value) || 8;
      const f = parseFloat(inFreq.value) || 0.5;

      const T = (1 / f);
      const v = lambda * f;
      const k = (2 * Math.PI / lambda);
      const omega = (2 * Math.PI * f);

      if (valA) valA.textContent = `${A.toFixed(1)} cm`;
      if (valLambda) valLambda.textContent = `${lambda.toFixed(1)} cm`;
      if (valFreq) valFreq.textContent = `${f.toFixed(2)} Hz`;
      if (calcV) calcV.textContent = `${v.toFixed(2)} cm/s`;
      if (calcK) calcK.textContent = `${k.toFixed(3)} rad/cm`;
      if (calcOmega) calcOmega.textContent = `${omega.toFixed(3)} rad/s`;
      if (calcT) calcT.textContent = `${T.toFixed(2)} s`;

      if (eqPreview) {
        eqPreview.textContent = `y(x,t) = ${A} · sen(${k.toFixed(3)}x - ${omega.toFixed(3)}t)`;
      }
    };

    [inA, inLambda, inFreq].forEach(inp => inp.addEventListener('input', updateCalc));
    updateCalc();

    btnApply?.addEventListener('click', () => {
      const A = parseFloat(inA.value) || 3;
      const lambda = parseFloat(inLambda.value) || 8;
      const f = parseFloat(inFreq.value) || 0.5;
      const k = (2 * Math.PI / lambda);
      const omega = (2 * Math.PI * f);

      const expr = `${A} * Math.sin(${k.toFixed(4)} * x - ${omega.toFixed(4)} * t)`;

      if (this.engine.waves.length > 0) {
        this.engine.waves[0].expression = expr;
        this.engine.waves[0].name = `Onda (A=${A}cm, λ=${lambda}cm)`;
      } else {
        this.engine.addWave({
          name: `Onda (A=${A}cm, λ=${lambda}cm)`,
          expression: expr,
          color: '#2563eb',
          lineWidth: 2.5
        });
      }
      this.renderWaveList();
      this.mainCanvas.showWavelength = true;
      this.modalCanvas.showWavelength = true;
      document.getElementById('btn-toggle-lambda')?.classList.add('is-active');
      document.getElementById('modal-btn-lambda')?.classList.add('is-active');
      this.mainCanvas.draw();
      this.modalCanvas.draw();
    });
  }
}

// ──────────────────────────────────────────────────────────────────
// ARRANQUE GLOBAL
// ──────────────────────────────────────────────────────────────────
let waveUI;
function initWaveSimulator() {
  if (waveUI) return;
  waveUI = new WaveUI();
  window.waveUI = waveUI;
}
window.initWaveSimulator = initWaveSimulator;

