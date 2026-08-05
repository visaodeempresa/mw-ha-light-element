/* Probe headless — instancia o elemento fora do navegador (shim mínimo de DOM)
 * e confere o que some quando alguém mexe: modo por estado, cores/halo em
 * custom properties, ícone, geometria, cor e brilho vindos da lâmpada, o
 * caminho rápido do `set hass`, o toque otimista e o editor.
 * Roda no CI e antes de qualquer push:  node tools/probe.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const mkStyle = () => {
  const s = { _p: {} };
  s.setProperty = (k, v) => { s._p[k] = v; s[k] = v; };
  s.removeProperty = (k) => { delete s._p[k]; delete s[k]; };
  return s;
};

class Node {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.style = mkStyle();
    this.children = [];
    this._attrs = {};
    this._listeners = {};
  }
  appendChild(n) { this.children.push(n); return n; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
  dispatchEvent() { return true; }
  emit(t, ev) { (this._listeners[t] || []).forEach((f) => f(ev)); }
}

global.HTMLElement = class extends Node {
  attachShadow() {
    this.shadowRoot = new Node("shadow-root");
    this.shadowRoot.adoptedStyleSheets = [];
    return this.shadowRoot;
  }
};
global.document = { createElement: (t) => new Node(t) };
const reg = {};
global.customElements = { define: (n, c) => (reg[n] = c), get: (n) => reg[n] };
global.window = {};
global.CustomEvent = class { constructor(t, d) { this.type = t; Object.assign(this, d); } };
global.CSSStyleSheet = class { replaceSync(css) { this.css = css; } };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
console.info = () => {};

eval(fs.readFileSync(
  path.join(__dirname, "..", "dist", "mw-light-element.js"), "utf8"));

const mkState = (state, attributes) => ({ state, attributes: attributes || {} });
const hass = {
  states: {
    "light.luz_da_cozinha": mkState("on",
      { friendly_name: "LUZ DA COZINHA", brightness: 255, rgb_color: [255, 170, 0] }),
    "light.luz_da_suite": mkState("off", { friendly_name: "Luz da Suíte" }),
    "light.sumida": mkState("unavailable"),
    "light.esquisita": mkState("banana"),
    "switch.tomada": mkState("on", { icon: "mdi:power-socket-eu" }),
  },
  calls: [],
  callService(dom, srv, data) { this.calls.push([dom, srv, data]); },
};

let fails = 0;
const check = (label, cond, extra = "") => {
  if (cond) { console.log(`  ok   ${label}`); return; }
  fails += 1;
  console.log(`  FAIL ${label}${extra ? " — " + extra : ""}`);
};

const make = (config) => {
  const el = new reg["mw-light-element"]();
  el.setConfig(config);
  el.hass = hass;
  return el;
};
const p = (el, k) => el.style._p[k];
const iconOf = (el) => el._ico.getAttribute("icon");

console.log("elemento:");

const on = make({ entity: "light.luz_da_cozinha" });
check("ligada entra no modo on", on.getAttribute("mode") === "on");
check("ligada pinta amarelo", p(on, "--mw-color") === "yellow", p(on, "--mw-color"));
check("halo aceso na escala 3.2", p(on, "--mw-halo") === "3.2", p(on, "--mw-halo"));
check("ligada usa o ícone padrão de lâmpada", iconOf(on) === "mdi:lightbulb");
check("ligada sem anel", p(on, "--mw-ring") === "none");
check("tooltip = friendly_name", on.title === "LUZ DA COZINHA");
check("DOM montado uma vez (halo+press+bulb+gloss+ico)",
  on.shadowRoot.children.length === 2 && on._press.children.length === 3,
  String(on.shadowRoot.children.length));
check("folha de estilo compartilhada entre instâncias",
  on.shadowRoot.adoptedStyleSheets && on.shadowRoot.adoptedStyleSheets[0]
  === make({ entity: "light.luz_da_suite" }).shadowRoot.adoptedStyleSheets[0]);

const off = make({ entity: "light.luz_da_suite" });
check("apagada pinta cinza translúcido",
  p(off, "--mw-color") === "rgba(211, 211, 211, 0.2)");
check("apagada ganha o anel ciano proporcional ao diâmetro",
  p(off, "--mw-ring") === "inset 0 0 0 7cqmin rgba(0, 255, 255, 0.55)", p(off, "--mw-ring"));
check("apagada usa lâmpada vazada", iconOf(off) === "mdi:lightbulb-outline");
check("halo da apagada derivado com alfa 0.55",
  p(off, "--mw-glow") === "rgba(211, 211, 211, 0.55)", p(off, "--mw-glow"));

const gone = make({ entity: "light.sumida" });
check("indisponível usa mdi:cancel amarelo",
  iconOf(gone) === "mdi:cancel" && p(gone, "--mw-icon-color") === "rgba(255, 255, 0, 1)");
check("indisponível pulsa (modo no host, animação no CSS)",
  gone.getAttribute("mode") === "unavailable");
check("indisponível não é clicável", p(gone, "--mw-cursor") === "default");
check("indisponível aumenta o ícone", p(gone, "--mw-icon-scale") === "1.25");

check("estado fora das listas vira desconhecido",
  iconOf(make({ entity: "light.esquisita" })) === "mdi:crosshairs-question");
check("entidade inexistente vira indisponível",
  iconOf(make({ entity: "light.nao_existe" })) === "mdi:cancel");

const sw = make({ entity: "switch.tomada" });
check("switch ligado herda o ícone da entidade", iconOf(sw) === "mdi:power-socket-eu");

check("invert:true troca ligada por apagada",
  make({ entity: "light.luz_da_cozinha", invert: true }).getAttribute("mode") === "off");

const geo = make({ entity: "light.luz_da_cozinha", left: "calc(100% - 55%)", top: "14%" });
check("geometria vai para o host em % (acompanha a planta)",
  geo.style.left === "calc(100% - 55%)" && geo.style.top === "14%"
  && p(geo, "--mw-size") === "5%", JSON.stringify(geo.style._p));
check("transform centraliza no ponto",
  geo.style.transform === "translate(-50%, -50%)", geo.style.transform);
const rot = make({ entity: "light.luz_da_cozinha", rotate: 90, scale: 0.8, icon_upright: true });
check("rotate/scale compõem e o ícone fica de pé",
  rot.style.transform === "translate(-50%, -50%) rotate(90deg) scale(0.8)"
  && p(rot, "--mw-icon-rot") === "rotate(-90deg)", rot.style.transform);

const rgb = make({ entity: "light.luz_da_cozinha", color_by_light: true });
check("color_by_light pinta com a cor da lâmpada",
  p(rgb, "--mw-color") === "rgb(255, 170, 0)");
check("halo sai da cor da lâmpada", p(rgb, "--mw-glow") === "rgba(255, 170, 0, 0.55)");

hass.states["light.luz_da_cozinha"] = mkState("on", { brightness: 26 });
const dim = make({ entity: "light.luz_da_cozinha", glow_by_brightness: true });
check("halo encolhe com o brilho baixo",
  parseFloat(p(dim, "--mw-halo")) > 1.5 && parseFloat(p(dim, "--mw-halo")) < 1.8,
  p(dim, "--mw-halo"));
hass.states["light.luz_da_cozinha"] = mkState("on",
  { friendly_name: "LUZ DA COZINHA", brightness: 255, rgb_color: [255, 170, 0] });

check("efeito flat apaga o halo",
  p(make({ entity: "light.luz_da_cozinha", effect: "flat" }), "--mw-halo-op") === "0");
check("efeito neon aumenta o halo",
  p(make({ entity: "light.luz_da_cozinha", effect: "neon" }), "--mw-halo") === "4.64");
check("glow:false apaga o halo",
  p(make({ entity: "light.luz_da_cozinha", glow: false }), "--mw-halo-op") === "0");
check("halo derivado de #hex",
  p(make({ entity: "light.luz_da_suite", color_off: "#33cc55" }), "--mw-glow")
  === "rgba(51, 204, 85, 0.55)");
check("hide_off some com a bolinha",
  make({ entity: "light.luz_da_suite", hide_off: true }).getAttribute("mw-hidden") === "");

console.log("interação:");

hass.calls = [];
on._tap();
check("tap chama homeassistant.toggle",
  hass.calls.length === 1 && hass.calls[0][1] === "toggle"
  && hass.calls[0][2].entity_id === "light.luz_da_cozinha", JSON.stringify(hass.calls));
check("toque otimista apaga na hora, sem esperar o HA",
  on.getAttribute("mode") === "off" && p(on, "--mw-color") === "rgba(211, 211, 211, 0.2)");
hass.states["light.luz_da_cozinha"] = mkState("off", { friendly_name: "LUZ DA COZINHA" });
on.hass = hass;
check("estado real confirma e limpa o otimismo",
  on.getAttribute("mode") === "off" && !on._opt);
hass.states["light.luz_da_cozinha"] = mkState("on",
  { friendly_name: "LUZ DA COZINHA", brightness: 255, rgb_color: [255, 170, 0] });
on.hass = hass;
check("volta a ligar quando o HA manda", on.getAttribute("mode") === "on");

hass.calls = [];
gone._tap();
check("indisponível não chama serviço nenhum", hass.calls.length === 0);
const unlocked = make({ entity: "light.sumida", lock_when_broken: false });
hass.calls = [];
unlocked._tap();
check("lock_when_broken:false volta a aceitar o tap", hass.calls.length === 1);

const fast = make({ entity: "light.luz_da_cozinha" });
let updates = 0;
const realUpdate = fast._update.bind(fast);
fast._update = () => { updates += 1; realUpdate(); };
hass.states["switch.outra_coisa"] = mkState("on");
fast.hass = hass;               // mudou OUTRA entidade
fast.hass = hass;
check("mudança de outra entidade não redesenha (caminho rápido)", updates === 0);
hass.states["light.luz_da_cozinha"] = mkState("off", { friendly_name: "LUZ DA COZINHA" });
fast.hass = hass;
check("mudança da própria entidade redesenha", updates === 1);
hass.states["light.luz_da_cozinha"] = mkState("on",
  { friendly_name: "LUZ DA COZINHA", brightness: 255, rgb_color: [255, 170, 0] });

const held = make({ entity: "light.luz_da_cozinha" });
hass.calls = [];
held.emit("pointerdown", { button: 0, timeStamp: 0, clientX: 5, clientY: 5 });
held.emit("pointerup", { timeStamp: 120, clientX: 6, clientY: 5, stopPropagation() {} });
check("pointer curto = tap", hass.calls.length === 1);
held.emit("pointerdown", { button: 0, timeStamp: 0, clientX: 5, clientY: 5 });
held.emit("pointerup", { timeStamp: 200, clientX: 90, clientY: 5, stopPropagation() {} });
check("arrastar não dispara ação", hass.calls.length === 1);

console.log("editor:");
const ed = new reg["mw-light-element-editor"]();
ed.setConfig({ entity: "light.luz_da_cozinha" });
ed.hass = hass;
check("editor monta o ha-form", ed.children.length === 1
  && ed.children[0].tagName === "HA-FORM");
check("editor mostra os padrões em vigor",
  ed._form.data.effect === "glow" && ed._form.data.size === "5%");
check("editor rotula em pt-BR",
  ed._form.computeLabel({ name: "color_by_light" }) === "Usar a cor da lâmpada");
check("elemento oferece editor ao picture-elements",
  typeof reg["mw-light-element"].getConfigElement === "function"
  && reg["mw-light-element"].getConfigElement().tagName === "MW-LIGHT-ELEMENT-EDITOR");

let threw = false;
try { new reg["mw-light-element"]().setConfig({}); } catch (e) { threw = true; }
check("setConfig sem entity falha", threw);

console.log(fails ? `\n${fails} verificação(ões) falharam` : "\ntudo ok");
process.exit(fails ? 1 : 0);
