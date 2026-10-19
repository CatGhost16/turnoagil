/* ==========================================================
   Turno Ágil · lógica de la página
   ========================================================== */
(() => {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const KEYS = { cuenta: 'turnoagil.cuenta', sesion: 'turnoagil.sesion', turno: 'turnoagil.turno' };
  const ROUTES = ['inicio', 'registro', 'menu', 'solicitar', 'turno', 'centros', 'perfil'];
  const PROTECTED = ['menu', 'solicitar', 'turno', 'perfil'];
  const TICK_MS = 8000; // cada cuánto avanza la cola (simulación)

  /* ---------- Almacenamiento ---------- */
  const memory = {};
  const store = {
    get(key) {
      try { const raw = localStorage.getItem(key); if (raw !== null) return JSON.parse(raw); } catch (_) {}
      return memory[key] ?? null;
    },
    set(key, value) {
      memory[key] = value;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    },
    remove(key) {
      delete memory[key];
      try { localStorage.removeItem(key); } catch (_) {}
    }
  };

  const state = { data: null, slot: null, mode: null, toastTimer: null, firstRender: true };

  const getCuenta = () => store.get(KEYS.cuenta);
  const getTurno = () => store.get(KEYS.turno);
  const isLogged = () => Boolean(store.get(KEYS.sesion) && getCuenta());

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#${id}"></use></svg>`;

  /* ---------- Datos ---------- */
  async function loadData() {
    try {
      const res = await fetch('data/data.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (err) {
      // Si abres index.html con doble clic (file://) el navegador bloquea fetch.
      // Usa "Live Server" de VS Code para leer el JSON real; mientras tanto hay datos mínimos.
      console.warn('No se pudo leer data/data.json, usando datos mínimos.', err);
      return FALLBACK;
    }
  }

  /* ---------- Toast ---------- */
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4200);
  }

  /* ---------- Render ---------- */
  function bindStatic() {
    $$('[data-bind]').forEach((el) => {
      const val = el.dataset.bind.split('.').reduce((o, k) => (o == null ? o : o[k]), state.data);
      if (val != null) el.textContent = val;
    });
  }

  function renderPasos() {
    $('#pasos').innerHTML = state.data.pasos.map((p) => `
      <li class="step">
        <span class="step__n" aria-hidden="true">${esc(p.n)}</span>
        <div><h3>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p></div>
      </li>`).join('');
  }

  function renderMenu() {
    $('#menu-grid').innerHTML = state.data.menu.map((m) => `
      <a class="menu-card" href="#${esc(m.destino)}">
        <span class="menu-card__icon">${icon(m.icono)}</span>
        <span class="menu-card__title">${esc(m.titulo)}</span>
      </a>`).join('');
  }

  function renderCentros() {
    const nombreServicio = (id) => state.data.servicios.find((s) => s.id === id)?.nombre ?? id;
    $('#centros-list').innerHTML = state.data.centros.map((c) => `
      <article class="card centro">
        <h2>${esc(c.nombre)}</h2>
        <p class="centro__line">${icon('i-pin')} ${esc(c.direccion)}</p>
        <p class="centro__line">${icon('i-clock')} ${esc(c.horario)}</p>
        <p class="centro__line">${icon('i-phone')} ${esc(c.telefono)}</p>
        <ul class="chips">${c.servicios.map((s) => `<li>${esc(nombreServicio(s))}</li>`).join('')}</ul>
        <button class="btn btn--block" type="button" data-centro="${esc(c.id)}">Solicitar aquí</button>
      </article>`).join('');
  }

  /* ---------- sesión / usuario ---------- */
  function renderUser() {
    const cuenta = getCuenta();
    const logged = isLogged();
    document.body.dataset.session = logged ? 'in' : 'out';
    const primerNombre = cuenta?.nombre?.trim().split(/\s+/)[0] ?? '';
    $$('[data-user-name]').forEach((el) => { el.textContent = primerNombre; });
    if (cuenta) {
      $('#p-nombre').textContent = cuenta.nombre;
      $('#p-dni').textContent = '••••' + cuenta.dni.slice(-4);
      $('#p-celular').textContent = cuenta.celular;
    }
  }

  /* ---------- Turno ---------- */
  const textoPosicion = (t) => t.posicion <= 1
    ? 'Eres el siguiente en ser atendido.'
    : `Estás en la posición ${t.posicion} de ${t.total} pacientes.`;

  function renderTurno() {
    const t = getTurno();
    $('#turno-empty').hidden = Boolean(t);
    $('#turno-view').hidden = !t;
    if (!t) return;

    const ahora = t.posicion <= 1;
    const pct = Math.round(((t.total - t.posicion) / t.total) * 100);

    $('#t-code').textContent = t.codigo;
    $('#t-pos').textContent = textoPosicion(t);
    $('#t-bar').style.width = pct + '%';
    $('#t-progress').setAttribute('aria-valuenow', String(pct));
    $('#t-espera').textContent = ahora ? 'Es tu turno' : `${t.posicion * t.minutosPorPaciente} minutos`;
    $('#t-aviso').textContent = ahora
      ? '¡Es tu turno! Acércate al módulo de atención.'
      : 'Te notificaremos cuando falte poco para la atención.';
    $('#ticket').classList.toggle('is-now', ahora);
    $('#t-servicio').textContent = t.servicio;
    $('#t-centro').textContent = t.centro;
    $('#t-hora').textContent = t.hora;
  }

  function renderResumen() {
    const t = getTurno();
    $('#resumen').innerHTML = t
      ? `<p class="summary__code">${esc(t.codigo)}</p>
         <p>${esc(textoPosicion(t))}</p>
         <p class="muted">${esc(t.servicio)} · ${esc(t.centro)}</p>
         <a class="btn btn--block" href="#turno">Ver mi turno</a>`
      : `<p class="muted">No tienes turnos activos por ahora.</p>
         <a class="btn btn--block" href="#solicitar">Solicitar turno</a>`;
  }

  function crearTurno(servicio, centro, hora) {
    const total = 8 + Math.floor(Math.random() * 8);                 // 8 a 15 pacientes
    const posicion = 3 + Math.floor(Math.random() * (total - 3));    // 3 a total-1
    const numero = 1 + Math.floor(Math.random() * 90);
    return {
      codigo: `${servicio.prefijo}-${String(numero).padStart(3, '0')}`,
      servicio: servicio.nombre,
      centro: centro.nombre,
      hora,
      posicion,
      total,
      minutosPorPaciente: servicio.minutosPorPaciente || 3
    };
  }

  function tick() {
    const t = getTurno();
    if (!t || t.posicion <= 1 || document.hidden) return;
    t.posicion -= 1;
    store.set(KEYS.turno, t);
    renderTurno();
    renderResumen();
    if (t.posicion === 1) toast('¡Es tu turno! Acércate al módulo de atención.');
    else if (t.posicion === 3) toast('Falta poco para tu atención.');
  }

  /* ---------- Solicitar turno ---------- */
  // Cupos simulados y estables: 0 = agotado
  function cupos(centroId, servicioId, hora) {
    let h = 7;
    for (const ch of `${centroId}|${servicioId}|${hora}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 6;
  }

  function fillServicios() {
    $('#sel-servicio').innerHTML = '<option value="">Selecciona un servicio</option>' +
      state.data.servicios.map((s) => `<option value="${esc(s.id)}">${esc(s.nombre)}</option>`).join('');
    fillCentros();
  }

  function fillCentros(preferido) {
    const sel = $('#sel-centro');
    const servicioId = $('#sel-servicio').value;
    const actual = preferido ?? sel.value;
    const lista = state.data.centros.filter((c) => !servicioId || c.servicios.includes(servicioId));
    sel.innerHTML = '<option value="">Selecciona un centro de salud</option>' +
      lista.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
    if (lista.some((c) => c.id === actual)) sel.value = actual;
  }

  function resetSlots() {
    state.slot = null;
    $('#slots').innerHTML = '';
    $('#slots-hint').textContent = 'Aquí verás los horarios cuando busques disponibilidad.';
    $('#btn-confirmar').hidden = true;
    $('#btn-confirmar').disabled = true;
  }

  function buscarDisponibilidad(e) {
    e.preventDefault();
    const servicio = state.data.servicios.find((s) => s.id === $('#sel-servicio').value);
    const centro = state.data.centros.find((c) => c.id === $('#sel-centro').value);
    const err = $('#err-solicitar');
    if (!servicio || !centro) {
      err.textContent = 'Selecciona un servicio y un centro de salud.';
      return;
    }
    err.textContent = '';
    resetSlots();

    const slots = state.data.franjas.map((hora) => ({ hora, n: cupos(centro.id, servicio.id, hora) }));
    const libres = slots.filter((s) => s.n > 0).length;
    $('#slots-hint').textContent = `${servicio.nombre} · ${centro.nombre}: ${libres} horarios con cupo.`;
    $('#slots').innerHTML = slots.map((s) => `
      <button class="slot" type="button" data-hora="${esc(s.hora)}" aria-pressed="false" ${s.n === 0 ? 'disabled' : ''}>
        <strong>${esc(s.hora)}</strong>
        <small>${s.n === 0 ? 'Agotado' : s.n === 1 ? '1 cupo' : s.n + ' cupos'}</small>
      </button>`).join('');
    $('#btn-confirmar').hidden = false;
  }

  function elegirSlot(btn) {
    $$('.slot').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    state.slot = btn.dataset.hora;
    $('#btn-confirmar').disabled = false;
  }

  function confirmarTurno() {
    const servicio = state.data.servicios.find((s) => s.id === $('#sel-servicio').value);
    const centro = state.data.centros.find((c) => c.id === $('#sel-centro').value);
    if (!servicio || !centro || !state.slot) return;
    const turno = crearTurno(servicio, centro, state.slot);
    store.set(KEYS.turno, turno);
    toast(`¡Listo! Tu turno es ${turno.codigo}.`);
    resetSlots();
    location.hash = 'turno';
  }

  /* ---------- Registro / inicio de sesión ---------- */
  const rules = {
    nombre:   (v) => (v.trim().length >= 3 && /^[\p{L}\s'.-]+$/u.test(v.trim())) ? '' : 'Ingresa tu nombre completo.',
    dni:      (v) => /^\d{8}$/.test(v) ? '' : 'El DNI debe tener 8 dígitos.',
    celular:  (v) => /^9\d{8}$/.test(v) ? '' : 'Ingresa 9 dígitos y que empiece con 9.',
    password: (v) => v.length >= 6 ? '' : 'La contraseña debe tener al menos 6 caracteres.'
  };

  function setError(field, msg) {
    const input = $(`#f-${field}`);
    $(`#err-${field}`).textContent = msg;
    input.classList.toggle('is-invalid', Boolean(msg));
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) input.setAttribute('aria-describedby', `err-${field}`);
    else input.removeAttribute('aria-describedby');
  }

  function setMode(mode) {
    $('[data-screen="registro"]').dataset.mode = mode;
    $('#btn-auth').textContent = mode === 'login' ? 'Iniciar sesión' : 'Registrarse';
    $('#f-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    ['nombre', 'dni', 'celular', 'password'].forEach((f) => setError(f, ''));
  }

  function submitAuth(e) {
    e.preventDefault();
    const mode = $('[data-screen="registro"]').dataset.mode;
    const fields = mode === 'login' ? ['dni', 'password'] : ['nombre', 'dni', 'celular', 'password'];
    const val = (f) => $(`#f-${f}`).value;

    let primerError = null;
    fields.forEach((f) => {
      const msg = rules[f](val(f));
      setError(f, msg);
      if (msg && !primerError) primerError = f;
    });
    if (primerError) { $(`#f-${primerError}`).focus(); return; }

    if (mode === 'register') {
      // Demo: la contraseña NO se guarda. Una app real validaría en un servidor.
      store.set(KEYS.cuenta, { nombre: val('nombre').trim(), dni: val('dni'), celular: val('celular') });
    } else {
      const cuenta = getCuenta();
      if (!cuenta || cuenta.dni !== val('dni')) {
        setError('dni', 'No encontramos una cuenta con ese DNI. Regístrate primero.');
        $('#f-dni').focus();
        return;
      }
    }
    store.set(KEYS.sesion, true);
    $('#f-password').value = '';
    renderUser();
    toast(mode === 'login' ? 'Bienvenido de nuevo.' : '¡Cuenta creada con éxito!');
    location.hash = 'menu';
  }

  /* ---------- Router ---------- */
  function currentRoute() {
    const r = location.hash.slice(1);
    return ROUTES.includes(r) ? r : 'inicio';
  }

  function render() {
    let route = currentRoute();
    const logged = isLogged();

    if (PROTECTED.includes(route) && !logged) {
      toast('Primero regístrate o inicia sesión.');
      route = 'registro';
      history.replaceState(null, '', '#registro');
    }

    $$('.screen').forEach((s) => { s.hidden = s.dataset.screen !== route; });

    // enlaces "Inicio": menú si hay sesión, pantalla de inicio si no
    $$('[data-route="home"]').forEach((a) => { a.setAttribute('href', logged ? '#menu' : '#inicio'); });
    $$('[data-route]').forEach((a) => {
      const target = a.dataset.route === 'home' ? (logged ? 'menu' : 'inicio') : a.dataset.route;
      if (target === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    renderUser();
    if (route === 'registro') {
      setMode(state.mode ?? (getCuenta() && !logged ? 'login' : 'register'));
      state.mode = null;
    }
    if (route === 'menu') renderResumen();
    if (route === 'turno') renderTurno();
    if (route === 'solicitar') fillCentros();

    window.scrollTo(0, 0);
    if (!state.firstRender) {
      const h = $(`[data-screen="${route}"] h1`);
      if (h) h.focus({ preventScroll: true });
    }
    state.firstRender = false;
  }

  /* ---------- Eventos ---------- */
  function wire() {
    window.addEventListener('hashchange', render);
    $('#form-auth').addEventListener('submit', submitAuth);
    $('#form-solicitar').addEventListener('submit', buscarDisponibilidad);
    $('#sel-servicio').addEventListener('change', () => { fillCentros(); resetSlots(); });
    $('#sel-centro').addEventListener('change', resetSlots);
    $('#btn-confirmar').addEventListener('click', confirmarTurno);

    $('#slots').addEventListener('click', (e) => {
      const btn = e.target.closest('.slot');
      if (btn && !btn.disabled) elegirSlot(btn);
    });

    $('#btn-demo').addEventListener('click', () => {
      store.set(KEYS.turno, { ...state.data.turnoDemo });
      renderTurno();
    });

    $('#btn-cancelar').addEventListener('click', () => {
      if (window.confirm('¿Seguro que quieres cancelar tu turno?')) {
        store.remove(KEYS.turno);
        renderTurno();
        toast('Tu turno fue cancelado.');
      }
    });

    $('#btn-logout').addEventListener('click', () => {
      store.remove(KEYS.sesion);
      toast('Cerraste sesión.');
      location.hash = 'inicio';
      render();
    });

    document.addEventListener('click', (e) => {
      const modeLink = e.target.closest('[data-mode-link]');
      if (modeLink) state.mode = modeLink.dataset.modeLink;

      const sw = e.target.closest('[data-switch-mode]');
      if (sw) { setMode(sw.dataset.switchMode); $('#t-registro').focus({ preventScroll: true }); }

      const eye = e.target.closest('[data-toggle-password]');
      if (eye) {
        const input = $('#f-password');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        eye.setAttribute('aria-pressed', String(show));
        eye.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      }

      const centro = e.target.closest('[data-centro]');
      if (centro) {
        $('#sel-servicio').value = '';
        fillCentros(centro.dataset.centro);
        resetSlots();
        location.hash = 'solicitar';
      }
    });

    // Solo números en DNI y celular
    ['#f-dni', '#f-celular'].forEach((sel) => {
      $(sel).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
    });
  }

  /* ---------- Inicio ---------- */
  async function init() {
    state.data = await loadData();
    bindStatic();
    renderPasos();
    renderMenu();
    renderCentros();
    fillServicios();
    wire();
    if (!location.hash && isLogged()) history.replaceState(null, '', '#menu');
    render();
    setInterval(tick, TICK_MS);
  }

  /* ---------- Datos de respaldo ---------- */
  const FALLBACK = {
    app: { nombre: 'Turno Ágil', lema: 'Tu turno, sin tanta espera', version: 'Boceto · Primera versión (prototipo)',
           descripcion: 'Aplicación web que permite a los pacientes registrarse, conocer su turno y ver en tiempo real cuánto falta para ser atendidos.' },
    pasos: [],
    menu: [
      { id: 'solicitar', titulo: 'Solicitar turno', icono: 'i-calendar', destino: 'solicitar' },
      { id: 'turnos', titulo: 'Mis turnos', icono: 'i-clock', destino: 'turno' },
      { id: 'centros', titulo: 'Centros de salud', icono: 'i-building', destino: 'centros' },
      { id: 'perfil', titulo: 'Mi perfil', icono: 'i-user', destino: 'perfil' }
    ],
    servicios: [{ id: 'medicina-general', nombre: 'Medicina General', prefijo: 'A', minutosPorPaciente: 3 }],
    centros: [{ id: 'algarrobos', nombre: 'Hospital Los Algarrobos', direccion: 'Dirección de ejemplo',
                telefono: '(01) 555-0101', horario: 'Lun a Sáb · 7:00 a 19:00', servicios: ['medicina-general'] }],
    franjas: ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30'],
    turnoDemo: { codigo: 'A-023', servicio: 'Medicina General', centro: 'Hospital Los Algarrobos',
                 hora: '09:30', posicion: 5, total: 12, minutosPorPaciente: 3 }
  };

  document.addEventListener('DOMContentLoaded', init);
})();