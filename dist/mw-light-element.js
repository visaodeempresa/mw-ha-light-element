/* mw-ha-light-element — custom:mw-light-element
 * Elemento de picture-elements: a bolinha luminosa que representa uma luz na
 * planta, pintada pelo estado (ligada / desligada / indisponível /
 * desconhecido) com halo, borda e ícone de exceção.
 * Substitui o bloco de 4 `conditional` + 4 `custom:button-card` por um
 * elemento só, sem perder nada do visual.
 * JS puro, arquivo único, sem build.
 * Repo: https://github.com/visaodeempresa/mw-ha-light-element
 * Releases automáticas: push na main → bump semântico → tag → HACS.
 */
(() => {
  "use strict";

  const DEFAULTS = {
    // --- entidade ---
    entity: "",
    name: "",                  // tooltip; vazio = friendly_name da entidade
    invert: false,             // entidade invertida (on = apagada)

    // --- geometria (opcional: dá para posicionar pelo `style:` do
    //     picture-elements; o que estiver aqui vence o `style:`) ---
    left: "",                  // ex.: "calc(100% - 55%)"
    top: "",                   // ex.: "14%"
    size: "6vh",               // diâmetro da bolinha (width = height)
    scale: 0.6,                // escala do conjunto — como no button-card
    rotate: null,
    border_radius: "50%",

    // --- aparência ---
    opacity: 1,
    glow: true,
    glow_blur: "8vh",
    glow_spread: "2vh",
    glow_opacity: 0.5,         // alfa do halo derivado da cor do estado
    // por modo: vazio = usa o global acima
    glow_blur_on: "", glow_spread_on: "",
    glow_blur_off: "", glow_spread_off: "",
    glow_blur_unavailable: "4vh", glow_spread_unavailable: "1vh",
    glow_blur_unknown: "4vh", glow_spread_unknown: "1vh",

    // --- cores por estado ---
    color_on: "yellow",
    color_off: "rgba(211, 211, 211, 0.2)",
    color_unavailable: "rgba(255, 99, 71, 0.7)",
    color_unknown: "rgba(255, 99, 71, 0.7)",
    // vazio = derivado da cor do estado com `glow_opacity`
    color_on_glow: "",
    color_off_glow: "",
    color_unavailable_glow: "rgba(255, 99, 71, 1)",
    color_unknown_glow: "rgba(255, 99, 71, 1)",

    // --- borda por estado (CSS direto: "4px solid rgba(...)") ---
    border_on: "",
    border_off: "4px solid rgba(0, 255, 255, 0.5)",
    border_unavailable: "",
    border_unknown: "",

    // --- luz de verdade: usa a cor e o brilho da própria lâmpada ---
    color_by_light: false,     // rgb_color da luz vence `color_on`
    glow_by_brightness: false, // halo cresce com o brilho (35%–100%)

    // --- ícones (vazio = ícone da entidade) ---
    icon: "",                  // força o ícone em todos os modos
    icon_on: "",
    icon_off: "",
    icon_unavailable: "mdi:cancel",
    icon_unknown: "mdi:crosshairs-question",
    icon_fallback: "mdi:lightbulb",
    color_icon_on: "var(--state-light-active-color, rgba(253, 216, 53, 1))",
    color_icon_off: "rgba(0, 255, 255, 0.5)",
    color_icon_unavailable: "rgba(255, 255, 0, 1)",
    color_icon_unknown: "rgba(255, 255, 255, 0.8)",
    icon_size: "5vh",
    icon_size_on: "", icon_size_off: "",
    icon_size_unavailable: "8.4vh", icon_size_unknown: "8.4vh",
    icon_scale: 1,
    icon_scale_on: "", icon_scale_off: "",
    icon_scale_unavailable: 0.85, icon_scale_unknown: 0.85,
    icon_offset_y: "5%",
    icon_upright: false,       // true = desfaz o `rotate` só no ícone

    // --- visibilidade por estado ---
    hide_on: false,
    hide_off: false,
    hide_unavailable: false,
    hide_unknown: false,

    // --- ações ---
    tap_action: "toggle",      // string ou objeto ({action: ...})
    hold_action: "more-info",
    double_tap_action: "none",
    lock_when_broken: true,    // indisponível/desconhecido não aceita tap
    navigation_path: "",
    url_path: "",
    service: "",
    service_data: null,
  };

  const ON_STATES = new Set(["on", "playing", "home", "open", "active"]);
  const OFF_STATES = new Set(["off", "idle", "standby", "not_home", "closed", "paused"]);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const px = (v) => (v === null || v === undefined || v === "" ? "0"
    : typeof v === "number" || /^-?[\d.]+$/.test(String(v)) ? `${v}px` : String(v));

  // "8vh" × 0.7 → "5.6vh" (mantém a unidade; o que não for medida sai inteiro)
  const scaleLen = (v, f) => {
    const m = String(v).match(/^(-?[\d.]+)([a-z%]*)$/i);
    if (!m) return String(v);
    const n = Math.round(parseFloat(m[1]) * f * 1000) / 1000;
    return `${n}${m[2] || "px"}`;
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
  // cor nomeada ou var(--...) sai inteira, sem transparência
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

  const fire = (node, type, detail) => {
    const ev = new CustomEvent(type, { detail, bubbles: true, composed: true });
    node.dispatchEvent(ev);
    return ev;
  };

  class MwLightElement extends HTMLElement {
    static getStubConfig() {
      return { entity: "", left: "50%", top: "50%", size: "6vh" };
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._sig = null;
      this._holdFired = false;
      this.addEventListener("click", (e) => {
        if (this._holdFired) { this._holdFired = false; return; }
        e.stopPropagation();
        this._run(this._config && this._config.tap_action, true);
      });
      this.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this._run(this._config && this._config.double_tap_action, true);
      });
      this.addEventListener("pointerdown", () => {
        this._holdTimer = setTimeout(() => {
          this._holdFired = true;
          this._run(this._config && this._config.hold_action);
        }, 500);
      });
      const cancel = () => clearTimeout(this._holdTimer);
      this.addEventListener("pointerup", cancel);
      this.addEventListener("pointercancel", cancel);
      this.addEventListener("pointerleave", cancel);
    }

    setConfig(config) {
      if (!config || !config.entity) {
        throw new Error("mw-light-element: informe 'entity'");
      }
      this._config = { ...DEFAULTS, ...config };
      this._sig = null;
      this._applyGeometry();
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    get hass() { return this._hass; }

    // o picture-elements aplica o `style:` do YAML no host logo depois de
    // criar o elemento; o que vier na config vence, e o que não vier não é
    // tocado — assim dá para posicionar dos dois jeitos
    _applyGeometry() {
      const c = this._config;
      const set = (prop, val) => {
        if (val === "" || val === null || val === undefined) return;
        this.style.setProperty(prop, String(val));
      };
      set("left", c.left);
      set("top", c.top);
      set("width", c.size);
      set("height", c.size);
      const hasR = c.rotate !== null && c.rotate !== "";
      const hasS = c.scale !== null && c.scale !== "";
      if (hasR || hasS) {
        const r = hasR ? c.rotate : 0;
        const s = hasS ? c.scale : 1;
        set("transform", `translate(-50%, -50%) rotate(${r}deg) scale(${s})`);
      }
    }

    // tap/double-tap ficam mudos quando a luz está indisponível ou
    // desconhecida (como no bloco original: `action: none`); o hold continua
    // abrindo o more-info, que é onde se vê o porquê
    _run(spec, guarded) {
      const cfg = this._config;
      if (!cfg || !this._hass) return;
      if (guarded && cfg.lock_when_broken
        && (this._mode === "unavailable" || this._mode === "unknown")) return;
      const a = typeof spec === "string" ? { action: spec } : (spec || { action: "none" });
      switch (a.action) {
        case "none":
          return;
        case "toggle":
          this._hass.callService("homeassistant", "toggle",
            { entity_id: a.entity_id || cfg.entity });
          return;
        case "call-service":
        case "perform-action": {
          const svc = a.perform_action || a.service || cfg.service;
          if (!svc || svc.indexOf(".") < 0) return;
          const [dom, srv] = svc.split(".");
          this._hass.callService(dom, srv,
            a.data || a.service_data || cfg.service_data || {}, a.target);
          return;
        }
        case "navigate": {
          const path = a.navigation_path || cfg.navigation_path;
          if (!path) return;
          history.pushState(null, "", path);
          fire(window, "location-changed", { replace: false });
          return;
        }
        case "url": {
          const url = a.url_path || cfg.url_path;
          if (url) window.open(url, a.new_tab === false ? "_self" : "_blank");
          return;
        }
        default:
          fire(this, "hass-more-info", { entityId: a.entity || cfg.entity });
      }
    }

    _render() {
      const cfg = this._config;
      const hass = this._hass;
      if (!cfg || !hass) return;

      const st = hass.states[cfg.entity];
      const attrs = (st && st.attributes) || {};
      const mode = resolveMode(st && st.state, cfg.invert);
      this._mode = mode;

      const rgb = cfg.color_by_light && mode === "on" && Array.isArray(attrs.rgb_color)
        ? `rgb(${attrs.rgb_color.slice(0, 3).join(", ")})` : "";
      const bri = cfg.glow_by_brightness && mode === "on" && attrs.brightness != null
        ? Math.max(0, Math.min(255, Number(attrs.brightness))) : null;

      const sig = `${mode}|${st ? st.state : "-"}|${rgb}|${bri}|${attrs.icon || ""}`;
      if (sig === this._sig) return;
      this._sig = sig;

      const hidden = !!cfg[`hide_${mode}`];
      const bg = rgb || cfg[`color_${mode}`];
      const glowColor = (rgb && !cfg[`color_${mode}_glow`])
        ? withAlpha(rgb, cfg.glow_opacity)
        : (cfg[`color_${mode}_glow`] || withAlpha(bg, cfg.glow_opacity));
      const f = bri === null ? 1 : 0.35 + 0.65 * (bri / 255);
      const blur = scaleLen(cfg[`glow_blur_${mode}`] || cfg.glow_blur, f);
      const spread = scaleLen(cfg[`glow_spread_${mode}`] || cfg.glow_spread, f);
      const glow = cfg.glow ? `box-shadow:0 0 ${px(blur)} ${px(spread)} ${glowColor};` : "";
      const border = cfg[`border_${mode}`] ? `border:${cfg[`border_${mode}`]};` : "";

      const icon = cfg.icon || cfg[`icon_${mode}`]
        || (mode === "on" || mode === "off" ? (attrs.icon || cfg.icon_fallback) : "");
      const iconColor = cfg[`color_icon_${mode}`];
      const iconSize = cfg[`icon_size_${mode}`] || cfg.icon_size;
      const iScaleRaw = cfg[`icon_scale_${mode}`];
      const iconScale = iScaleRaw === "" || iScaleRaw === null || iScaleRaw === undefined
        ? cfg.icon_scale : iScaleRaw;
      const upright = cfg.icon_upright && cfg.rotate ? ` rotate(${-cfg.rotate}deg)` : "";
      const tap = typeof cfg.tap_action === "string"
        ? cfg.tap_action : (cfg.tap_action || {}).action;
      const locked = cfg.lock_when_broken && (mode === "unavailable" || mode === "unknown");
      const clickable = String(tap) !== "none" && !locked;

      this.title = cfg.name || attrs.friendly_name || cfg.entity;

      this.shadowRoot.innerHTML = `
<style>
  :host{display:${hidden ? "none" : "block"};box-sizing:border-box;overflow:visible;
        cursor:${clickable ? "pointer" : "default"};}
  .bulb{position:absolute;inset:0;box-sizing:border-box;
        border-radius:${cfg.border_radius};
        background-color:${bg};opacity:${cfg.opacity};${border}${glow}}
  .ico{position:absolute;left:50%;top:50%;--mdc-icon-size:${iconSize};
       color:${iconColor};pointer-events:none;
       transform:translate(-50%,-50%) translateY(${cfg.icon_offset_y}) scale(${iconScale})${upright};}
</style>
<div class="bulb"></div>
${icon ? `<ha-icon class="ico" icon="${esc(icon)}"></ha-icon>` : ""}`;
    }
  }

  if (!customElements.get("mw-light-element")) {
    customElements.define("mw-light-element", MwLightElement);
  }

  console.info(
    "%c MW-LIGHT-ELEMENT %c 0.1.0 ",
    "color:#0b1021;background:#ffd600;font-weight:700",
    "color:#ffd600;background:#0b1021"
  );
})();
