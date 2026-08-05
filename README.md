# MW Light Element

Elemento de **picture-elements** do Home Assistant: a bolinha luminosa que
representa uma **luz** (ou tomada, ou interruptor) na planta, pintada pelo
estado — ligada, apagada, indisponível, desconhecido — com halo, borda e
ícone de exceção.

Troca o bloco de **4 `conditional` + 4 `custom:button-card`** (~120 linhas por
luz) por **um elemento de 5 linhas** — e roda muito mais leve que o original.

```yaml
type: custom:mw-light-element
entity: light.luz_da_cozinha
name: LUZ DA COZINHA
left: calc(100% - 55%)
top: 14%
```

> É um **elemento**, não um card: só funciona dentro de
> `type: picture-elements` (na lista `elements:`).

## Por que é rápido (v0.2)

O gargalo de uma planta com dezenas de luzes não é desenhar — é **quantas
vezes** se desenha. O Home Assistant empurra o objeto `hass` inteiro para
todo elemento a **cada mudança de qualquer entidade** da casa.

| | Antes (bloco YAML / v0.1) | Agora |
|---|---|---|
| mudou outra entidade | 4 `conditional` reavaliam + card redesenha | compara a referência do `state` e sai — **O(1)** |
| mudou a própria luz | `button-card` remonta o card inteiro | troca 1 atributo + ~8 custom properties |
| CSS | uma folha por card, por luz | **uma folha compartilhada** por todas as instâncias (`adoptedStyleSheets`) |
| ícone | recriado a cada render | criado uma vez, só troca o `icon` |
| toque | espera o round-trip do HA | **acende no dedo** (otimista, reverte se o HA não confirmar) |
| animação | `box-shadow` (repaint) | `transform`/`opacity` (composição na GPU) |

O toque também foi refeito em **pointer events**: um `hold` que abria o
`more-info` deixava o próximo toque preso — era o "às vezes não responde".
Agora `hold`, `tap` e `double tap` são independentes, arrastar não dispara
ação, e o `double_tap_action` só atrasa o toque quando está configurado.

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
  caso zere `size`, senão a config vence).

**Proporção:** `size` é em **% da largura da planta** e a altura vem de
`aspect-ratio: 1` — a luz encolhe e cresce junto com a imagem, em qualquer
tela. Halo, anel e ícone são medidos em unidades de container (`cqmin`), ou
seja, em % do próprio diâmetro: a bolinha inteira escala como um bloco só.
`vh`/`px` continuam aceitos, mas **não** acompanham a planta.

## Editor visual

O elemento expõe `getConfigElement()`: nas versões do HA cujo editor de
picture-elements suporta elementos custom, editar a luz abre um formulário
em pt-BR (entidade, geometria, efeito, cores, ações) em vez de YAML cru.
Onde não houver suporte, o YAML continua valendo — nada se perde.

## Estados

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
| `size` | `5%` | diâmetro, em % da largura da planta |
| `scale` | `null` | multiplicador opcional do conjunto |
| `rotate` | `null` | graus |
| `border_radius` | `50%` | `50%` = círculo |

### Aparência

| Opção | Padrão |
|---|---|
| `opacity` | `1` |
| `glow` | `true` |
| `effect` | `glow` — também `neon`, `soft`, `flat` |
| `gloss` | `true` — brilho de vidro na bolinha |
| `glow_scale` | `1` — multiplicador do halo |
| `glow_opacity` | `0.55` — alfa do halo derivado da cor do estado |
| `color_on` | `yellow` |
| `color_off` | `rgba(211, 211, 211, 0.2)` |
| `color_unavailable` / `color_unknown` | `rgba(255, 99, 71, 0.7)` |
| `color_<modo>_glow` | `""` = derivado da cor do estado; `rgba(255, 99, 71, 1)` nas exceções |
| `border_off` | `7% solid rgba(0, 255, 255, 0.55)` |
| `border_unknown` | `5% solid rgba(255, 255, 255, 0.35)` |
| `border_on` / `border_unavailable` | `""` |
| `hide_<modo>` | `false` — some com a bolinha naquele estado |

O halo sai da própria cor do estado com outro alfa (entende `rgb`, `rgba` e
`#hex`); cor nomeada ou `var(--...)` sai inteira, sem transparência.

`border_<modo>` é um **anel interno** no formato `"<espessura> solid <cor>"`.
Espessura em `%` é do diâmetro (acompanha a planta) — `border` em `%` não
existe no CSS, por isso o anel é desenhado com `box-shadow: inset`.

Indisponível e desconhecido **pulsam** devagar (halo respirando), com
`prefers-reduced-motion` respeitado. Ligar/apagar tem transição de ~0.26 s e
o toque afunda a bolinha (`:active`), para o dedo sentir resposta imediata.

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
| `icon_fallback` / `icon_fallback_off` | `mdi:lightbulb` / `mdi:lightbulb-outline` |
| `icon_unavailable` | `mdi:cancel` |
| `icon_unknown` | `mdi:crosshairs-question` |
| `color_icon_on` | `rgba(90, 62, 0, 0.85)` |
| `color_icon_off` | `rgba(0, 255, 255, 0.55)` |
| `color_icon_unavailable` | `rgba(255, 255, 0, 1)` |
| `color_icon_unknown` | `rgba(255, 255, 255, 0.85)` |
| `icon_size` | `""` = 55% do diâmetro (acompanha a planta) |
| `icon_scale` | `1` (×1.25 automático nas exceções) |
| `icon_offset_y` | `4%` |
| `icon_upright` | `false` — `true` desfaz o `rotate` só no ícone |
| `hide_icon` | `false` |

### Ações

`tap_action` (padrão `toggle`), `hold_action` (padrão `more-info`) e
`double_tap_action` aceitam string (`more-info`, `toggle`, `navigate`, `url`,
`call-service`, `none`) ou o objeto completo do HA
(`{action: navigate, navigation_path: /planta}`). Para a forma string, use
`navigation_path`, `url_path`, `service` e `service_data` no nível de cima.

`lock_when_broken` (padrão `true`) deixa o tap mudo quando a entidade está
`unavailable` ou `unknown` — como no bloco original. O hold continua abrindo
o more-info, que é onde se vê o porquê.

`optimistic` (padrão `true`) acende/apaga a bolinha no toque e reverte
sozinho em 2,5 s se o HA não confirmar. `haptic` (padrão `true`) dispara a
vibração do app companion.

## Exemplos

`examples/luz-da-cozinha.yaml` — o bloco original convertido, a variante com
`style:`, luz RGB com halo por brilho, tomada e luz só de sinalização.

## Desenvolvimento

Arquivo único, **sem build**: `dist/mw-light-element.js` é fonte e artefato.

```bash
node --check dist/mw-light-element.js
node tools/probe.js          # 46 verificações, sem navegador
open tools/preview.html      # bancada visual: 4 modos, 4 efeitos, resize
```

`tools/preview.html` imita um picture-elements com `ha-icon` de mentira —
serve para conferir halo, anel, proporção e redimensionamento sem subir nada
para o HA.

Push na `main` tocando `dist/**` ou `hacs.json` → bump semântico → tag →
Release → o HACS avisa a atualização.

## Pendente (v0.3.0)

- Geração automática dos elementos a partir da planta, no MW Floorplan Studio.
- Slider de brilho no arrastar vertical (opcional, desligado por padrão).
- Fluxo DevOps completo (`develop` → `release` → `main`), skill do repositório
  e ADR — depois da validação no HA.

---

© 2026 MAYCON WILLIAN OLIVEIRA — MIT
