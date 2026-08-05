/* Probe headless — instancia o elemento fora do navegador e confere o que
 * some quando alguém mexe: cor por estado, halo derivado, borda do apagado,
 * ícone de exceção, geometria no host, cor/brilho vindos da lâmpada e o
 * "unknown" de estado estranho.
 * Roda no CI e antes de qualquer push:  node tools/probe.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const mkStyle = () => {
  const s = {};
  s.setProperty = (k, v) => { s[k] = v; };
  return s;
};

global.HTMLElement = class {
  constructor() { this.style = mkStyle(); this._listeners = {}; }
  attachShadow() { this.shadowRoot = { innerHTML: "" }; return this.shadowRoot; }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
  dispatchEvent() {}
};
const reg = {};
global.customElements = { define: (n, c) => (reg[n] = c), get: (n) => reg[n] };
global.window = {};
global.CustomEvent = class { constructor(t, d) { this.type = t; Object.assign(this, d); } };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
console.info = () => {};

eval(fs.readFileSync(
  path.join(__dirname, "..", "dist", "mw-light-element.js"), "utf8"));

const hass = {
  states: {
    "light.luz_da_cozinha": {
      state: "on",
      attributes: { friendly_name: "LUZ DA COZINHA", brightness: 255, rgb_color: [255, 170, 0] },
    },
    "light.luz_da_suite": { state: "off", attributes: { friendly_name: "Luz da Suíte" } },
    "light.sumida": { state: "unavailable", attributes: {} },
    "light.esquisita": { state: "banana", attributes: {} },
    "switch.tomada": { state: "on", attributes: { icon: "mdi:power-socket-eu" } },
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

console.log("elemento:");

const on = make({ entity: "light.luz_da_cozinha" });
let html = on.shadowRoot.innerHTML;
check("ligada pinta amarelo", html.includes("background-color:yellow"), html);
check("halo amarelo 8vh/2vh", html.includes("box-shadow:0 0 8vh 2vh yellow"), html);
check("ligada usa o ícone padrão de lâmpada", html.includes('icon="mdi:lightbulb"'));
check("ligada sem borda", !html.includes("border:"), html);
check("tooltip = friendly_name", on.title === "LUZ DA COZINHA");

const off = make({ entity: "light.luz_da_suite" });
html = off.shadowRoot.innerHTML;
check("apagada pinta cinza translúcido",
  html.includes("background-color:rgba(211, 211, 211, 0.2)"), html);
check("apagada tem halo derivado com alfa 0.5",
  html.includes("box-shadow:0 0 8vh 2vh rgba(211, 211, 211, 0.5)"), html);
check("apagada ganha a borda ciano",
  html.includes("border:4px solid rgba(0, 255, 255, 0.5)"), html);
check("ícone da apagada é ciano", html.includes("color:rgba(0, 255, 255, 0.5)"));

const gone = make({ entity: "light.sumida" });
html = gone.shadowRoot.innerHTML;
check("indisponível usa mdi:cancel amarelo",
  html.includes('icon="mdi:cancel"') && html.includes("color:rgba(255, 255, 0, 1)"), html);
check("indisponível encolhe o halo para 4vh/1vh",
  html.includes("box-shadow:0 0 4vh 1vh rgba(255, 99, 71, 1)"), html);
check("indisponível usa ícone maior", html.includes("--mdc-icon-size:8.4vh"), html);
check("indisponível não é clicável", html.includes("cursor:default"), html);

const weird = make({ entity: "light.esquisita" });
check("estado fora das listas vira desconhecido",
  weird.shadowRoot.innerHTML.includes('icon="mdi:crosshairs-question"'));

const missing = make({ entity: "light.nao_existe" });
check("entidade inexistente vira indisponível",
  missing.shadowRoot.innerHTML.includes('icon="mdi:cancel"'));

const sw = make({ entity: "switch.tomada" });
check("switch ligado conta como ligado e herda o ícone da entidade",
  sw.shadowRoot.innerHTML.includes('icon="mdi:power-socket-eu"')
  && sw.shadowRoot.innerHTML.includes("background-color:yellow"));

const inv = make({ entity: "light.luz_da_cozinha", invert: true });
check("invert:true troca ligada por apagada",
  inv.shadowRoot.innerHTML.includes("background-color:rgba(211, 211, 211, 0.2)"));

const geo = make({
  entity: "light.luz_da_cozinha", left: "calc(100% - 55%)", top: "14%",
});
check("geometria vai para o host",
  geo.style.left === "calc(100% - 55%)" && geo.style.top === "14%"
  && geo.style.width === "6vh" && geo.style.height === "6vh", JSON.stringify(geo.style));
check("scale padrão 0.6 compõe com o translate do picture-elements",
  geo.style.transform === "translate(-50%, -50%) rotate(0deg) scale(0.6)", geo.style.transform);

const noGeo = make({ entity: "light.luz_da_cozinha", size: "", scale: "" });
check("sem geometria na config, o host não é tocado (vale o `style:` do YAML)",
  noGeo.style.left === undefined && noGeo.style.width === undefined
  && noGeo.style.transform === undefined);

const rgb = make({ entity: "light.luz_da_cozinha", color_by_light: true });
html = rgb.shadowRoot.innerHTML;
check("color_by_light pinta com a cor da lâmpada",
  html.includes("background-color:rgb(255, 170, 0)"), html);
check("halo sai da cor da lâmpada",
  html.includes("rgba(255, 170, 0, 0.5)"), html);

hass.states["light.luz_da_cozinha"] = {
  state: "on", attributes: { friendly_name: "LUZ DA COZINHA", brightness: 26 } };
const dim = make({ entity: "light.luz_da_cozinha", glow_by_brightness: true });
check("halo encolhe com o brilho baixo",
  dim.shadowRoot.innerHTML.includes("box-shadow:0 0 3.33vh 0.833vh"),
  dim.shadowRoot.innerHTML);
hass.states["light.luz_da_cozinha"] = {
  state: "on", attributes: { friendly_name: "LUZ DA COZINHA", brightness: 255, rgb_color: [255, 170, 0] } };

const hex = make({ entity: "light.luz_da_suite", color_off: "#33cc55" });
check("halo derivado de #hex",
  hex.shadowRoot.innerHTML.includes("rgba(51, 204, 85, 0.5)"), hex.shadowRoot.innerHTML);

const noGlow = make({ entity: "light.luz_da_cozinha", glow: false });
check("glow:false apaga o box-shadow", !noGlow.shadowRoot.innerHTML.includes("box-shadow"));

const hide = make({ entity: "light.luz_da_suite", hide_off: true });
check("hide_off some com a bolinha", hide.shadowRoot.innerHTML.includes("display:none"));

hass.calls = [];
on._run(on._config.tap_action, true);
check("tap chama homeassistant.toggle",
  hass.calls.length === 1 && hass.calls[0][1] === "toggle"
  && hass.calls[0][2].entity_id === "light.luz_da_cozinha", JSON.stringify(hass.calls));

hass.calls = [];
gone._run(gone._config.tap_action, true);
check("indisponível não chama serviço nenhum", hass.calls.length === 0);

const unlocked = make({ entity: "light.sumida", lock_when_broken: false });
hass.calls = [];
unlocked._run(unlocked._config.tap_action, true);
check("lock_when_broken:false volta a aceitar o tap", hass.calls.length === 1);

const still = make({ entity: "light.luz_da_cozinha" });
still.shadowRoot.innerHTML = "TOCADO";
still.hass = hass;
check("mesmo estado não redesenha", still.shadowRoot.innerHTML === "TOCADO");
hass.states["light.luz_da_cozinha"] = { state: "off", attributes: {} };
still.hass = hass;
check("estado novo redesenha",
  still.shadowRoot.innerHTML.includes("rgba(211, 211, 211, 0.2)"));
hass.states["light.luz_da_cozinha"] = {
  state: "on", attributes: { friendly_name: "LUZ DA COZINHA", brightness: 255, rgb_color: [255, 170, 0] } };

let threw = false;
try { new reg["mw-light-element"]().setConfig({}); } catch (e) { threw = true; }
check("setConfig sem entity falha", threw);

console.log(fails ? `\n${fails} verificação(ões) falharam` : "\ntudo ok");
process.exit(fails ? 1 : 0);
