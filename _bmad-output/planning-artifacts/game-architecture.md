---
title: 'Game Architecture'
project: 'train-mind-map'
date: '2026-09-24'
author: 'Christinoleo'
version: '1.0'
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9]
status: 'complete'
engine: 'PixiJS 8.21 + TypeScript 6.0 + Vite 8'
platform: 'web mobile + web desktop (itch.io HTML5)'

# Source Documents
gdd: '_bmad-output/planning-artifacts/gdds/gdd-train-mind-map-2026-09-24/gdd.md'
epics: '_bmad-output/planning-artifacts/gdds/gdd-train-mind-map-2026-09-24/epics.md'
brief: '_bmad-output/planning-artifacts/briefs/brief-train-mind-map-2026-09-24/brief.md'
---

# Game Architecture

## Resumo Executivo

A arquitetura do **train-mind-map** usa **TypeScript + PixiJS 8 (WebGL)**, empacotada com Vite 8. O alvo é o navegador mobile, publicado no itch.io como HTML5, com meta de ≤ 5 MB e 60 FPS num Galaxy A52 e num iPhone 11.

**Decisões-chave:**
- **Simulação pura e determinística** em `sim/`, com tick fixo de 100 ms e sem dependência do Pixi ou do DOM. Roda na main thread e está pronta para ir para um Worker.
- **Toda mutação passa por comandos** enfileirados e aplicados no início do tick. Isso dá desfazer, validação única e replay.
- **Validação planar** com geometria inteira e hash espacial. **Ferrovia** de via dupla com reserva de segmentos e A*. **Energia** por componentes conexos.
- **Offline híbrido:** a mesma simulação roda em avanço rápido até o regime, e o resto do tempo é extrapolado.
- **UI em DOM com Preact** e signals sobre o canvas. **Save em IndexedDB** com migrações. **Superadmin** e replay carregados só sob demanda.

**Estrutura:** organizada por domínio, em 7 camadas, com as fronteiras checadas por lint. **Padrões:** 4 padrões novos, padrões-base e um checklist de consistência para agentes.

**Pronto para:** criação de épicos e stories (`gds-create-epics-and-stories`).

## Ambiente de Desenvolvimento

### Pré-requisitos

- Node.js ≥ 22 LTS e npm.
- Chrome com DevTools (depuração e emulação mobile) e um aparelho Android e um iPhone reais para medir desempenho.

### Ferramentas de IA

| Ferramenta | Uso |
|---|---|
| Skills oficiais do PixiJS (`node_modules/pixi.js/skills/`) | Guia de API atual do Pixi para os agentes |
| Chrome DevTools MCP (já instalado) | Inspecionar e verificar o jogo no navegador via `window.game` |

### Comandos de setup

```bash
npm create pixi.js@latest train-mind-map -- --template bundler-vite
cd train-mind-map
npm i preact @preact/signals idb-keyval
npm i -D typescript@~6.0 @preact/preset-vite vite-plugin-pwa vitest eslint typescript-eslint
# expor as skills oficiais do Pixi aos agentes
mkdir -p .claude/skills && cp -r node_modules/pixi.js/skills/* .claude/skills/
```

### Primeiros passos

1. Criar a estrutura de pastas e a regra de fronteira do ESLint (`sim/` isolado).
2. Implementar `sim/state`, `sim/commands` (dispatcher, fila, desfazer) e `sim/tick.ts`, com o teste de determinismo.
3. Implementar `sim/geometry` (planar + hash espacial) com testes de caso-limite, depois a câmera, os gestos e o render de nós e arestas (E1).
4. Medir o FPS e a memória no iPhone 11 desde o primeiro protótipo de render.

## Contexto do Projeto

### Visão geral do jogo

**train-mind-map**: um factory builder no estilo Factorio, em que a fábrica é um diagrama de nós num mapa 2D. As arestas carregam itens e energia e nunca se cruzam. Uma camada ferroviária separada, de via dupla, carrega lotes de itens sem colisões. O jogo começa como clicker, vira idle (com progresso offline) e termina com o lançamento de um foguete.

### Escopo técnico

**Plataforma:** navegador mobile (principal) e navegador desktop, com PWA offline.
**Gênero:** simulação (factory) + idle/incremental.
**Nível do projeto:** complexidade média-alta. É single-player, mas a simulação e a UX de toque são exigentes.
**Stack decidida:** TypeScript + PixiJS (WebGL), com a simulação desacoplada da renderização.

### Sistemas centrais

| Sistema | Complexidade | Seção do GDD |
|---|---|---|
| Simulação de fluxo (tick de 10/s, vazão, receitas, estados bloqueado e faminto) | alta | Sistemas de simulação, Nós, Arestas |
| Geometria planar (validar arestas sem cruzamento, polilinhas, comprimento, água) | alta | Arestas |
| Rede ferroviária (via dupla, reserva de segmentos, rotas, estações, lotes) | alta | Trens |
| Malhas de energia (componentes conexos por aresta e trilho, satisfação proporcional) | média | Energia |
| Renderização em massa (1.000 itens animados, 20 trens, 3 níveis de zoom) | alta | Desempenho, Arte |
| Input de toque (câmera, arrastar aresta, dobras, alvos de 44 px, desfazer) | média-alta | Controles |
| Cálculo offline (avanço rápido + extrapolação, ≤ 1 s para 24 h) | média | Automação |
| Estoque global (Núcleo e Caixas, ordem de débito, construção) | média | Estoque global |
| Geração de mapa por seed (jazidas, lagos, garantias de distância) | média | Mapa |
| Pesquisa e progressão (árvore, desbloqueios, eras) | baixa | Progressão |
| Save e load (automático a cada 30 s, exportar e importar, versionamento) | média | Plataforma |
| Áudio (SFX agregados, bloqueio de autoplay) | baixa | Áudio |

### Requisitos técnicos

- **Desempenho:** 60 FPS (mínimo 30) com 1.000 itens visíveis e 20 trens, num Galaxy A52 com Chrome e num iPhone 11 com Safari. Memória ≤ 300 MB.
- **Carregamento:** ≤ 5 MB transferidos, interativo em ≤ 3 s em 4G.
- **Escala da simulação:** 500 nós, 1.000 arestas e 20 trens mantendo 10 ticks/s.
- **Offline:** 24 h calculadas em ≤ 1 s.
- **Rede:** nenhuma. Single-player, sem servidor e sem contas.
- **Persistência:** local, com exportação e importação em texto.

### Fatores de complexidade

- **Conceitos novos:** a regra planar aplicada em tempo real durante o arraste, o grafo com duas camadas acopladas por estações, a energia conduzida pela topologia e o cálculo offline em estado estacionário com trens.
- **Pontos quentes de desempenho:** a detecção de cruzamento a cada movimento do dedo, a animação de itens e a reconstrução das malhas quando a topologia muda.

### Riscos técnicos

1. O desempenho do WebGL no Safari do iOS com milhares de sprites.
2. Precisão do toque ao arrastar arestas entre conectores pequenos.
3. Divergência entre a simulação ao vivo e o cálculo offline.
4. Impasse residual de trens em ciclos de junções.
5. Migração de saves entre versões do jogo.

## Engine e Framework

### Stack selecionada

| Componente | Versão (verificada em 2026-09-24) |
|---|---|
| PixiJS | 8.21.0 (renderizador WebGL por padrão; WebGPU opcional, desligado) |
| TypeScript | **6.0.x fixado** (o typescript-eslint 8.70 exige `<6.1`; o TS 7 fica para quando o lint suportar) |
| ESLint / typescript-eslint | 10.11.x / 8.70.x |
| Preact / @preact/preset-vite | 10.29.x / 2.10.x |
| Vite | 8.3.x (bundler Rolldown) |
| Vitest | 5.0.x |
| vite-plugin-pwa | 1.3.x |

**Justificativa:**
- É leve: cerca de 261 KB gzip para o PixiJS completo, com tree-shaking, e cabe na meta de ≤ 5 MB.
- O WebGL desenha em lote dezenas de milhares de sprites.
- TypeScript com tipagem forte ajuda os agentes de IA a manter o código consistente.
- Godot e Unity foram descartadas pelo tamanho do build web e pelo tempo de inicialização no celular. Bibliotecas de diagrama foram descartadas por usarem DOM e SVG.

### Inicialização do projeto

```bash
npm create pixi.js@latest train-mind-map -- --template bundler-vite
```

### O que a stack fornece

| Componente | Solução | Notas |
|---|---|---|
| Renderização | PixiJS (WebGL) | `Container`, `Sprite`, `Graphics`, `ParticleContainer` para itens em massa |
| Entrada | eventos de ponteiro do Pixi e do DOM | os gestos (pinça, arraste de aresta) são implementação própria |
| Build | Vite 8 | dev server, build de produção, PWA via plugin |
| Testes | Vitest 5 | testes da simulação e da geometria sem render |
| Física | nenhuma (não é necessária) | a simulação é discreta e lógica |
| Cenas | nenhuma | estrutura própria de telas e estados |

### Implementações próprias (sem dependência)

- **Câmera:** pan, pinça, 3 níveis de detalhe e rolagem automática durante o arraste. O `pixi-viewport` foi descartado por estar sem manutenção desde 2025 e pelo risco de conflito com o gesto de arrastar aresta.
- **Áudio:** Web Audio API nativa. O `@pixi/sound` foi descartado por estar sem manutenção desde 2024.

### Ferramentas de IA

- **Skills oficiais do PixiJS** (incluídas no pacote a partir da 8.19, em `node_modules/pixi.js/skills/`) ficam disponíveis aos agentes no `.claude/skills` do projeto.
- O Chrome DevTools MCP já está disponível no ambiente e serve para verificação no navegador.

### Riscos da plataforma

- **iOS Safari:** há perda de contexto WebGL sem recuperação (pixijs#12224). Mitigação: uma única `Application` e tratamento de `webglcontextlost` com recriação dos recursos.
- Há relatos de regressão de memória e VRAM no v8. Por isso a meta de 300 MB precisa ser medida no iPhone 11 desde o E1.

### Decisões arquiteturais restantes

1. Modelo de dados da simulação e separação entre simulação e render (thread, formato de estado).
2. Estrutura do grafo e índice espacial para a validação planar.
3. Modelo da rede ferroviária (segmentos, reserva, rotas).
4. Estratégia de render dos itens em massa.
5. Gerenciamento de estado e comandos (desfazer, eventos).
6. Persistência, formato do save e migração.
7. Cálculo offline.
8. Carregamento de assets e dados (receitas, pesquisa).

## Decisões Arquiteturais

### Resumo

| Categoria | Decisão | Versão | Justificativa |
|---|---|---|---|
| Execução da simulação | Main thread, núcleo pronto para Worker | — | Simples, sem serialização por tick; migra para Worker se a medição mostrar gargalo |
| Modelo de estado | Dados planos serializáveis + sistemas como funções puras (sem biblioteca ECS) | — | Save trivial, testável, determinístico |
| Mutação | Padrão Command com validação e inverso (desfazer) | — | Toda mudança do jogador passa por um único ponto |
| Offline | Híbrido: avanço rápido da mesma simulação até o regime, depois extrapolação | — | Não diverge da simulação ao vivo |
| UI | DOM + Preact sobre o canvas; o mundo fica no Pixi | Preact 10.29.x, @preact/signals 2.11.x | Texto nítido, layout em CSS, acessível |
| Save | IndexedDB via idb-keyval, JSON versionado + migrações | idb-keyval 6.3.x | Assíncrono, sem limite apertado |
| Render de itens | `ParticleContainer` + culling + LOD por zoom | PixiJS 8.21 | Atende 1.000 itens a 60 FPS |
| Geometria planar | Polilinhas em coordenadas inteiras de célula + hash espacial em grade | — | Validação em O(k) por movimento do dedo |
| Energia | Componentes conexos (union-find) recalculados só quando a topologia muda | — | Custo zero por tick |
| Ferrovia | Grafo dirigido de faixas + tabela de reserva de segmentos + A* | — | Colisão impossível por construção |
| Mapa | PRNG com seed + ruído próprio, determinístico | — | Mesma seed gera o mesmo mapa |
| Dados de jogo | Módulos TS tipados (`data/*.ts`) | — | Checagem em compilação, sem parse |
| Assets | Pré-carregar tudo (atlas único) | — | Total pequeno; sem travadas durante o jogo |
| Áudio | Web Audio nativo, desbloqueio no 1º gesto, SFX agregados | — | Sem dependência sem manutenção |

### Gerenciamento de estado

- **`GameState`** é um objeto puro e serializável:
  - `tick`, `rng`, `map` (inteiro até 120², com `revealedRing`), `nodes`, `edges`, `rails` (faixas, segmentos, interconexões), `trains`, `lines`, `research`, `stamina`, `stats` (histórico em 1, 10 e 60 min), `rocketsLaunched`;
  - dados específicos de cada tipo de nó (buffer da Caixa, buffer da Estação, receita) ficam **no próprio nó**, discriminados por `kind`. Não há coleções paralelas `boxes`/`stations`;
  - `stock` é um **cache derivado** da soma das Caixas e do Núcleo, recalculado ao final do tick. Não é salvo;
  - as coleções são `Map<Id, T>`, com IDs numéricos incrementais;
  - não guarda referências a objetos do Pixi.
- **Sistemas da simulação** são funções `(state, dt) => void`, executadas em ordem fixa por tick: comandos enfileirados → energia (satisfação calculada com a demanda do tick anterior) → extração → produção nos nós → fluxo nas arestas → estações e trens → pesquisa → estoque e estatísticas. A produção usa a satisfação calculada no início do tick; a demanda conta os nós que não estão `starved` nem `blocked`.
- **Tick fixo de 100 ms** (10/s), num acumulador sobre o `requestAnimationFrame`. A simulação não lê o relógio nem usa `Math.random`; tempo e aleatoriedade entram como parâmetros.
- **Comandos:** `PlaceNode`, `ConnectEdge`, `MoveNode`, `RemoveNode`, `PlaceRail`, `ToggleCrossing`, `SetRecipe` etc. Cada comando tem `validate(state)`, `apply(state)` e `invert()`.
  - `dispatch` valida imediatamente (para dar feedback) e **enfileira**. A fila é aplicada no **início do próximo tick**, na ordem de chegada, e cada comando é revalidado antes de aplicar. O replay grava `[tick, comando]`.
  - `apply` captura os dados necessários para o `invert()` (por exemplo, a aresta removida). O desfazer é uma pilha de 20 inversos, e cada inverso passa pela mesma fila e revalidação (um desfazer pode falhar com `Result`).
  - A UI e o input **só** alteram o estado por comandos.
- **Eventos:** a simulação emite eventos numa fila (`ItemProduced`, `NodeBlocked`, `TrainArrived`, `ResearchDone`…), consumida pelo render, pelo áudio e pela UI depois de cada tick.
- **Ponte com a UI:** um adaptador publica um resumo do estado em `@preact/signals` a 4 Hz (estoque, energia, pesquisa). A UI nunca lê o `GameState` direto.

### Modelo de fluxo nas arestas

- Uma aresta é uma fila de itens `{type, pos}`, em que `pos` é a distância percorrida em células.
- A velocidade é de 3 células/s. O espaçamento mínimo entre itens é `velocidade ÷ vazão`, o que impõe a vazão (2, 4 ou 8 itens/s).
- Se o nó de destino não aceita o item, a fila para, e a aresta fica "cheia".
- O render interpola `pos` entre ticks usando a fração do acumulador.

### Geometria planar

- Arestas são polilinhas com vértices em células inteiras. O teste de interseção de segmentos usa aritmética inteira (orientação por produto vetorial), sem erro de ponto flutuante.
- O **hash espacial em grade** (baldes de 8×8 células) indexa os segmentos de aresta, os retângulos dos nós e as células de água. Um candidato consulta só os baldes que ele toca.
- **Roteamento (issue #2):** `sim/geometry/route.ts` calcula a rota de uma aresta com A* em 4 direções sobre a grade de células. As células ocupadas por nós, água e arestas existentes ficam bloqueadas. O desempate é determinístico (ordem fixa das direções, menor número de dobras) e o caminho é simplificado em polilinha. A mesma função serve à prévia, ao `ConnectEdge` e ao `MoveNode`.
- Durante o arraste, a validação e o roteamento rodam no máximo uma vez por frame.
- A camada de trilhos tem seu próprio índice. Arestas e trilhos não colidem entre si, exceto trilho contra nó (que é proibido, a não ser na Estação).

### Energia

- Uma malha é um componente conexo do grafo formado pelas arestas, pelos trilhos e pelas estações da mesma rede ferroviária. É calculada com union-find e marcada como suja em qualquer comando topológico.
- Por tick: `satisfação = min(1, oferta ÷ demanda)` por malha. Cada nó multiplica o próprio progresso pela satisfação da sua malha.

### Ferrovia

- **Faixas:** cada trilho da via dupla gera duas faixas dirigidas. Os pontos de interconexão (cruzamento X, junção Y, estação) dividem as faixas em **segmentos**.
- **Rota:** A* sobre o grafo de segmentos, até a próxima estação da linha.
- **Reserva:** a tabela `segmento → trem` é consultada antes de o trem entrar. O trem reserva a cadeia de segmentos até o próximo ponto onde pode parar. Um cruzamento X é um recurso exclusivo compartilhado pelas faixas que se cruzam.
- **Impasse residual:** um grafo de espera (trem → trem). Um ciclo detectado gera o evento `TrainDeadlock`, que é destacado na UI.
- **Automação (T1–T5, GDD 1.4):**
  - As regras são **dados declarativos** no estado (`StationRule`, `TrainRule`), avaliados em `sim/rail/rules.ts`: as regras de estação uma vez por segundo simulado, e as regras de trem ao partir ou quando o trem fica bloqueado.
  - O despachante (`sim/rail/dispatch.ts`) roda a cada 2 s simulados, em ordem determinística (IDs crescentes).
  - Os grupos de estação são um índice derivado `nome → StationId[]`.
  - Tudo é alterado por comandos (`SetStationRules`, `SetTrainRules`, `SetStationMode`, `SetTrainMode`).
  - A UI fica em `ui/RulesEditor` (formulário com seletores).
- **Lote:** a estação tem um buffer. O trem carrega e descarrega a uma taxa fixa (50 itens/s por vagão) até a condição de partida.

### Progresso offline

1. Ao carregar, calcular `Δt = agora − último save`, limitado pelo teto de pesquisa (8, 12 ou 24 h).
2. **Avanço rápido:** rodar a mesma simulação com o **mesmo tick de 100 ms**, sem render e sem eventos visuais, e com `ctx.offline = true` (os Laboratórios não consomem). Regime detectado quando as taxas de produção por item variam menos de 2% entre duas janelas consecutivas, cada uma com pelo menos 60 s e pelo menos 2× o maior ciclo de ida e volta entre as linhas de trem. Orçamento: 400 ms de CPU. Se o orçamento acabar antes do regime, usar as taxas da última janela completa.
3. **Extrapolação:** aplicar as taxas do regime ao tempo restante e truncar pela capacidade de cada Caixa e do Núcleo. Os Laboratórios não consomem offline (regra do GDD).
4. Registrar o resumo "enquanto você esteve fora" e o principal gargalo (o nó com o maior tempo bloqueado ou faminto).

### Persistência

- `idb-keyval`, com as chaves `save:auto` e `save:backup` (rotação: o save anterior vira backup).
- Formato: `{ schemaVersion, gameVersion, savedAt, seed, state }` em JSON. Coleções `Map` são serializadas como arrays de pares.
- Migrações: uma cadeia `migrate[v] (save) => save'`, aplicada em sequência até a versão atual.
- Exportar e importar: JSON → gzip (`CompressionStream`) → base64, copiado para a área de transferência.
- Salvamento automático a cada 30 s e em `visibilitychange`/`pagehide`.

### Render

- Um único `Application` do Pixi (é uma mitigação do bug de perda de contexto do iOS), com camadas:
  1. terreno e grade;
  2. jazidas;
  3. arestas;
  4. itens;
  5. nós;
  6. trilhos;
  7. trens;
  8. sobreposições (prévia, seleção, avisos).
- **Itens:** um `ParticleContainer`, com uma textura por item no atlas. Só os itens das arestas dentro do viewport entram (culling por AABB).
- **LOD:**
  - zoom distante: arestas como traço colorido pela mistura de itens, sem partículas;
  - zoom médio: pontos;
  - zoom próximo: ícones.
- A camada de trilhos esmaece (alpha 0,3) quando o foco está na fábrica, e vice-versa.

### Dados e assets

- As receitas, os nós, as pesquisas e os custos ficam em `src/data/*.ts`, como `const` tipados. Um teste unitário valida a integridade: toda receita alcançável, sem ciclos impossíveis.
- As receitas são copiadas do Factorio como placeholder (decisão do GDD).
- Os ícones são SVGs no repositório, empacotados num atlas PNG gerado no build. O pré-carregamento acontece no boot, com meta de ≤ 1 MB de assets.

### Registros de decisão (ADR resumidos)

- **ADR-01, main thread:** o Worker adicionaria serialização e input assíncrono sem ganho medido. O núcleo da simulação não importa nada do DOM nem do Pixi, o que torna a migração mecânica.
- **ADR-02, offline híbrido:** um modelo analítico separado divergiria da simulação (é um risco técnico listado no contexto). Reutilizar a simulação elimina a divergência.
- **ADR-03, UI em DOM:** menus e textos são fracos no canvas. Preact mais signals custam cerca de 8 KB e são familiares para agentes de IA.
- **ADR-04, Command:** o desfazer, a validação planar e o save exigem que toda mutação passe por um único funil.

## Preocupações Transversais

Estes padrões valem para todos os sistemas e devem ser seguidos por qualquer implementação.

### Tratamento de erros

**Estratégia:** `Result` para falhas esperadas + handler global para bugs.

- **Falhas esperadas** (aresta cruzaria, sem estoque, célula ocupada): `validate()` retorna `Result`. Nunca lançam exceção e viram feedback visual (prévia vermelha e motivo).
- **Bugs** (invariante quebrada, estado impossível): `throw`. O handler global (`window.onerror` + `unhandledrejection`):
  1. pausa a simulação;
  2. grava `save:crash` com o estado atual e o buffer de log;
  3. mostra a tela "Algo deu errado", com os botões Recarregar e Exportar save.
- A simulação nunca engole erro. `catch` vazio é proibido.
- `assert(cond, msg)` protege as invariantes da simulação. Ele fica ativo em dev e em produção (o custo é desprezível fora dos laços quentes).

```ts
type Result<T = void> = { ok: true; value: T } | { ok: false; reason: FailReason };

const r = cmd.validate(state);
if (!r.ok) return ui.showInvalid(r.reason); // 'crosses_edge' | 'no_stock' | 'occupied' | ...
```

### Log

- **Formato:** `log.{error|warn|info|debug}(modulo, mensagem, dados?)`, com `modulo` ∈ `sim | rail | power | input | render | save | ui | audio`.
- **Destino:** console em dev (todos os níveis). Em produção, apenas `warn` e acima, num **buffer circular de 200 entradas**, incluído no save exportado e no `save:crash`.
- **Proibido** logar dentro do tick quente (laços por item ou por nó). Use contadores agregados no overlay de debug.

```ts
log.warn('rail', 'deadlock detectado', { trains: [12, 15] });
```

### Configuração

| Tipo | Onde |
|---|---|
| Constantes do jogo (tick, tamanho de célula) | `src/config/constants.ts` |
| Balanceamento (receitas, custos, vazões, energia) | `src/data/*.ts` (tipados; placeholder copiado do Factorio) |
| Preferências do jogador (áudio, tema, zoom) | IndexedDB `settings`, separado do save |
| Flags de debug | `import.meta.env.DEV` + `?debug=1` na URL |

- Números de gameplay nunca ficam espalhados no código: sempre vêm de `data/` ou `constants`.

### Sistema de eventos

- **Padrão:** fila tipada. A simulação faz `emit(evt)` durante o tick, e o loop principal esvazia a fila depois do tick para os assinantes (render, áudio, UI e log).
- Eventos são uniões discriminadas, nomeadas no passado e em inglês, em PascalCase: `ItemProduced`, `NodeBlocked`, `TrainArrived`, `ResearchDone`, `TrainDeadlock`.
- A simulação nunca assina eventos: ela só emite. Assim continua pura e reproduzível.

```ts
type SimEvent =
  | { type: 'ItemProduced'; nodeId: NodeId; item: ItemId }
  | { type: 'TrainDeadlock'; trains: TrainId[] };
events.on('TrainArrived', e => audio.play('whistle', e.stationId));
```

### Ferramentas de debug

Ativadas por `?debug=1` ou em builds de dev. O código de debug fica num chunk separado, carregado sob demanda e fora do bundle principal.

1. **Painel superadmin:** acesso irrestrito para testar qualquer coisa:
   - dar ou remover qualquer item;
   - completar ou reverter pesquisas;
   - desbloquear tudo;
   - editar valores de qualquer nó, aresta ou trem;
   - teletransportar a câmera;
   - trocar ou regenerar a seed;
   - alterar a velocidade da simulação (0×, 1×, 10×, 100×);
   - forçar falta de energia;
   - simular N horas offline;
   - importar, exportar ou limpar o save.
2. **Overlay de desempenho:** FPS, ms por tick, ms de render, número de itens visíveis e totais, nós, arestas, trens e memória (`performance.memory` quando disponível).
3. **Overlays visuais:** baldes do hash espacial, malhas de energia coloridas, segmentos e reservas de trilho, grafo de espera dos trens e estados bloqueado e faminto.
4. **Console de comandos:** `window.game` expõe o estado, o dispatcher de comandos e os cheats para uso no DevTools. Isso também serve para agentes de IA via Chrome DevTools MCP.
5. **Replay determinístico:** grava `{seed, versão, [tick, comando]…}`, reproduz em qualquer velocidade e exporta o replay junto com o save. Exige simulação determinística (ver Gerenciamento de estado).

## Estrutura do Projeto

### Padrão de organização

**Por domínio, com camadas isoladas.** A regra de dependência é verificada por lint (`eslint` com `no-restricted-imports`):

- `sim/` importa apenas `sim/`, `data/` e `config/`. **Nunca** importa `pixi.js`, `preact`, DOM, `render/`, `ui/`, `input/` ou `platform/`.
- `render/`, `input/`, `ui/` e `audio/` leem o estado da simulação e alteram-no **somente** via comandos e dispatcher.
- `debug/` pode importar tudo, mas só é carregado por `import()` dinâmico.

### Estrutura

```
train-mind-map/
├── index.html
├── vite.config.ts            # PWA, atlas, chunks
├── tsconfig.json             # strict: true
├── eslint.config.js          # fronteiras de camada
├── assets/
│   ├── icons/                # items/*.svg, nodes/*.svg (atlas gerado no build)
│   └── audio/                # sfx/*.ogg|mp3, ambient/*
├── src/
│   ├── main.ts               # boot, loop (rAF + acumulador de tick), wiring
│   ├── config/constants.ts
│   ├── data/                 # items.ts, recipes.ts, nodes.ts, research.ts, costs.ts
│   ├── sim/
│   │   ├── state/            # GameState, ids (branded types), tipos
│   │   ├── commands/         # um arquivo por comando + dispatcher + undo
│   │   ├── systems/          # extraction, flow, production, power, research, stock
│   │   ├── geometry/         # planar (interseção inteira), spatialHash
│   │   ├── rail/             # lanes, segments, reservation, route (A*), deadlock, rules, dispatch
│   │   ├── mapgen/           # rng (seed), noise, generate
│   │   ├── offline/          # fastForward, steadyState, extrapolate
│   │   ├── events.ts
│   │   └── tick.ts           # ordem fixa dos sistemas
│   ├── render/               # app, layers, nodes, edges, items (particles), rails, trains, lod, atlas
│   ├── input/                # camera, gestures (pan/pinça), tools (place, connect, rail, move)
│   ├── ui/                   # Preact: hud, palette, nodeMenu, research, offlineReport, dialogs
│   ├── audio/                # engine (Web Audio), sfx
│   ├── platform/             # save (idb + migrações), errors, log, pwa
│   └── debug/                # superadmin, perfOverlay, visualOverlays, replay (lazy)
└── tests/
    ├── sim/                  # espelha src/sim (unit)
    ├── data/                 # integridade das receitas e da pesquisa
    └── e2e/                  # smoke no navegador (opcional)
```

### Mapa sistema → local

| Sistema | Local |
|---|---|
| Simulação de fluxo | `sim/systems/flow.ts`, `production.ts`, `extraction.ts` |
| Geometria planar | `sim/geometry/` |
| Ferrovia | `sim/rail/` + `render/rails.ts`, `render/trains.ts` |
| Energia | `sim/systems/power.ts` |
| Estoque e Caixas | `sim/systems/stock.ts` |
| Offline | `sim/offline/` |
| Mapa | `sim/mapgen/` + `render/layers.ts` |
| Render de itens | `render/items.ts` (ParticleContainer + LOD) |
| Câmera e gestos | `input/` |
| HUD e menus | `ui/` |
| Save | `platform/save.ts` |
| Superadmin | `debug/` |

### Convenções de nome

- **Arquivos:** `camelCase.ts` (`spatialHash.ts`); componentes Preact em `PascalCase.tsx` (`ResearchPanel.tsx`).
- **Tipos e classes:** `PascalCase`. **Funções e variáveis:** `camelCase`. **Constantes:** `UPPER_SNAKE_CASE`.
- **IDs:** branded types (`type NodeId = number & { __brand: 'NodeId' }`).
- **Itens, nós e receitas nos dados:** `snake_case` em inglês (`iron_plate`, `assembler_1`, `red_science`).
- **Comandos:** verbo + objeto (`PlaceNode`, `ConnectEdge`). **Eventos:** passado (`ItemProduced`).
- **Assets:** `kebab-case` (`iron-plate.svg`, `train-whistle.ogg`).
- **Idioma:** código e identificadores em inglês; textos visíveis ao jogador em pt-BR, num módulo de strings (`ui/strings.ts`), prontos para i18n.

## Padrões de Implementação

### Padrões novos

#### 1. Topologia em duas camadas (fábrica × ferrovia)

- **Componentes:**
  - `FactoryGraph` (nós + arestas, planar), com índice espacial próprio;
  - `RailNetwork` (faixas + segmentos), com índice espacial próprio;
  - `Station`, o único tipo presente nas duas camadas.
- **Regras:**
  - A validação planar de uma camada nunca consulta o índice da outra. A única exceção é trilho contra retângulo de nó, via a lista de nós.
  - A Estação é um nó do `FactoryGraph`, com conectores, e também um ponto de parada no `RailNetwork`. Ela guarda o buffer de itens.
  - Energia e malhas unem as duas camadas pela Estação (union-find sobre arestas + trilhos).
- **Fluxo:** aresta → buffer da Estação → vagões → buffer da Estação de destino → aresta.

#### 2. Validação planar em tempo real (arraste)

```ts
// input/tools/connectTool.ts
onPointerMove(p) {
  this.preview = snapPolyline(this.anchor, this.bends, toCell(p));
  this.dirty = true;                       // valida no máximo uma vez por frame
}
onFrame() {
  if (!this.dirty) return;
  this.result = ConnectEdge.validate(state, this.preview); // Result, sem throw
  render.previewEdge(this.preview, this.result.ok ? 'valid' : 'invalid');
  this.dirty = false;
}
onPointerUp() { if (this.result.ok) dispatch(new ConnectEdge(this.preview)); }
```

- `validate` usa `geometry/planar.ts`: interseção inteira de segmentos, consultando só os baldes do hash espacial que o candidato toca.
- A mesma função `validate` roda no arraste e no `dispatch`. Não existe uma segunda implementação.

#### 3. Ponte simulação → render com interpolação

- A simulação avança em ticks fixos de 100 ms. O render desenha a cada frame usando `alpha = acumulador / TICK_MS`.
- A posição visual de um item é `lerp(prevPos, pos, alpha)`. Para isso, a simulação guarda `prevPos` nas filas de aresta e nos trens.
- O render **nunca** escreve no estado.

#### 4. Offline híbrido

- Fica em `sim/offline/fastForward.ts`. Reutiliza `tick()` com o mesmo tick de 100 ms (sem render e com `ctx.offline`), detecta o regime com `steadyState.ts` e extrapola com `extrapolate.ts`.
- É uma função pura: `(state, Δt, budget) => { state', report }`. É testável com seed fixa.

### Padrões padrão

**Comunicação entre sistemas**
- **Entrada → estado:** só por comandos (`dispatch(cmd)`).
- **Estado → reações:** só pela fila de eventos tipada.
- **Leitura:** render e UI leem o estado ou os signals, em modo somente leitura.
- **Dependências:** injeção explícita no `main.ts` (sem singletons globais, exceto `log`).

**Criação de entidades**
- **Na simulação:** funções de fábrica puras `createNode(state, kind, cell)`, `createTrain(state, …)`, que atribuem um ID e registram a entidade nos índices. Somente os comandos as chamam.
- **No render:** as views são criadas e descartadas pelo diff entre estado e views, com uma view por ID. Há **pool** para sprites de itens e trens.

**Transições de estado**
- Máquinas de estado explícitas, como uniões de strings:
  - `NodeStatus = 'working' | 'starved' | 'blocked' | 'no_power'` (`no_power` só com oferta zero na malha; com oferta parcial o nó continua `working`, só que mais lento)
  - `TrainState = 'loading' | 'departing' | 'moving' | 'waiting_reservation' | 'unloading'`
- Transições só dentro dos sistemas da simulação. Cada mudança emite um evento (`NodeStatusChanged`).

**Dados de jogo**
- Todo número de gameplay vem de `data/` ou de `config/constants.ts`. Um agente que precisar de um número novo o adiciona em `data/` com um comentário de origem (por exemplo, "Factorio placeholder").

**Testes**
- A simulação tem testes unitários em Vitest, com seed fixa: toda regra do GDD com número tem ao menos um teste (vazão, custos, fôlego, energia, reserva).
- Toda mudança em `sim/geometry` ou `sim/rail` exige teste de caso-limite: segmentos colineares, toque em vértice, cruzamento X, ciclo de espera.
- Teste de determinismo: mesma seed + mesmos comandos = hash de estado idêntico.

### Checklist de consistência para agentes

1. `sim/` importa Pixi, DOM ou Preact? → **Proibido.**
2. Alteração de estado fora de um comando? → **Proibido.**
3. `Math.random`, `Date.now` ou `performance.now` dentro de `sim/`? → **Proibido** (use o rng da seed e o dt).
4. Número mágico de gameplay no código? → Mover para `data/` ou `constants`.
5. Falha esperada lançando exceção? → Retornar `Result`.
6. Log dentro do laço de tick? → Remover; usar contador.
7. Texto visível ao jogador fora de `ui/strings.ts`? → Mover.

## Especificações Complementares (pós-validação)

### Semântica de E/S dos nós

- Cada conector de entrada tem um **buffer de 2× a quantidade que a receita pede daquele insumo**. Um item só entra se houver uma receita ativa que o consuma e espaço no buffer; senão, a aresta fica parada.
- Os insumos são aceitos por **qualquer** conector de entrada (não há conector reservado por ingrediente). O buffer é por tipo de item.
- Buffer de saída: 1 lote da receita. Quando está cheio, o nó fica `blocked`.
- **Divisor:** rodízio entre as saídas. Uma saída bloqueada é pulada; se todas estiverem bloqueadas, o Divisor fica `blocked`.
- **Mesclador:** rodízio justo entre as entradas que têm item disponível.
- **Filtro:** o item X vai para a saída A e o restante para a saída B. Se a saída de destino estiver bloqueada, o Filtro bloqueia.
- **Remover um nó ou aresta, ou trocar a receita:** os itens dentro dele são perdidos (decisão do GDD 1.3), e o custo de construção é reembolsado.

### Regras de trilho

- **Rota de trilho (issue #8):** `sim/rail/route.ts` usa A* em 8 direções sobre as células, sem cortar cantos por água, com desempate determinístico. Vai da ponta escolhida da estação de origem à ponta escolhida da estação de destino, e é a mesma função da prévia e do comando `PlaceRail`.
- Uma rota de trilho sobre outro trilho cria um **X automático**. `ToggleCrossing` alterna entre X (sem troca de faixa) e **interchange** (troca entre todas as faixas). A troca reconstrói o grafo de segmentos da interconexão.
- Trilho não atravessa água sem Ponte, nem nó que não seja Estação. Uma Ponte cruza água ou outro trilho em nível separado (sem interconexão).
- **Comprimento de trem:** cada vagão e a locomotiva ocupam 1 célula. Um segmento só pode ser o destino de parada de um trem se `comprimento_segmento ≥ comprimento_trem`. A plataforma da Estação ocupa 1 célula por veículo do maior trem.
- **Frenagem:** desaceleração de 8 células/s², o que determina o ponto de parada antes de um segmento não reservado.
- **Vagão:** assume o tipo do primeiro item carregado e só é liberado quando esvazia.
- A taxa de carga de 50 itens/s por vagão é um **placeholder** em `data/`.

### Loop e aba em segundo plano

- O acumulador de tick é limitado a **5 ticks por frame**.
- Em `visibilitychange` para oculto: salvar e registrar o timestamp.
- Ao voltar, se o intervalo passar de **10 s**, usar o caminho offline (avanço rápido + extrapolação). Caso contrário, recuperar até o limite por frame.

### Regras de gesto (toque)

- **Toque vs. arraste:** o movimento precisa passar de 8 px para contar como arraste. Um toque simples no vazio só seleciona ou desseleciona.
- **Arrastar a partir de um conector** cria uma aresta, com prévia ao vivo da rota automática. Arrastar a partir do corpo de um nó o move na hora (sem pressão longa; decisão do playtest de 2026-09-25). A partir do vazio, move a câmera. Sobre o corpo, só um conector a até meia célula conta, para que o resto do corpo mova o nó em qualquer zoom. Não há gesto de dobra.
- **Dois dedos** sempre cancelam a ferramenta em curso e fazem pinça e pan.
- **MoveNode:** recalcula a rota de todas as arestas ligadas. Se alguma ficar sem rota ou passar do comprimento máximo, o movimento é recusado com `Result`.
- **Desktop:** roda do mouse = zoom; arrastar no vazio, botão do meio ou espaço + arrastar = pan; teclas 1–9 = paleta; T = alternar camada; Ctrl+Z = desfazer; Esc = cancelar a ferramenta.

### Assets, áudio e PWA

- **Boot:** atlas de ícones e SFX curtos (≤ 1 MB). A música ambiente é carregada sob demanda depois que o jogo fica interativo.
- **Áudio:** formato único AAC em `.m4a` (Safari e Chrome), limite de 8 vozes simultâneas de SFX. SFX iguais em menos de 50 ms são agregados.
- ~~PWA~~ **(descartado na issue #9: o itch.io não suporta service worker nem manifest dentro do iframe)** `vite-plugin-pwa` com `generateSW` e pré-cache do shell e dos assets de boot. Uma atualização mostra o aviso "Nova versão — recarregar". Manifest com `orientation: any`.
- **Hospedagem (issue #9): itch.io, página HTML5 pública.**
  - Todo push no `main` publica via GitHub Actions + `butler push dist <ITCH_USER>/<ITCH_GAME>:html5 --userversion <sha>`, com o segredo `BUTLER_API_KEY` e as variáveis de repositório `ITCH_USER` e `ITCH_GAME`.
  - Vite com `base: './'`, porque o jogo é servido em `/html/{uploadId}/` num iframe cross-site em `html-classic.itch.zone`. O build deve ter menos de 1.000 arquivos.
  - **Sem PWA e sem service worker.** Não usar `vite-plugin-pwa`.
  - **Armazenamento:** o domínio do itch é compartilhado por todos os jogos. Toda chave e todo banco IndexedDB levam o prefixo `train-mind-map:`, e nenhuma chave inclui o caminho do build (os saves sobrevivem a novos uploads).
  - **iOS:** o Safari pode apagar ou deixar só em memória o armazenamento dentro do iframe. Quando o jogo roda em iframe no iOS, mostrar um aviso que sugere exportar o save. O exportar/importar é o seguro.
  - **Debug** (`?debug=1`) só fora do itch: dev server e `npm run preview`. O build do itch continua contendo o chunk lazy, mas sem gatilho.

### Geração de mapa

- PRNG **sfc32** com seed de 128 bits derivada da string da seed. O ruído é value/simplex próprio em `sim/mapgen/noise.ts`.
- O mapa inteiro de 120² é gerado no início. Os anéis são **revelados** por pesquisa (`revealedRing`).
- **Garantias** verificadas depois da geração (com nova tentativa usando a sub-seed seguinte): ferro, cobre, carvão e pedra a ≤ 15 células do Núcleo; petróleo só no anel 2 ou além, a ≥ 40 células. Na seed do MVP, o cobre fica a ≥ 30 células.

### Meta-progressão e persistência extra

- Conquistas e prestígio (stretch) ficam na chave `meta` do IndexedDB, **fora** do save da partida, e sobrevivem ao reset.
- A chave `settings` guarda as preferências.

### Mapa épico → arquitetura

| Épico | Local principal | Padrões |
|---|---|---|
| E1 Mapa e grafo | `sim/mapgen`, `sim/geometry`, `sim/commands`, `input/`, `render/layers`, `render/nodes`, `render/edges` | validação planar, Command, gestos |
| E2 Fluxo e produção | `sim/systems/{flow,production,extraction,power,stock}`, `render/items`, `ui/hud` | tick fixo, E/S dos nós, interpolação, LOD |
| E3 Clique e automação | `sim/systems/extraction` (fôlego), `input/tools`, `ui/onboarding` | Command `ManualTap`, eventos |
| E4 Pesquisa | `sim/systems/research`, `data/research.ts`, `ui/ResearchPanel` | dados tipados |
| E5 Ferrovia | `sim/rail/*`, `render/{rails,trains}`, `ui/LinePanel` (linhas e condições) | duas camadas, reserva, A* |
| E6 Idle e persistência | `sim/offline/*`, `platform/save`, `ui/OfflineReport` | offline híbrido, migrações |
| E7 Cadeia completa e foguete | `data/*`, `sim/systems/production` (Silo), `ui/Victory`, modo livre | dados tipados |
| E8 Polimento | `render/` (tema), `audio/`, `ui/StatsPanel`, `ui/Achievements` (`meta`), `platform/pwa` | — |
| E9 Prestígio | `platform/save` (`meta`), `sim/mapgen` (seed nova), `ui/Prestige` | — |
| Debug | `debug/*` (lazy) | superadmin, replay |
