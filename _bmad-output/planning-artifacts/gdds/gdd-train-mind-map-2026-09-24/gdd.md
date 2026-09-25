---
title: "train-mind-map - Game Design Document"
game_type: "simulation + idle-incremental"
platforms: ["navegador mobile (principal)", "navegador desktop"]
created: 2026-09-24
updated: 2026-09-24
version: 1.16
status: final
---

# train-mind-map - Game Design Document

**Autor:** Christinoleo
**Tipo de jogo:** Simulação (construção de fábrica) com elementos Idle/Incremental
**Plataformas:** navegador mobile (principal) e navegador desktop

> Os números deste documento são **valores iniciais de balanceamento**. O jogador verá esses valores; eles serão ajustados em playtest.

---

## Resumo Executivo

### Conceito central

Um factory builder no espírito de Factorio, jogado no navegador do celular. A fábrica é um **diagrama de nós** sobre um mapa 2D de recursos: nós de extração, fornalhas e montadoras ligados por arestas nas quais os itens correm visivelmente. **Arestas nunca se cruzam.** Uma **camada de trilhos** separada leva lotes de itens para longe e rápido, com cruzamentos e junções de verdade, e os trens nunca colidem. O ritmo começa como clicker (tocar para produzir) e vira idle (a fábrica roda sozinha, inclusive offline). A meta final é **lançar um foguete**.

### Público-alvo

- **Primário:** jogadores de Factorio, shapez, Mindustry e Builderment que querem uma experiência de fábrica no celular, em sessões de 2 a 10 minutos várias vezes ao dia, sem a complexidade de desktop.
- **Secundário:** jogadores de idle/clicker que querem decisões espaciais reais além de "comprar o próximo upgrade".

### Diferenciais (USPs)

1. **A fábrica é o grafo.** Não há grade de esteiras; construir é desenhar um diagrama de nós legível numa tela pequena.
2. **Regra planar.** Arestas não se cruzam, e isso cria tensão espacial crescente sem precisar de fases de puzzle.
3. **Duas camadas: fábrica e ferrovia.** Os trilhos são uma rede ferroviária real, com cruzamentos, junções e reserva automática, sobreposta ao grafo. Nenhum concorrente encontrado combina mapa de recursos, grafo, regra planar e trens (ver o addendum do brief).
4. **Do dedo ao idle.** O jogador sente a automação substituir o próprio clique.

---

## Objetivos e Contexto

### Objetivos do projeto

1. Validar num MVP jogável em poucas semanas a hipótese central: construir sem cruzar e depois destravar a logística com trens é divertido no celular.
2. Entregar um jogo completo até o foguete, com cerca de 30 itens, rodando leve no navegador mobile.
3. Projeto pessoal, feito solo com agentes de IA. O sucesso é um jogo que o autor quer jogar.

### Justificativa

Factory games profundos funcionam no toque (Mindustry, com cerca de 9,3M downloads no Android; Builderment, com mais de 1,5M). Os portais de navegador favorecem idle e incremental. Jogos de fábrica "só grafo" (Nodes, com 56% de avaliações positivas) falham por falta de espaço e de alma; o mapa espacial com trens é o que falta a eles. Fonte: `briefs/brief-train-mind-map-2026-09-24/addendum.md`.

---

## Gameplay Central

### Pilares

1. **Nunca cruzar.** Toda aresta de fábrica precisa caber no plano, sem exceção. Quando surge uma decisão de design, vence a opção que preserva a tensão espacial. Custo por comprimento e comprimento máximo reforçam a regra; a única saída é a camada de trilhos.
2. **Fluxo visível.** Todo item em trânsito aparece na tela, com cor e ícone por tipo. Cada aresta tem vazão máxima, e o gargalo precisa ser **visto** em até 3 segundos de olhar, sem abrir menus.
3. **Trem é a recompensa.** Os trens resolvem distância, volume (lotes) e congestionamento do plano. A diversão ferroviária tem três faces, que se complementam e crescem juntas: **projetar** o layout (interchanges, depósitos, vias), **programar** a automação (regras de estação e de trem) e **assistir** a rede se gerenciar sozinha enquanto escala. A rede ferroviária é a camada de maior profundidade logística, com cruzamentos e junções reais, sem colisões e sem sinais manuais.
4. **Do dedo ao idle.** A progressão tira o clique aos poucos. Nenhuma tarefa repetitiva fica manual depois que a automação dela existe, e a fábrica progride offline.

### Loop central

- **Micro (10–60 s):** ver o fluxo, identificar um gargalo (aresta cheia, nó parado), adicionar ou realocar um nó ou aresta, ver o fluxo mudar.
- **Sessão (2–10 min):** abrir o jogo, coletar o progresso offline, escolher uma pesquisa, expandir para um novo recurso ou montar uma nova linha de trem, e fechar.
- **Macro (horas/dias):** avançar pela árvore de pesquisa (ciência vermelha → verde → azul → foguete) e expandir o mapa. Estrutura típica: espaguete local, depois ferrovia ligando polos de produção.

### Vitória e derrota

- **Vitória:** lançar o foguete. Exige 50 partes de foguete no Silo. Depois do lançamento o jogo continua em modo livre, e o prestígio (stretch) oferece um reset.
- **Derrota:** não existe. Não há inimigos nem falência. A falha possível é a estagnação (gargalos), e o fluxo visível existe para revelá-la.

---

## Mecânicas de Jogo

### Mecânicas principais

**Mapa e recursos**
- Mapa 2D em células. A posição dos nós e das dobras de aresta encaixa na grade de células.
- O mapa é gerado por seed. A área inicial tem 48×48 células e se expande em anéis (+12 células por lado a cada expansão) via pesquisa: 72², 96² e 120².
- As jazidas são **infinitas** e ocupam de 3×3 a 6×6 células. A produção é limitada pelos extratores, não pelo estoque.
- Há 5 recursos brutos: ferro, cobre, carvão, pedra e petróleo. O petróleo aparece a partir da expansão 2.
- Água (lagos) bloqueia nós e arestas. Trilhos atravessam água só com ponte.

**Extração manual (clique)**
- Tocar numa jazida gera 1 item do recurso e o envia ao Núcleo, com animação de voo de 0,4 s.
- **Fôlego:** cada toque gasta 1 ponto de uma barra de 20, que recarrega 1 ponto a cada 3 s (0,33 toque/s sustentado). O clique serve de empurrão inicial, e um único extrator (0,5 item/s) já supera o ritmo sustentado do dedo.
- A pesquisa "Ferramentas" eleva o valor para 2 e depois 4 itens por toque.
- O clique manual existe só para minério de ferro, minério de cobre, carvão e pedra. **Não há fabricação manual:** todo item processado sai de um nó. Cadeia de partida: clique → Extrator e Fornalha (custam minério e pedra) → placas → Montadora 1 → engrenagem → ciência vermelha → Laboratório.

**Nós**
Todo nó tem conectores de entrada à esquerda e de saída à direita. Os nós ocupam de 2×2 a 3×3 células.

| Nó | Função | Entradas / Saídas | Base |
|---|---|---|---|
| Núcleo | caixa inicial especial: destino do clique, indestrutível | 4 entradas / 2 saídas | começa colocado; **capacidade infinita** |
| Caixa | buffer e armazém; conta no estoque global | 2 entradas / 2 saídas | 500 itens de tipos misturados |
| Extrator | produz o recurso das células de jazida sob ele; velocidade proporcional à cobertura (1 de 4 células = ¼); várias jazidas = cada uma na sua fração | 0 / 1 (2 e 3 via pesquisa) | 1 item a cada 2 s |
| Fornalha | fundição | 2 / 1 | receitas de 2 a 5 s |
| Gerador | queima carvão (depois combustível sólido) e gera energia | 1 / 0 | 1 carvão a cada 4 s → 10 ⚡ |
| Painel solar | energia sem combustível (era azul) | 0 / 0 | 3 ⚡ |
| Montadora (níveis 1–3) | receitas de montagem | 3 / 1 | velocidade 0,5× / 0,75× / 1,25× |
| Refinaria | petróleo → produtos | 1 / 3 | 5 s por ciclo |
| Planta química | química | 3 / 1 | receitas de 2 a 5 s |
| Divisor | 1 → 2 ou 3 saídas em rodízio | 1 / 3 | instantâneo |
| Mesclador | N entradas → 1 saída | 3 / 1 | instantâneo |
| Filtro | encaminha item X para a saída A e o resto para B | 1 / 2 | instantâneo |
| Laboratório | consome ciência para pesquisar | 3 / 0 | 1 pacote a cada 5 s |
| Estação | nó nas duas camadas (ver Trens) | 3 / 3 | — |
| Silo | recebe partes de foguete | 3 / 0 | 50 partes = lançamento |

- A receita de uma Montadora ou Planta química é escolhida pelo jogador ao colocar o nó, e pode ser trocada tocando nele.
- Um nó com a saída cheia **para**, e o ícone do nó mostra "bloqueado". O mesmo vale para falta de insumo ("faminto").
- **Estoque global:** tudo o que está no Núcleo e nas Caixas soma no estoque global, mostrado na barra superior. **O jogador nunca carrega nem arrasta itens.** Construir debita o estoque automaticamente.
  - Ordem de débito: primeiro Caixas sem aresta de saída (armazéns), depois Caixas com saída (buffers), sempre da mais próxima do local da obra. Os itens voam da caixa até a obra (animação de 0,6 s; transporte instantâneo por simplificação).
  - Cada Caixa tem a opção "não usar em construção", para proteger buffers de produção.
  - Uma Caixa com saída entrega seus itens em ordem de chegada (FIFO). Uma Caixa cheia bloqueia as arestas de entrada.
- **Custos de construção:** os nós iniciais custam minério bruto, então o clique paga o começo.

| Construção | Custo |
|---|---|
| Extrator | 10 minério de ferro + 5 pedra |
| Fornalha | 10 pedra |
| Gerador | 10 pedra + 10 minério de ferro |
| Caixa | 10 minério de ferro |
| Montadora 1 | 20 placas de ferro + 10 placas de cobre |
| Laboratório | 20 placas de ferro + 10 placas de cobre + 10 tijolos |
| Divisor / Mesclador / Filtro | 5 placas de ferro + 2 engrenagens |
| Estação | 20 placas de ferro + 10 tijolos |
| Locomotiva | 20 placas de ferro + 20 engrenagens + 10 circuitos |
| Vagão | 20 placas de ferro + 10 engrenagens |
| Aresta nível 1 / 2 / 3 | 1 minério de ferro / + 1 engrenagem / + 1 circuito, por célula |
| Trilho | 1 item "trilho" por célula (receita: 1 placa de ferro + 1 pedra → 2 trilhos) |

- Nós avançados (Montadora 2 e 3, Refinaria, Planta química, Silo) custam itens processados da era correspondente; os valores ficam na planilha de balanceamento.
- Tempos-base das receitas (velocidade 1,0×): engrenagem 1 s, fio 0,5 s, circuito 1 s, ciência vermelha 5 s, ciência verde 6 s, ciência azul 12 s; demais na planilha. As Montadoras multiplicam esses tempos pela velocidade do nível.
- Remover um nó devolve 100% do custo de construção. **Os itens que estavam dentro dele (buffers, arestas, vagões) são perdidos**, e o mesmo vale ao trocar a receita.

**Arestas**
- Uma aresta liga um conector de saída a um de entrada. A rota é **automática**: o menor caminho ortogonal pela grade, que desvia de nós, água e outras arestas (desempate determinístico). O jogador não coloca dobras; para mudar uma rota, remove e recria a aresta ou move nós (issue #2). A célula em frente a cada conector livre fica reservada, e se uma aresta nova não tem rota, as arestas existentes são re-roteadas para abrir espaço.
- **Regra planar:** uma aresta não cruza outra aresta, não atravessa nó e não atravessa água. Ao arrastar, o traçado inválido fica vermelho, e soltar o dedo nele não cria nada.
- O comprimento de uma aresta é a soma dos comprimentos dos seus segmentos, em células, arredondada para cima. **Comprimento máximo: 200 células em todos os níveis** (playtest 2026-09-25). A distância pesa de outro jeito: o **custo por célula dobra a cada 12 células** (células 1–12 ×1, 13–24 ×2, 25–36 ×4…) e a **vazão cai pela metade a cada 12**: vazão efetiva = vazão do nível × 0,5^⌊L/12⌋. Arestas de até 11 células não mudam. Arestas longas ficam caras e lentas, e o trem vira o jeito de levar volume longe.
- **Arestas não têm exceção: nunca cruzam.** Não há ponte nem túnel para arestas. Escalar além do plano local é papel dos trens.
- A vazão é de 2 itens/s (nível 1), 4 (nível 2) e 8 (nível 3). A velocidade visual é de 3 células/s.
- Uma aresta transporta vários tipos de item. Cada item aparece como um ponto colorido com ícone ao dar zoom, e a vazão total é compartilhada.
- Um upgrade de aresta pode ser aplicado sobre uma aresta existente, pagando a diferença.

**Trens (camada de trilhos)**
- A camada de trilhos é independente. Trilhos passam por cima de arestas. **Trilho não atravessa nó, exceto a Estação.** Um botão alterna a camada em foco, e a outra fica esmaecida.
- **Trilho (issue #8):** tem **rota automática**. O jogador arrasta de um conector de trilho (esquerdo ou direito) de uma estação até um conector de trilho de outra. A rota é o menor caminho em 8 direções (curvas de 45° e 90°), desviando de água e nós. Custa 1 item "trilho" por célula. **Todo trilho é via dupla:** um lado de ida e um de volta, sempre. Trens em sentidos opostos nunca disputam o mesmo trecho.
- **Interconexões:**
  - *Cruzamento (X):* dois trilhos se cruzam no mesmo nível.
  - *Junção (Y):* um trilho se divide em dois; o trem escolhe o caminho pela rota.
  - *Ponte:* passa sobre água ou sobre outro trilho, sem cruzamento em nível. É liberada por pesquisa.
  - Uma rota que atravessa outro trilho cria automaticamente um **cruzamento X**, desenhado só como os trilhos passando um sobre o outro, sem ícone. Tocar na interseção alterna entre **X** (os trens seguem reto) e **interchange** (os trens podem trocar de trilho em qualquer direção), que é desenhado como uma pequena rotatória de trilho. A troca altera o grafo de rotas.
- **Reserva automática (sem sinais):** a rede é dividida em segmentos entre interconexões. Antes de entrar num segmento, cruzamento ou junção, o trem reserva o caminho até o próximo ponto onde pode parar. Se o caminho estiver reservado, ele espera no fim do segmento atual. Colisões são impossíveis por construção.
  - Como todo trilho é via dupla, o impasse de frente (dois trens em sentidos opostos no mesmo trecho) não existe. Um impasse residual só pode surgir em ciclos de trens esperando uns pelos outros em junções ou estações lotadas. Se acontecer, o jogo destaca os trens e o trecho envolvidos.
- **Trem:** 1 locomotiva + de 1 a 4 vagões (2 no MVP). Trens não consomem combustível (simplificação).
 Cada vagão leva 50 itens de **um** tipo. A velocidade máxima é de 8 células/s, com aceleração de 0 a 8 em 3 s.
- **Estação (atualizado depois da issue #8):** é um **nó normal**, uma ficha igual às outras, que além dos conectores da fábrica tem **conectores de trilho**: círculos de onde saem as linhas de trilho. No MVP há 1 conector de trilho à esquerda e 1 à direita; futuramente, até 2–3 por lado. O trilho liga um conector de trilho a outro, com rota automática. O trem para no próprio nó: entra por um conector de trilho e pode sair por qualquer um.
- **Estação:** é nó do grafo e ponto no trilho ao mesmo tempo.
  - Arestas de entrada carregam o trem, e as de saída descarregam.
  - O buffer da estação é de 2× a capacidade do maior trem que para nela.
- **Linha:** é a rota de um trem, uma lista ordenada de estações. Cada parada tem uma condição de partida: "cheio", "vazio", "esperar X s", "cheio OU X s" ou "inativo por X s".
- **Vazão efetiva de uma linha** = (carga por viagem ÷ tempo de ida e volta) × número de trens. Esse valor é mostrado na UI da linha.

**Automação ferroviária (T1–T5)**

A logística de trens cresce em cinco níveis, liberados por pesquisa. Cada nível tira do jogador uma decisão manual. Toda lógica é configurada por **regras em formulário** (seletores tocáveis), sem fios nem combinadores.

| Nível | Pesquisa (era) | O que libera |
|---|---|---|
| T1 | Ferrovia (verde) | linhas fixas |
| T2 | Logística ferroviária (verde) | grupos de estação, limite de trens, depósito |
| T3 | Automação de estações (azul) | regras de estação |
| T4 | Trens inteligentes (azul) | regras de trem (interrupções) e trem genérico |
| T5 | Rede de pedidos (azul, tardia) | despachante automático. É a última grande pesquisa antes do Silo |

- **T1, linha:** uma lista de paradas, cada uma com uma condição de partida: cheio, vazio, esperar X s, cheio OU X s, ou inativo por X s (nenhuma carga ou descarga).
- **T2, grupos, limite e depósito:**
  - Estações com o mesmo nome formam um **grupo**. Uma parada de linha pode apontar para um grupo, e o trem vai para a estação do grupo com vaga e menor custo de rota.
  - Cada estação tem um **limite de trens** a caminho (padrão 1). Quando nenhuma estação do grupo tem vaga, o trem espera onde está.
  - O **Depósito** é uma estação sem carga, onde trens ociosos esperam.
- **T3, regras de estação:** até 3 regras no formato **SE** [item do buffer] [>, <, =] [valor] **ENTÃO** [ativar | desativar | limite de trens = N | limite = buffer ÷ capacidade do trem]. Uma estação desativada não recebe trens.
- **T4, regras de trem (interrupções):** uma lista priorizada de regras que interrompem a linha:
  - **SE** [carga contém X | vazio | esperando há mais de N s | destino indisponível] **ENTÃO** ir para [estação ou grupo].
  - O curinga `{item}` usa o item da carga. Exemplo: "SE carga contém {item} ENTÃO ir para 'Descarga {item}'".
  - Um único trem genérico pode atender qualquer item.
- **T5, rede de pedidos:**
  - Uma estação pode estar em modo **Fornecedor** (oferece o item quando o buffer passa do mínimo) ou **Pedido** (pede quando o buffer cai abaixo do mínimo e aceita entregas até o máximo).
  - O **despachante** roda a cada 2 s. Ele casa cada pedido com o fornecedor mais próximo que tenha pelo menos 1 lote e escolhe um trem ocioso num depósito da mesma rede. O trem recebe uma missão temporária: fornecedor → pedido → depósito.
- **Coexistência:** cada trem está em um modo, **linha** (T1 a T4) ou **despachante** (T5). Linhas fixas continuam úteis para rotas dedicadas.
- **Gargalo que escala:** com o despacho automático, o desafio passa para o layout: interchanges, depósitos e capacidade da via. Trilhos com mais vias ficam como tema pós-MVP.
- O despacho e as regras funcionam normalmente no cálculo offline, porque usam a mesma simulação.

**Energia (revisado no playtest de 2026-09-25: rede global)**
- **Rede elétrica global:** todo Gerador, mais os 3 ⚡ grátis do Núcleo, alimenta **todos** os nós do mapa. Não há malhas, e a energia não depende de arestas nem de trilhos. (Isso substitui "toda aresta conduz energia", que travava o jogo: um extrator de carvão ligado só ao Gerador nunca arrancava.)
- Produção: o Gerador queima carvão (1 carvão a cada 4 s → 10 ⚡), e o carvão chega por aresta como qualquer insumo. O Núcleo gera 3 ⚡ grátis, o que sempre permite arrancar.
- Consumo por nó em operação: Extrator 1 ⚡, Fornalha 2 ⚡, Montadora 2/3/4 ⚡ (níveis 1/2/3), Laboratório 2 ⚡, Refinaria e Planta química 4 ⚡, Silo 10 ⚡. Divisor, Mesclador, Filtro, Caixa e Estação não consomem.
- **Falta de energia:** se a demanda passa da oferta, **todos** os nós desaceleram na proporção oferta ÷ demanda, e o medidor ⚡ na barra superior fica vermelho. Como o Núcleo sempre gera 3 ⚡, a satisfação nunca chega a zero.
- Não há armazenamento de energia na v1.

### Controles e entrada

**Toque (principal)**

| Ação | Gesto |
|---|---|
| Mover câmera | arrastar com um dedo no vazio |
| Zoom | pinça. Três níveis de detalhe: visão geral, grafo e itens com ícone |
| Colocar nó | tocar em "+" (paleta) → escolher → tocar na célula. Aparece uma prévia fantasma verde ou vermelha |
| Criar aresta | arrastar a partir de um conector de saída até um de entrada. Durante o arraste, a câmera se move sozinha na borda da tela |
| Editar/remover | tocar no nó ou na aresta abre o menu contextual (receita, upgrade, remover) |
| Mover nó | arrastar o nó (sem segurar). As arestas ligadas recalculam a rota; se alguma ficar sem rota ou longa demais, o movimento é recusado |
| Traçar trilho | no modo Trilhos, arrastar de uma ponta de estação até a ponta de outra estação; a rota é automática |
| Clique manual | tocar numa jazida |

- Toda área tocável tem pelo menos 44×44 px na tela, qualquer que seja o zoom. Os conectores ganham uma área de toque ampliada.
- Desfazer: botão ↶ para as últimas 20 ações de construção.

**Desktop:** mouse com os mesmos gestos (arrastar no vazio, botão do meio ou espaço + arrastar para mover; roda para zoom). Atalhos: 1–9 para a paleta, T para alternar a camada de trilhos e Ctrl+Z para desfazer.

---

## Elementos Específicos de Simulação

### Sistemas de simulação

- **O que é simulado:** o fluxo discreto de itens por um grafo dirigido (nós de produção + arestas com vazão), mais uma rede ferroviária com trens de lote. A simulação é abstrata; não há física.
- **Tick:** a simulação lógica roda a 10 ticks/s, independente do framerate. A animação interpola entre os ticks.
- **Interconexões:** a saída de um nó alimenta arestas → a vazão limita → o nó de destino produz ou espera. Estações acoplam as duas camadas. Laboratórios e Silo são sumidouros.
- **Emergência:** cada gargalo se propaga para trás (nós bloqueados) e para frente (nós famintos). A reserva de trilhos gera filas emergentes. Todos esses estados são visíveis (Pilar 2).

### Mecânicas de gestão

- **Recursos gerenciados:** estoque global em Núcleo e Caixas (construção), pacotes de ciência (pesquisa), vazão das arestas e capacidade das linhas de trem.
- **Decisões:** onde colocar os nós no plano, como rotear sem cruzar, quando investir em aresta melhor, em mais nós ou em trem, e qual pesquisa fazer.
- **Automático vs. manual:** o manual existe só no início (clique). Tudo o que é produzido depois vem da automação.
- **Otimização:** um painel de estatísticas mostra a taxa por item (itens/min produzidos e consumidos) nos últimos 1, 10 e 60 min.

### Construção

- **Colocação:** encaixa em células. Nós não se sobrepõem entre si, nem com jazidas (exceto o Extrator) nem com água.
- **Pré-requisitos:** cada tipo de nó e cada nível de aresta e trilho é liberado por pesquisa.
- **Upgrade e demolição:** upgrade no lugar, pagando a diferença; demolição com reembolso de 100%.
- **Restrição espacial:** a regra planar mais os comprimentos máximos de aresta. Mover nós é barato para que o jogador reorganize em vez de recomeçar.

### Loops econômicos

- **Fontes:** jazidas infinitas via extratores e clique manual.
- **Sumidouros:** construção (estoque global), pesquisa (Laboratórios) e foguete (Silo). Não há moeda nem manutenção.
- **Cadeias de suprimento:** a árvore de receitas abaixo.
- **Ritmo:** controlado pelo custo das pesquisas e pela vazão das arestas, sem timers artificiais.

**Árvore de receitas (31 itens)**

| Nível | Itens |
|---|---|
| Brutos (5) | minério de ferro, minério de cobre, carvão, pedra, petróleo |
| Fundição (4) | placa de ferro, placa de cobre, tijolo, aço (5 placas de ferro) |
| Básicos (5) | engrenagem, fio de cobre, circuito, cano, trilho |
| Petróleo (6) | gás, plástico, enxofre, ácido sulfúrico, lubrificante, combustível sólido |
| Avançados (7) | bateria, circuito avançado, motor, motor elétrico, unidade de processamento, estrutura leve, combustível de foguete |
| Ciência (3) | ciência vermelha, ciência verde, ciência azul |
| Foguete (1) | parte de foguete (estrutura leve + unidade de processamento + combustível de foguete) |

As quantidades de cada receita copiam as do Factorio base por enquanto, adaptadas aos 31 itens (placeholder); o balanceamento próprio vem com o playtest ([NOTE FOR DESIGNER]).

### Progressão e desbloqueios

- **Árvore de pesquisa:** cerca de 20 tecnologias em 3 eras.
  - *Início (sem pesquisa):* Extrator, Fornalha, Gerador, Caixa, Montadora 1, Laboratório.
  - *Era vermelha:* Divisor e Mesclador, aresta 2, Ferramentas, Caixas extras, Expansão 1.
  - *Era verde:* **Ferrovia** (trilho, estação, locomotiva; T1), **Logística ferroviária** (T2), Montadora 2, Filtro, conectores extras, Expansão 2 e petróleo, teto offline +4 h.
  - *Era azul:* **Automação de estações** (T3), **Trens inteligentes** (T4), **Rede de pedidos** (T5, tardia), Ponte, Painel solar, aresta 3, Montadora 3, vagões extras, Expansão 3, Silo, cadeia avançada, teto offline +12 h.
- **Custo:** de 10 a 1.000 pacotes por tecnologia, crescendo cerca de 1,6× por tecnologia dentro de cada era.
- **Endgame:** o Silo e o lançamento. Depois dele vem o modo livre: a meta passa a ser foguetes por hora, com recorde por seed, e o prestígio (stretch) oferece um mapa novo.
- **Limites de emergência:** os estados emergentes previstos são gargalo (nó bloqueado ou faminto), estoque cheio (Caixas lotadas bloqueiam tudo a montante) e impasse de trens. Os três são sempre visíveis e têm um destaque na UI; nenhum destrói itens ou estruturas.
- **Save-scum:** não se aplica. Não há aleatoriedade depois da geração do mapa, nem perda ou derrota.

### Sandbox vs. cenário

- **v1:** um único modo, campanha livre com seed aleatória (ou informada), cuja meta é o foguete.
- **Stretch:** prestígio (ver Idle). Um sandbox sem custos fica fora de escopo.

---

## Elementos Específicos de Idle/Incremental

### Interação principal (clique)

- Tocar numa jazida gera 1 item (2 e 4 com Ferramentas).
- **Feedback:** o item voa até o Núcleo, com pop visual e som "tic" de tom variável.
- Não há combo nem streak.
- O clique deixa de ser útil naturalmente quando um extrator produz mais do que o jogador consegue tocar (cerca de 0,5 item/s por extrator), por volta do minuto 3.

### Upgrades

Não há upgrades de "multiplicador" genéricos. Todo upgrade é físico e espacial: nível de aresta, nível de Montadora, número de conectores, número de vagões e tetos offline. Assim o Pilar 1 continua relevante. Os custos estão na árvore de pesquisa.

### Automação

- A progressão de automação é clique → extrator → cadeia automática → trens.
- **Offline:** ao voltar, o jogo roda a própria simulação em avanço rápido até a produção se estabilizar e extrapola essas taxas para o resto do tempo ausente (detalhes na arquitetura). Trens e regras funcionam normalmente nesse cálculo.
  - O teto é de 8 h na base, 12 h com a pesquisa verde e 24 h com a azul.
  - A eficiência offline é de 100% dentro do teto.
  - Pesquisas não avançam offline, por decisão de design: a escolha da próxima pesquisa é um momento de sessão. Offline, os Laboratórios não consomem; os pacotes de ciência se acumulam nas arestas e buffers até bloquear, como qualquer nó parado.
- **Tela de retorno:** mostra "Enquanto você esteve fora", com os itens produzidos e o principal gargalo, e o toque leva até ele.

### Prestígio (stretch goal)

- Depois do lançamento, o jogador pode "fundar uma nova colônia": um mapa novo (outra seed) e o progresso zerado.
- A moeda de prestígio é "Patentes", ganhas por foguetes lançados e pelo tempo de lançamento.
- Os bônus permanentes são pequenos e espaciais: começar com pesquisa X, +1 conector inicial nos extratores, +1 vagão inicial por trem.
- Fora do MVP e da v1.0 se o prazo apertar.

### Balanceamento numérico

- A economia é **linear e composta** (cadeias multiplicam a necessidade), não exponencial no estilo cookie clicker. Os números ficam na casa das unidades aos milhares; usar a notação K e M basta.
- **Metas de ritmo** (sessão ativa):

| Marco | Alvo |
|---|---|
| 1º extrator automático | ≤ 2 min |
| 1ª ciência vermelha automatizada | ≤ 15 min |
| 1º trem rodando | 25–45 min no MVP (45–75 min no jogo completo) |
| Petróleo | cerca de 3 h |
| Foguete | 8–12 h ativas (cerca de 4–7 dias com idle) |

- **Paredes:** a transição entre eras exige reorganizar o espaço, e o trem (era verde) é a principal "quebra de parede".

### Meta-progressão

- Conquistas: marcos da tabela acima, "foguete em < X h" e "nenhuma aresta nível 1".
- Estatística de melhor tempo por seed.
- Temporadas e modos alternativos ficam fora de escopo.

---

## Progressão e Balanceamento

### Progressão do jogador

A progressão é de conhecimento e de fábrica, não de personagem. Ela está nos desbloqueios de pesquisa (acima) e no tamanho do mapa: 48² → 72² → 96² → 120² células.

### Curva de dificuldade

A dificuldade vem da **complexidade das receitas** (número de insumos) e da **densidade espacial**:
- *Era vermelha:* cadeias de 1–2 insumos, tudo perto do Núcleo.
- *Era verde:* insumos distantes forçam os trens.
- *Era azul:* receitas de 3 insumos em cadeias de 4–5 níveis exigem polos especializados ligados por ferrovia.

### Economia e recursos

Ver Loops econômicos. Não há moeda. **O Núcleo tem capacidade infinita** (playtest 2026-09-25): acumular sem fim é o prazer natural de um idle/clicker, e um Núcleo cheio travava o jogo. As Caixas continuam com 500 itens e servem de buffer local. Os números crescem sem limite: notação K, M, B, T e depois aa, ab… e contagens sem perder precisão.

---

## Estrutura de Mapa

### Tipos de área

- **Área inicial:** 48×48 células, sempre com ferro, cobre, carvão e pedra a até 15 células do Núcleo. A seed é garantida jogável.
- **Expansões:** as bordas se abrem em anéis. Jazidas mais distantes são maiores (5×5 a 6×6), e os lagos criam corredores.
- **Petróleo:** só a partir do anel 2, a pelo menos 40 células do Núcleo, o que força trem.

### Progressão do mapa

A geração garante a distância de cada recurso-chave por anel. Isso transforma "trem é a recompensa" (Pilar 3) numa necessidade garantida, não opcional.

---

## Direção de Arte e Áudio

### Arte

- **Estilo editor de nós (issue #7; substitui o blueprint):** a fábrica parece um editor de visual script, no estilo do GraphEdit do Godot. O fundo é ardósia escura (`#1b1f27`) com grade discreta, e a água aparece em azul-petróleo arredondado.
- **Nós:** fichas arredondadas (`#2b303c`) com sombra suave e **cabeçalho colorido por categoria** (Núcleo dourado, extração âmbar, fundição coral, montagem azul, energia lilás, armazenamento verde). A ficha mostra o nome no cabeçalho e o ícone da receita no corpo. **Estados** aparecem como pílula e contorno: vermelho para bloqueado e faminto, amarelo para sem energia. Conectores de entrada são círculos vazados; os de saída, pontos âmbar.
- **Arestas:** traço semitransparente na cor do item principal, com itens animados. No zoom **médio** os itens são pontos coloridos; no **perto**, ícones com cor e forma; no **longe**, a aresta vira um traço tracejado com a mistura de cores dos itens.
- **HUD:** cápsula flutuante no topo (estoque com pastilha de cor, barras de ⚡ e de fôlego) e paleta de nós numa bandeja inferior rolável, com a cor da categoria.
- **Trilhos:** traço duplo com dormentes, em cor distinta (âmbar). Os trens são retângulos estilizados.
- Paleta de itens com cerca de 31 cores e ícones distinguíveis também por daltônicos: cada item combina cor e forma do ícone.

### Áudio

- Ambiente calmo e minimalista (lo-fi/eletrônico suave).
- SFX: tic de produção (tom por item, com volume agregado), clique de conexão, apito e rolamento do trem, e jingle de pesquisa concluída.
- Mudo por padrão até a primeira interação (política dos navegadores).

---

## Especificações Técnicas

### Desempenho

- 60 FPS com 1.000 itens animados visíveis e 20 trens num Android intermediário de referência (ex.: Samsung Galaxy A52, 2021) no Chrome atual e num iPhone 11 no Safari atual; uso de memória ≤ 300 MB, medido durante 10 min de jogo na era azul.
- Mínimo aceitável: 30 FPS no mesmo cenário.
- Carregamento inicial ≤ 5 MB transferidos e interativo em ≤ 3 s em 4G.
- A simulação suporta 500 nós, 1.000 arestas e 20 trens sem queda no tick de 10/s.
- O cálculo offline de 24 h leva ≤ 1 s.

### Plataforma

- Navegadores Chrome/Android e Safari/iOS atuais, em retrato e paisagem. Desktop: Chrome, Firefox e Safari.
- Salvamento automático local a cada 30 s e ao sair da aba. Exportar e importar o save como texto.
- Publicado no **itch.io** como HTML5 (página pública), atualizado a cada push no `main`. Sem PWA (o itch não suporta). Exportar e importar o save protege contra o Safari do iOS apagar o armazenamento; no iOS dentro do itch, o jogo sugere exportar.
- Tecnologia: TypeScript + PixiJS (renderização WebGL), com a simulação separada da renderização. A arquitetura detalhada fica em `gds-game-architecture`. Engines completas (Godot, Unity) e bibliotecas de diagrama (DOM/SVG) foram descartadas por peso e desempenho.

### Assets

- Cerca de 31 ícones de item, cerca de 12 ícones de nó, cerca de 8 elementos de trilho e trem, UI.
- Tudo vetorial ou em spritesheet única.
- Áudio: 1–2 faixas ambientes, cerca de 15 SFX.

---

## Épicos de Desenvolvimento

Detalhes e stories de alto nível em `epics.md`.

| # | Épico | Entrega | MVP |
|---|---|---|---|
| E1 | Mapa e grafo | mapa procedural, câmera, nós, arestas, regra planar, controles de toque | ✅ |
| E2 | Fluxo e produção | simulação, vazão, animação, fornalha, montadora, Núcleo, Caixas, estoque global, receitas da era vermelha | ✅ |
| E3 | Clique e automação inicial | clique manual, extrator, custo de construção | ✅ |
| E4 | Pesquisa e progressão | laboratório, árvore de pesquisa, expansões de mapa | mínimo (Lab + 5 pesquisas) |
| E5 | Ferrovia | camada de trilhos, estação, trem, linhas, reserva, cruzamento, interchange, automação T1–T5 | básico (T1) |
| E6 | Idle e persistência | save, offline com teto, tela de retorno | básico |
| E7 | Cadeia completa e foguete | petróleo, avançados, ciência azul, Silo, lançamento | — |
| E8 | Polimento | arte final no estilo editor de nós, áudio, estatísticas, onboarding, conquistas | — |
| E9 | Prestígio (stretch) | nova colônia e Patentes | — |

**Sequência:** E1 → E2 → E3 → E6 (básico) → E4 (mínimo) → E5 (básico) → **MVP** → E4 (completo) → E5 (completo) → E7 → E8 → E9.

**Meta do MVP (resolvido na issue #5):** o MVP não tem meta de vitória; a única meta do jogo completo é o foguete. A seed do MVP tem ferro, pedra e carvão perto do Núcleo, um **cobre pequeno** (3×3, uma vaga de extrator, 0,5 item/s) perto da base e um **cobre grande** atrás de um **corredor de terra entre lagos** com 1 célula de largura (menor que qualquer nó, então não cabe Caixa-relé) e ≥ 16 células de comprimento. Com 1 célula de largura, só cabe uma aresta, e pela regra de distância uma aresta de ~42 células até o cobre grande leva no máximo 0,5 item/s (nível 2); o trem é o único jeito de chegar a 0,85/s. Pesquisas do MVP, pagas com ciência vermelha: Divisor e Mesclador 10, Ferramentas 10, Caixas extras 20, Aresta 2 30, Ferrovia 50 (120 no total; Ferrovia por volta de 30 min) e, depois da Ferrovia, **Protótipo final** com 1.000 (~20 min), que exige ~0,85 placa de cobre/s, acima do cobre pequeno: o trem se torna necessário pela vazão. Ao concluir o Protótipo final, um aviso informa "fim do conteúdo do protótipo" e o jogo segue aberto. **Mapa do MVP (issue #6):** o terreno é gerado pela seed `mvp-1`, e um **cenário** carimba por cima o layout fixo. O Núcleo (3×3) fica em (60,60). Ferro (5×5), pedra (4×4) e carvão (4×4) ficam a ~7–8 células, e o cobre pequeno (3×3) a ~10. Nas colunas x 76–95 há água em toda a altura revelada, exceto um corredor de terra em y=60 (1×20). O cobre grande (6×6) ocupa x 100–105, y 57–62, a ~43 células. A área de 96² fica revelada desde o início, e o MVP não tem pesquisa de expansão. O cenário limpa a água da base e da rota do trilho.

---

## Métricas de Sucesso

### Técnicas

- As metas de desempenho acima, medidas em aparelho real.
- Zero perda de save em 50 ciclos de fechar e reabrir a aba.

### Gameplay (playtest pessoal + 3–5 amigos)

- Tempo até o 1º extrator ≤ 2 min, sem ajuda.
- ≥ 4 de 5 testadores dizem que o trem foi o momento mais divertido do MVP.
- ≥ 3 de 5 voltam espontaneamente no dia seguinte.
- Tentativas de aresta inválida por minuto caem com o tempo, sinal de que a regra planar é aprendida e não frustra.

---

## Fora de Escopo (v1.0)

- Pontes e túneis para arestas (decisão de design: a regra planar é absoluta).
- Inventário do jogador e arrastar itens manualmente.
- Combustível de trem.

- Combate, inimigos, poluição.
- Postes, fios e rede elétrica separada: a energia viaja pelas arestas e trilhos que já existem.
- Sinais ferroviários manuais.
- Multiplayer, nuvem, contas.
- Sandbox sem custos e editor de cenários.
- Monetização.
- Módulos e beacons.
- **Pós-MVP (a avaliar):** trilhos com mais vias (3 ou mais) e barramentos de arestas estilo "bus" do Factorio (várias arestas paralelas agrupadas).
- **Adiado (pós-v1):** prestígio (se não couber), fluidos como sistema separado (o petróleo é tratado como item) e várias locomotivas por trem.

---

## Premissas e Dependências

- Desenvolvedor solo com agentes de IA. A tecnologia é decidida na arquitetura.
- Navegadores mobile atuais suportam a renderização de cerca de 1.000 sprites animados a 60 FPS (a validar no protótipo do E1/E2).

**Índice de [ASSUMPTION] e [NOTE FOR DESIGNER]**
1. [NOTE FOR DESIGNER] Impasse residual em ciclos de junções e estações: confirmar no protótipo do E5 se o destaque basta.
2. [NOTE FOR DESIGNER] Receitas copiadas do Factorio como placeholder; balanceamento próprio e custos dos nós avançados depois do playtest.
