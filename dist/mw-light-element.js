/* mw-ha-light-element — custom:mw-light-element
 * Elemento de picture-elements: a luz na planta, pintada pelo estado
 * (ligada / apagada / indisponível / desconhecido).
 *
 * v1.1 — identidade no editor: a linha da lista do picture-elements deixa de
 *   ser "custom:mw-light-element / Unknown type" e passa a ser "Luz" com o
 *   `title:` (ou o friendly_name da entidade) embaixo. Bloco compartilhado
 *   mw-element-identity v1 — fonte em IA/lib/.
 *
 * v1.0 — reescrito para velocidade:
 *  · DOM montado UMA vez; atualizar = trocar atributo + custom properties
 *    (zero innerHTML, zero re-parse de CSS, zero recriação de <ha-icon>);
 *  · folha de estilo única compartilhada por TODAS as instâncias
 *    (adoptedStyleSheets) — 40 luzes na planta = 1 CSS parseado;
 *  · o `set hass` compara a referência do state object e sai em O(1)
 *    quando a mudança é de outra entidade (o HA empurra `hass` a cada
 *    mudança de QUALQUER entidade — era aqui que a planta engasgava);
 *  · toque otimista: a bolinha acende no dedo, sem esperar o round-trip;
 *  · animações só em `transform`/`opacity` (composição na GPU);
 *  · geometria em % + aspect-ratio + unidades de container: a luz mantém a
 *    proporção da planta em qualquer tamanho de tela.
 *
 * JS puro, arquivo único, sem build.
 * Repo: https://github.com/visaodeempresa/mw-ha-light-element
 */
(() => {
  "use strict";

  const VERSION = "1.1.0";

  /* ------------------------------------------ identidade no editor */
  // >>> mw-element-identity v1 — fonte canônica: /Volumes/SSD-T1-01/CLAUDE-SSD/IA/lib/mw-element-identity/mw-element-identity.js
  // Identidade dos elementos MW na lista do editor do picture-elements.
  // Detalhes e justificativa: IA/knowledge/ha-picture-elements-editor.md.
  const MW_ID_PREFIX = "ui.panel.lovelace.editor.card.picture-elements.element_types.";
  const MW_ID_ROW = "hui-picture-elements-card-row-editor";

  // registro no padrão do window.customCards, só que para elementos
  const MW_WIN = (() => {
    const w = typeof window !== "undefined" ? window : globalThis;
    if (!w.mwPictureElements) w.mwPictureElements = [];
    if (!w.__mwElementIdentity) w.__mwElementIdentity = { wrap: null };
    return w;
  })();

  const mwEntry = (type) =>
    MW_WIN.mwPictureElements.find((e) => e && e.type === type) || null;

  // Linha 1 — embrulha o localize do hass para responder à chave do nosso tipo.
  // Só intercepta chaves do prefixo acima; qualquer outra vai inteira ao HA.
  const mwElementIdentity = (hass) => {
    try {
      const st = MW_WIN.__mwElementIdentity;
      if (!hass || typeof hass.localize !== "function") return;
      if (hass.localize === st.wrap) return;          // já é o nosso
      const orig = hass.localize;
      const wrap = function (key) {
        if (typeof key === "string" && key.indexOf(MW_ID_PREFIX) === 0) {
          const hit = mwEntry(key.slice(MW_ID_PREFIX.length));
          if (hit && hit.name) return hit.name;
        }
        return orig.apply(this, arguments);
      };
      hass.localize = wrap;
      if (hass.localize !== wrap) return;             // objeto congelado
      st.wrap = wrap;
      mwRefreshRows();
    } catch (e) { /* editor bonito não vale um erro em tela */ }
  };

  // Linha 2 — o `title` da config já resolve nativamente; isto só acrescenta
  // uma reserva boa (nome amigável da entidade) quando não há título.
  // Se o HA renomear o método interno, sai de cena sem barulho.
  let mwSecondaryAsked = false;
  const mwPatchSecondary = () => {
    try {
      if (mwSecondaryAsked) return;
      if (typeof customElements === "undefined") return;
      if (typeof customElements.whenDefined !== "function") return;
      mwSecondaryAsked = true;
      customElements.whenDefined(MW_ID_ROW).then(() => {
        const cls = customElements.get(MW_ID_ROW);
        const proto = cls && cls.prototype;
        if (!proto || proto.__mwSecondary) return;
        const orig = proto._getSecondaryDescription;
        if (typeof orig !== "function") return;
        proto._getSecondaryDescription = function (element) {
          try {
            const el = element || {};
            const hit = mwEntry(el.type);
            if (hit) {
              if (el.title) return el.title;
              const st = el.entity && this.hass && this.hass.states[el.entity];
              return (st && st.attributes && st.attributes.friendly_name)
                || el.entity || hit.description || hit.name || "";
            }
          } catch (e) { /* cai no original */ }
          return orig.apply(this, arguments);
        };
        proto.__mwSecondary = true;
      }).catch(() => {});
    } catch (e) { /* idem */ }
  };

  // A lista já desenhada não sabe que ganhou nome — pede redesenho. Só custa
  // varredura quando o editor do picture-elements chegou a ser carregado.
  const mwRefreshRows = () => {
    try {
      if (typeof customElements === "undefined" || !customElements.get(MW_ID_ROW)) return;
      if (typeof document === "undefined" || !document.body) return;
      setTimeout(() => {
        const seen = new Set();
        const walk = (root, depth) => {
          if (!root || depth > 14) return;
          let nodes;
          try { nodes = root.querySelectorAll("*"); } catch (e) { return; }
          for (const n of nodes) {
            if (n.localName === MW_ID_ROW && typeof n.requestUpdate === "function") {
              n.requestUpdate();
            }
            const sr = n.shadowRoot;
            if (sr && !seen.has(sr)) { seen.add(sr); walk(sr, depth + 1); }
          }
        };
        try { walk(document.body, 0); } catch (e) { /* nada */ }
      }, 0);
    } catch (e) { /* nada */ }
  };

  const mwRegisterElement = (entry) => {
    if (!entry || !entry.type) return;
    const list = MW_WIN.mwPictureElements;
    const i = list.findIndex((e) => e && e.type === entry.type);
    if (i < 0) list.push(entry); else list[i] = entry;
    mwPatchSecondary();
    // o hass já existe quando o recurso do dashboard carrega; pegar agora faz
    // a primeira abertura do editor já sair com o nome certo
    try {
      const root = document.querySelector && document.querySelector("home-assistant");
      if (root && root.hass) mwElementIdentity(root.hass);
    } catch (e) { /* nada */ }
  };

  // Campo do editor: é o `title` que o HA lê na segunda linha da lista.
  const MW_TITLE_LABEL = "Título (lista do editor)";
  const MW_TITLE_FIELD = { name: "title", selector: { text: {} } };
  // <<< mw-element-identity v1

  const DEFAULTS = {
    // --- entidade ---
    entity: "",
    name: "",                  // tooltip; vazio = friendly_name
    title: "",                 // rótulo na lista do editor; não aparece na planta
    invert: false,             // entidade invertida (on = apagada)

    // --- geometria (% = acompanha a planta ao redimensionar) ---
    left: "",
    top: "",
    size: "5%",                // diâmetro em % da largura da planta
    scale: null,               // multiplicador opcional do conjunto
    rotate: null,
    border_radius: "50%",

    // --- aparência ---
    effect: "glow",            // glow · neon · soft · flat
    glow: true,
    glow_opacity: 0.55,        // alfa do halo derivado da cor do estado
    glow_scale: 1,             // multiplicador do tamanho do halo
    gloss: true,               // brilho de vidro na bolinha
    opacity: 1,

    // --- cores por estado ---
    color_on: "yellow",
    color_off: "rgba(211, 211, 211, 0.2)",
    color_unavailable: "rgba(255, 99, 71, 0.7)",
    color_unknown: "rgba(255, 99, 71, 0.7)",
    color_on_glow: "",         // vazio = derivado da cor do estado
    color_off_glow: "",
    color_unavailable_glow: "rgba(255, 99, 71, 1)",
    color_unknown_glow: "rgba(255, 99, 71, 1)",

    // --- anel por estado ("<espessura> solid <cor>"; % = do diâmetro, logo
    //     acompanha a planta — `border` em % é inválido no CSS) ---
    border_on: "",
    border_off: "7% solid rgba(0, 255, 255, 0.55)",
    border_unavailable: "",
    border_unknown: "5% solid rgba(255, 255, 255, 0.35)",

    // --- luz de verdade ---
    color_by_light: false,     // rgb_color da lâmpada vence `color_on`
    glow_by_brightness: false, // halo cresce com o brightness

    // --- ícones (vazio = ícone da entidade) ---
    icon: "",
    icon_on: "",
    icon_off: "",
    icon_unavailable: "mdi:cancel",
    icon_unknown: "mdi:crosshairs-question",
    icon_fallback: "mdi:lightbulb",
    icon_fallback_off: "mdi:lightbulb-outline",
    color_icon_on: "rgba(90, 62, 0, 0.85)",
    color_icon_off: "rgba(0, 255, 255, 0.55)",
    color_icon_unavailable: "rgba(255, 255, 0, 1)",
    color_icon_unknown: "rgba(255, 255, 255, 0.85)",
    icon_size: "",             // vazio = 55% do diâmetro (acompanha a planta)
    icon_scale: 1,
    icon_offset_y: "4%",
    icon_upright: false,       // desfaz o `rotate` só no ícone
    hide_icon: false,

    // --- visibilidade por estado ---
    hide_on: false,
    hide_off: false,
    hide_unavailable: false,
    hide_unknown: false,

    // --- ações ---
    tap_action: "toggle",
    hold_action: "more-info",
    double_tap_action: "none",
    lock_when_broken: true,    // indisponível/desconhecido não aceita tap
    optimistic: true,          // acende no toque, sem esperar o HA
    haptic: true,
    navigation_path: "",
    url_path: "",
    service: "",
    service_data: null,
  };

  // halo (escala · opacidade) e vidro por efeito
  const EFFECTS = {
    glow: { halo: 1, gloss: 1 },
    neon: { halo: 1.45, gloss: 0.55 },
    soft: { halo: 0.7, gloss: 0.9 },
    flat: { halo: 0, gloss: 0 },
  };
  const HALO = { on: 3.2, off: 2, unavailable: 2.4, unknown: 2.4 };
  const HALO_OP = { on: 0.95, off: 0.5, unavailable: 0.85, unknown: 0.85 };

  const ON_STATES = new Set(["on", "playing", "home", "open", "active"]);
  const OFF_STATES = new Set(["off", "idle", "standby", "not_home", "closed", "paused"]);

  const CSS = `
:host{position:absolute;display:block;box-sizing:border-box;
  width:var(--mw-size,5%);aspect-ratio:1;container-type:size;contain:layout style;
  cursor:var(--mw-cursor,pointer);touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;user-select:none;}
:host([mw-hidden]){display:none;}
.halo,.bulb,.gloss,.ico{position:absolute;pointer-events:none;}
.halo{left:50%;top:50%;width:100cqmin;height:100cqmin;border-radius:50%;
  background:radial-gradient(circle closest-side,var(--mw-glow,transparent) 0%,transparent 72%);
  opacity:var(--mw-halo-op,0);
  transform:translate3d(-50%,-50%,0) scale(var(--mw-halo,1));
  transition:opacity .28s ease,transform .38s cubic-bezier(.22,1,.36,1);}
.bulb{inset:0;border-radius:var(--mw-radius,50%);background-color:var(--mw-color,transparent);
  box-shadow:var(--mw-ring,none);opacity:var(--mw-op,1);
  transition:background-color .26s ease,box-shadow .26s ease,opacity .26s ease;}
.gloss{inset:0;border-radius:var(--mw-radius,50%);opacity:var(--mw-gloss,0);
  background:radial-gradient(circle at 32% 27%,rgba(255,255,255,.8) 0%,
    rgba(255,255,255,.15) 42%,rgba(255,255,255,0) 68%);
  transition:opacity .26s ease;}
.ico{left:50%;top:50%;--mdc-icon-size:var(--mw-icon-size,55cqmin);
  color:var(--mw-icon-color,#fff);opacity:var(--mw-icon-op,1);
  transform:translate3d(-50%,-50%,0) translateY(var(--mw-icon-dy,4%))
    scale(var(--mw-icon-scale,1)) var(--mw-icon-rot,rotate(0deg));
  transition:color .26s ease,opacity .26s ease;}
.press{position:absolute;inset:0;border-radius:var(--mw-radius,50%);
  transform:scale(1);transition:transform .12s ease;}
:host(:active) .press{transform:scale(.9);}
:host([mode="unavailable"]) .halo,:host([mode="unknown"]) .halo{
  animation:mw-pulse 2.4s ease-in-out infinite;}
@keyframes mw-pulse{
  0%,100%{opacity:var(--mw-halo-op,.8);
    transform:translate3d(-50%,-50%,0) scale(var(--mw-halo,2));}
  50%{opacity:calc(var(--mw-halo-op,.8) * .4);
    transform:translate3d(-50%,-50%,0) scale(calc(var(--mw-halo,2) * .78));}}
@media (prefers-reduced-motion:reduce){
  .halo,.bulb,.gloss,.ico,.press{transition:none;animation:none;}}`;

  let SHEET;
  const sharedSheet = () => {
    if (SHEET !== undefined) return SHEET;
    try {
      const s = new CSSStyleSheet();
      s.replaceSync(CSS);
      SHEET = s;
    } catch (e) { SHEET = null; }
    return SHEET;
  };

  // ligada / apagada / indisponível / desconhecido — serve para light, switch,
  // input_boolean, fan, media_player; estado fora das listas cai em "unknown"
  const resolveMode = (raw, invert) => {
    if (raw === undefined || raw === null || raw === "unavailable") return "unavailable";
    if (raw === "unknown" || raw === "") return "unknown";
    let on = ON_STATES.has(raw) ? true : OFF_STATES.has(raw) ? false : null;
    if (on === null) return "unknown";
    if (invert) on = !on;
    return on ? "on" : "off";
  };

  // halo = a própria cor do estado com outro alfa (rgb/rgba/#hex);
  // cor nomeada ou var(--...) sai inteira
  const withAlpha = (color, alpha) => {
    const c = String(color || "").trim();
    let m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(",").map((s) => s.trim());
      if (p.length >= 3) return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${alpha})`;
    }
    m = c.match(/^#([0-9a-fA-F]{3,8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
      const n = parseInt(h.slice(0, 6), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    return c;
  };

  // "7% solid rgba(0,255,255,.55)" → anel interno que acompanha o diâmetro
  // (borda em % não existe no CSS; cqmin é % do lado menor do próprio elemento)
  const ringOf = (spec) => {
    const s = String(spec || "").trim();
    if (!s) return "none";
    const parts = s.split(/\s+/);
    const w = parts[0];
    const color = parts.slice(1)
      .filter((t) => !/^(solid|dashed|dotted|double|inset|outset|none)$/i.test(t))
      .join(" ") || "currentColor";
    const width = /%$/.test(w) ? `${parseFloat(w)}cqmin` : w;
    return `inset 0 0 0 ${width} ${color}`;
  };

  const fire = (node, type, detail) => {
    node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  };

  class MwLightElement extends HTMLElement {
    static getStubConfig() {
      return { type: "custom:mw-light-element", entity: "", left: "50%", top: "50%", size: "5%" };
    }

    static getConfigElement() {
      return document.createElement("mw-light-element-editor");
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._props = {};
      this._mode = null;
      this._built = false;
      this._bindPointer();
    }

    // ponteiro único: nada de `click` (evita o clique-fantasma e o tap comido
    // depois de um hold — era esse o "às vezes não responde")
    _bindPointer() {
      let t0 = 0, x0 = 0, y0 = 0, held = false, timer = null, tapTimer = null, taps = 0;
      const clear = () => { clearTimeout(timer); timer = null; };

      this.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        held = false; t0 = e.timeStamp; x0 = e.clientX; y0 = e.clientY;
        clear();
        timer = setTimeout(() => {
          held = true;
          this._haptic("medium");
          this._run(this._cfg && this._cfg.hold_action, false);
        }, 480);
      });

      const end = (e) => {
        clear();
        if (held) { held = false; return; }
        const moved = Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 12;
        if (moved || e.timeStamp - t0 > 900) return;
        e.stopPropagation();
        const dbl = this._cfg && this._cfg.double_tap_action;
        const hasDbl = String(typeof dbl === "string" ? dbl : (dbl || {}).action) !== "none";
        if (!hasDbl) { this._tap(); return; }
        taps += 1;
        if (taps === 1) {
          tapTimer = setTimeout(() => { taps = 0; this._tap(); }, 230);
        } else {
          clearTimeout(tapTimer); taps = 0;
          this._run(dbl, true);
        }
      };
      this.addEventListener("pointerup", end);
      this.addEventListener("pointercancel", () => { clear(); held = false; });
      this.addEventListener("pointerleave", () => { clear(); });
      this.addEventListener("click", (e) => e.stopPropagation());
    }

    _tap() {
      this._haptic("light");
      this._run(this._cfg && this._cfg.tap_action, true);
    }

    _haptic(kind) {
      if (this._cfg && this._cfg.haptic) fire(this, "haptic", kind);
    }

    setConfig(config) {
      if (!config || !config.entity) throw new Error("mw-light-element: informe 'entity'");
      this._cfg = { ...DEFAULTS, ...config };
      this._fx = EFFECTS[this._cfg.effect] || EFFECTS.glow;
      this._mode = null;
      this._props = {};
      this._st = undefined;
      this._applyGeometry();
      this._update();
    }

    getCardSize() { return 1; }

    set hass(hass) {
      mwElementIdentity(hass);
      const first = !this._hass;
      this._hass = hass;
      if (!this._cfg) return;
      const st = hass && hass.states[this._cfg.entity];
      // caminho rápido: o HA empurra `hass` a cada mudança de qualquer
      // entidade; se o state object é o mesmo, não há nada a fazer
      if (!first && st === this._st) return;
      this._st = st;
      if (this._opt) this._clearOptimistic();
      this._update();
    }

    get hass() { return this._hass; }

    connectedCallback() { if (this._cfg) this._update(); }

    disconnectedCallback() { clearTimeout(this._optTimer); }

    // o picture-elements escreve o `style:` do YAML no host logo depois de
    // criar o elemento; o que vier na config vence, o que não vier não é tocado
    _applyGeometry() {
      const c = this._cfg;
      const set = (p, v) => {
        if (v === "" || v === null || v === undefined) return;
        this.style.setProperty(p, String(v));
      };
      set("left", c.left);
      set("top", c.top);
      set("--mw-size", c.size);
      set("--mw-radius", c.border_radius);
      const hasR = c.rotate !== null && c.rotate !== "";
      const hasS = c.scale !== null && c.scale !== "";
      // o translate(-50%,-50%) é o que centra o elemento no ponto (left,top)
      const r = hasR ? `rotate(${c.rotate}deg)` : "";
      const s = hasS ? ` scale(${c.scale})` : "";
      set("transform", `translate(-50%, -50%)${r ? " " + r : ""}${s}`);
      if (hasR && c.icon_upright) set("--mw-icon-rot", `rotate(${-c.rotate}deg)`);
    }

    _build() {
      const root = this.shadowRoot;
      const sheet = sharedSheet();
      if (sheet && "adoptedStyleSheets" in root) root.adoptedStyleSheets = [sheet];
      else {
        const st = document.createElement("style");
        st.textContent = CSS;
        root.appendChild(st);
      }
      const mk = (parent, cls, tag) => {
        const n = document.createElement(tag || "div");
        n.className = cls;
        parent.appendChild(n);
        return n;
      };
      this._halo = mk(root, "halo");
      this._press = mk(root, "press");
      this._bulb = mk(this._press, "bulb");
      this._gloss = mk(this._press, "gloss");
      this._ico = mk(this._press, "ico", "ha-icon");
      this._built = true;
    }

    // só escreve o que mudou — custom property que já vale não vira repaint
    _set(prop, val) {
      const v = val === null || val === undefined ? "" : String(val);
      if (this._props[prop] === v) return;
      this._props[prop] = v;
      if (v === "") this.style.removeProperty(prop);
      else this.style.setProperty(prop, v);
    }

    _optimisticToggle() {
      const c = this._cfg;
      if (!c.optimistic) return;
      this._opt = this._mode === "on" ? "off" : "on";
      clearTimeout(this._optTimer);
      // se o HA não confirmar (luz fora do ar, serviço recusado), volta sozinho
      this._optTimer = setTimeout(() => { this._opt = null; this._update(); }, 2500);
      this._update();
    }

    _clearOptimistic() {
      this._opt = null;
      clearTimeout(this._optTimer);
    }

    _run(spec, guarded) {
      const c = this._cfg;
      if (!c || !this._hass) return;
      if (guarded && c.lock_when_broken
        && (this._mode === "unavailable" || this._mode === "unknown")) return;
      const a = typeof spec === "string" ? { action: spec } : (spec || { action: "none" });
      switch (a.action) {
        case "none":
          return;
        case "toggle":
          this._optimisticToggle();
          this._hass.callService("homeassistant", "toggle",
            { entity_id: a.entity_id || c.entity });
          return;
        case "call-service":
        case "perform-action": {
          const svc = a.perform_action || a.service || c.service;
          if (!svc || svc.indexOf(".") < 0) return;
          const [dom, srv] = svc.split(".");
          this._hass.callService(dom, srv,
            a.data || a.service_data || c.service_data || {}, a.target);
          return;
        }
        case "navigate": {
          const path = a.navigation_path || c.navigation_path;
          if (!path) return;
          history.pushState(null, "", path);
          fire(window, "location-changed", { replace: false });
          return;
        }
        case "url": {
          const url = a.url_path || c.url_path;
          if (url) window.open(url, a.new_tab === false ? "_self" : "_blank");
          return;
        }
        default:
          fire(this, "hass-more-info", { entityId: a.entity || c.entity });
      }
    }

    _update() {
      const c = this._cfg;
      if (!c || !this._hass) return;
      if (!this._built) this._build();

      const st = this._st;
      const attrs = (st && st.attributes) || {};
      const real = resolveMode(st && st.state, c.invert);
      const mode = this._opt && (real === "on" || real === "off") ? this._opt : real;
      if (this._opt && this._opt === real) this._clearOptimistic();
      this._mode = mode;

      const rgb = c.color_by_light && mode === "on" && Array.isArray(attrs.rgb_color)
        ? `rgb(${attrs.rgb_color.slice(0, 3).join(", ")})` : "";
      const bri = c.glow_by_brightness && mode === "on" && attrs.brightness != null
        ? Math.max(0, Math.min(255, Number(attrs.brightness))) : null;
      const dim = bri === null ? 1 : 0.45 + 0.55 * (bri / 255);

      if (mode !== this.getAttribute("mode")) this.setAttribute("mode", mode);
      const hidden = !!c[`hide_${mode}`];
      if (hidden) this.setAttribute("mw-hidden", "");
      else this.removeAttribute("mw-hidden");

      const color = rgb || c[`color_${mode}`];
      const glowColor = (rgb && !c[`color_${mode}_glow`])
        ? withAlpha(rgb, c.glow_opacity)
        : (c[`color_${mode}_glow`] || withAlpha(color, c.glow_opacity));
      const halo = c.glow ? HALO[mode] * this._fx.halo * c.glow_scale * dim : 0;

      this._set("--mw-color", color);
      this._set("--mw-op", c.opacity);
      this._set("--mw-ring", ringOf(c[`border_${mode}`]));
      this._set("--mw-glow", halo ? glowColor : "transparent");
      this._set("--mw-halo", halo || 1);
      this._set("--mw-halo-op", halo ? HALO_OP[mode] * (bri === null ? 1 : dim) : 0);
      this._set("--mw-gloss", (c.gloss ? this._fx.gloss : 0) * (mode === "on" ? 1 : 0.35));

      const icon = c.icon || c[`icon_${mode}`] || (mode === "on" || mode === "off"
        ? (attrs.icon || (mode === "off" ? c.icon_fallback_off : c.icon_fallback)) : "");
      const showIcon = !!icon && !c.hide_icon;
      if (showIcon && this._ico.getAttribute("icon") !== icon) {
        this._ico.setAttribute("icon", icon);
      }
      this._set("--mw-icon-op", showIcon ? 1 : 0);
      this._set("--mw-icon-color", c[`color_icon_${mode}`]);
      this._set("--mw-icon-dy", c.icon_offset_y);
      this._set("--mw-icon-scale",
        c.icon_scale * (mode === "unavailable" || mode === "unknown" ? 1.25 : 1));
      if (c.icon_size) this._set("--mw-icon-size", c.icon_size);

      const tap = typeof c.tap_action === "string" ? c.tap_action : (c.tap_action || {}).action;
      const locked = c.lock_when_broken && (mode === "unavailable" || mode === "unknown");
      this._set("--mw-cursor", String(tap) !== "none" && !locked ? "pointer" : "default");

      const title = c.name || attrs.friendly_name || c.entity;
      if (this.title !== title) this.title = title;
    }
  }

  /* ---------------------------------------------------------------- editor
   * O picture-elements procura `getConfigElement()` no elemento custom; com
   * isto, editar a luz no editor visual do card mostra formulário em vez de
   * YAML cru. Onde a versão do HA não suportar, o YAML continua valendo.
   */
  const LABELS = {
    entity: "Entidade", name: "Nome (tooltip)", title: MW_TITLE_LABEL,
    left: "Esquerda", top: "Topo",
    size: "Diâmetro", scale: "Escala", rotate: "Rotação", effect: "Efeito",
    icon: "Ícone (força)", glow: "Halo", gloss: "Brilho de vidro",
    glow_scale: "Tamanho do halo", glow_opacity: "Opacidade do halo",
    color_on: "Cor ligada", color_off: "Cor apagada",
    color_unavailable: "Cor indisponível", color_unknown: "Cor desconhecida",
    border_off: "Borda apagada", border_on: "Borda ligada",
    color_icon_on: "Ícone ligada", color_icon_off: "Ícone apagada",
    color_by_light: "Usar a cor da lâmpada",
    glow_by_brightness: "Halo pelo brilho",
    lock_when_broken: "Travar toque se indisponível",
    optimistic: "Resposta otimista", invert: "Inverter estado",
    hide_icon: "Esconder ícone", icon_offset_y: "Deslocar ícone (Y)",
    icon_scale: "Escala do ícone", opacity: "Opacidade",
    tap_action: "Toque", hold_action: "Toque longo", double_tap_action: "Toque duplo",
  };

  const SCHEMA = [
    { name: "entity", required: true, selector: { entity: {} } },
    { name: "name", selector: { text: {} } },
    MW_TITLE_FIELD,
    {
      type: "grid", name: "", schema: [
        { name: "left", selector: { text: {} } },
        { name: "top", selector: { text: {} } },
        { name: "size", selector: { text: {} } },
        { name: "scale", selector: { number: { min: 0.1, max: 5, step: 0.05, mode: "box" } } },
      ],
    },
    {
      type: "grid", name: "", schema: [
        {
          name: "effect", selector: {
            select: {
              mode: "dropdown", options: [
                { value: "glow", label: "Glow (padrão)" },
                { value: "neon", label: "Neon" },
                { value: "soft", label: "Suave" },
                { value: "flat", label: "Chapado" },
              ],
            },
          },
        },
        { name: "icon", selector: { icon: {} } },
      ],
    },
    {
      type: "grid", name: "", schema: [
        { name: "glow", selector: { boolean: {} } },
        { name: "gloss", selector: { boolean: {} } },
        { name: "color_by_light", selector: { boolean: {} } },
        { name: "glow_by_brightness", selector: { boolean: {} } },
        { name: "invert", selector: { boolean: {} } },
        { name: "hide_icon", selector: { boolean: {} } },
        { name: "lock_when_broken", selector: { boolean: {} } },
        { name: "optimistic", selector: { boolean: {} } },
      ],
    },
    {
      type: "expandable", name: "", title: "Cores e ajuste fino", schema: [
        {
          type: "grid", name: "", schema: [
            { name: "color_on", selector: { text: {} } },
            { name: "color_off", selector: { text: {} } },
            { name: "color_unavailable", selector: { text: {} } },
            { name: "color_unknown", selector: { text: {} } },
            { name: "color_icon_on", selector: { text: {} } },
            { name: "color_icon_off", selector: { text: {} } },
            { name: "border_off", selector: { text: {} } },
            { name: "border_on", selector: { text: {} } },
          ],
        },
        {
          type: "grid", name: "", schema: [
            { name: "glow_scale", selector: { number: { min: 0, max: 4, step: 0.05, mode: "box" } } },
            { name: "glow_opacity", selector: { number: { min: 0, max: 1, step: 0.05, mode: "box" } } },
            { name: "icon_scale", selector: { number: { min: 0.1, max: 3, step: 0.05, mode: "box" } } },
            { name: "opacity", selector: { number: { min: 0, max: 1, step: 0.05, mode: "box" } } },
            { name: "icon_offset_y", selector: { text: {} } },
            { name: "rotate", selector: { number: { min: -180, max: 180, step: 1, mode: "box" } } },
          ],
        },
      ],
    },
    {
      type: "expandable", name: "", title: "Ações", schema: [
        { name: "tap_action", selector: { ui_action: {} } },
        { name: "hold_action", selector: { ui_action: {} } },
        { name: "double_tap_action", selector: { ui_action: {} } },
      ],
    },
  ];

  class MwLightElementEditor extends HTMLElement {
    setConfig(config) { this._config = config || {}; this._render(); }
    set hass(hass) { this._hass = hass; this._render(); }

    _render() {
      if (!this._config || !this._hass) return;
      if (!this._form) {
        const f = document.createElement("ha-form");
        f.computeLabel = (s) => LABELS[s.name] || s.name;
        f.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          const next = { type: "custom:mw-light-element", ...ev.detail.value };
          Object.keys(next).forEach((k) => {
            if (next[k] === "" || next[k] === null || next[k] === undefined) delete next[k];
          });
          fire(this, "config-changed", { config: next });
        });
        this.appendChild(f);
        this._form = f;
      }
      this._form.hass = this._hass;
      this._form.schema = SCHEMA;
      // o formulário mostra o padrão em vigor, não campo vazio
      const data = { ...this._config };
      ["effect", "size", "glow", "gloss", "lock_when_broken", "optimistic",
        "tap_action", "hold_action"].forEach((k) => {
          if (data[k] === undefined) data[k] = DEFAULTS[k];
        });
      this._form.data = data;
    }
  }

  mwRegisterElement({
    type: "custom:mw-light-element",
    name: "Luz",
    description: "MW · luz na planta",
  });

  if (!customElements.get("mw-light-element")) {
    customElements.define("mw-light-element", MwLightElement);
  }
  if (!customElements.get("mw-light-element-editor")) {
    customElements.define("mw-light-element-editor", MwLightElementEditor);
  }

  console.info(
    `%c MW-LIGHT-ELEMENT %c ${VERSION} `,
    "color:#0b1021;background:#ffd600;font-weight:700",
    "color:#ffd600;background:#0b1021"
  );
})();
