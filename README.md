# MW Light Element

Elemento de **picture-elements** do Home Assistant: a bolinha luminosa que
representa uma **luz** (ou tomada, ou interruptor) na planta, pintada pelo
estado — ligada, apagada, indisponível, desconhecido — com halo, borda e
ícone de exceção.

Troca o bloco de **4 `conditional` + 4 `custom:button-card`** (~120 linhas por
luz) por **um elemento de 5 linhas**, sem perder nada do visual.

```yaml
type: custom:mw-light-element
entity: light.luz_da_cozinha
name: LUZ DA COZINHA
left: calc(100% - 55%)
top: 14%
```

> É um **elemento**, não um card: só funciona dentro de
> `type: picture-elements` (na lista `elements:`).

Irmão do [MW Door / Window Element](https://github.com/visaodeempresa/mw-ha-door-window-element),
que faz o mesmo pelas portas e janelas da mesma planta.

## Instalação (HACS)

HACS → Dashboard → ⋮ → *Custom repositories* →
`https://github.com/visaodeempresa/mw-ha-light-element` → tipo **Dashboard** →
Download. Depois, hard refresh no navegador.

## Como funciona

O host do elemento **é a bolinha**. Dá para posicionar de dois jeitos:

- pela **config** (`left`, `top`, `size`, `scale`, `rotate`) — legível e fácil
  de gerar por script;
- pelo **`style:`** do picture-elements, como qualquer elemento nativo (nesse
  caso zere `size` e `scale`, senão a config vence).

O estado é resolvido para quatro modos, o que faz o elemento servir também
para `switch`, `input_boolean`, `fan` e afins:

| Modo | Estados |
|---|---|
| `on` | `on`, `playing`, `home`, `open`, `active` |
| `off` | `off`, `idle`, `standby`, `not_home`, `closed`, `paused` |
| `unavailable` | `unavailable` ou entidade que não existe |
| `unknown` | `unknown`, vazio, ou **qualquer estado fora das listas** |

## Opções

### Entidade

| Opção | Padrão | O que faz |
|---|---|---|
| `entity` | — | **obrigatória** |
| `name` | `""` | tooltip; vazio = `friendly_name` |
| `invert` | `false` | entidade invertida (`on` = apagada) |

### Geometria (tudo opcional)

| Opção | Padrão | O que faz |
|---|---|---|
| `left` / `top` | `""` | posição; aceita `%` e `calc(...)` |
| `size` | `6vh` | diâmetro (vira `width` e `height`) |
| `scale` | `0.6` | escala do conjunto — como no button-card |
| `rotate` | `null` | graus |
| `border_radius` | `50%` | `50%` = círculo |

### Aparência

| Opção | Padrão |
|---|---|
| `opacity` | `1` |
| `glow` | `true` |
| `glow_blur` / `glow_spread` | `8vh` / `2vh` |
| `glow_opacity` | `0.5` — alfa do halo derivado da cor do estado |
| `glow_blur_<modo>` / `glow_spread_<modo>` | `""` (usa o global); `4vh`/`1vh` em `unavailable` e `unknown` |
| `color_on` | `yellow` |
| `color_off` | `rgba(211, 211, 211, 0.2)` |
| `color_unavailable` / `color_unknown` | `rgba(255, 99, 71, 0.7)` |
| `color_<modo>_glow` | `""` = derivado da cor do estado; `rgba(255, 99, 71, 1)` nas exceções |
| `border_off` | `4px solid rgba(0, 255, 255, 0.5)` |
| `border_on` / `border_unavailable` / `border_unknown` | `""` |
| `hide_<modo>` | `false` — some com a bolinha naquele estado |

O halo sai da própria cor do estado com outro alfa (entende `rgb`, `rgba` e
`#hex`); cor nomeada ou `var(--...)` sai inteira, sem transparência.

### Luz de verdade

| Opção | Padrão | O que faz |
|---|---|---|
| `color_by_light` | `false` | usa o `rgb_color` da lâmpada em vez de `color_on` (halo junto) |
| `glow_by_brightness` | `false` | halo cresce com o `brightness` (35% a 100%) |

### Ícones

| Opção | Padrão |
|---|---|
| `icon` | `""` — força o ícone em todos os modos |
| `icon_on` / `icon_off` | `""` = ícone da entidade, ou `icon_fallback` |
| `icon_fallback` | `mdi:lightbulb` |
| `icon_unavailable` | `mdi:cancel` |
| `icon_unknown` | `mdi:crosshairs-question` |
| `color_icon_on` | `var(--state-light-active-color, rgba(253, 216, 53, 1))` |
| `color_icon_off` | `rgba(0, 255, 255, 0.5)` |
| `color_icon_unavailable` | `rgba(255, 255, 0, 1)` |
| `color_icon_unknown` | `rgba(255, 255, 255, 0.8)` |
| `icon_size` | `5vh` (`8.4vh` nas exceções) |
| `icon_scale` | `1` (`0.85` nas exceções) |
| `icon_offset_y` | `5%` |
| `icon_upright` | `false` — `true` desfaz o `rotate` só no ícone |

### Ações

`tap_action` (padrão `toggle`), `hold_action` (padrão `more-info`) e
`double_tap_action` aceitam string (`more-info`, `toggle`, `navigate`, `url`,
`call-service`, `none`) ou o objeto completo do HA
(`{action: navigate, navigation_path: /planta}`). Para a forma string, use
`navigation_path`, `url_path`, `service` e `service_data` no nível de cima.

`lock_when_broken` (padrão `true`) deixa o tap mudo quando a entidade está
`unavailable` ou `unknown` — como no bloco original. O hold continua abrindo
o more-info, que é onde se vê o porquê.

## Exemplos

`examples/luz-da-cozinha.yaml` — o bloco original convertido, a variante com
`style:`, luz RGB com halo por brilho, tomada e luz só de sinalização.

## Desenvolvimento

Arquivo único, **sem build**: `dist/mw-light-element.js` é fonte e artefato.

```bash
node --check dist/mw-light-element.js
node tools/probe.js   # instancia o elemento sem navegador
```

Push na `main` tocando `dist/**` ou `hacs.json` → bump semântico → tag →
Release → o HACS avisa a atualização.

## Pendente (v0.2.0)

- Editor visual (`<ha-form>`) — o picture-elements ainda edita elemento
  custom por YAML; entra junto com o suporte no MW Floorplan Studio.
- Geração automática dos elementos a partir da planta, no Floorplan Studio.
- Fluxo DevOps completo (`develop` → `release` → `main`), skill do repositório
  e ADR — depois da validação no HA.

---

© 2026 MAYCON WILLIAN OLIVEIRA — MIT
