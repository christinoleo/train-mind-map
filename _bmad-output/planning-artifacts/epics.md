---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/gdds/gdd-train-mind-map-2026-09-24/gdd.md
  - _bmad-output/planning-artifacts/gdds/gdd-train-mind-map-2026-09-24/epics.md
  - _bmad-output/planning-artifacts/gdds/gdd-train-mind-map-2026-09-24/decision-log.md
  - _bmad-output/planning-artifacts/game-architecture.md
---

# train-mind-map - Epic Breakdown

## Overview

Este documento traz a divisão completa em épicos e stories do train-mind-map. Ele decompõe os requisitos do GDD (v1.4), de um documento de UX (se existir) e da arquitetura em stories implementáveis.

> **Legenda:** `[MVP]` marca os requisitos que fazem parte do MVP definido no GDD 1.5 (seção "Meta do MVP").

## Requirements Inventory

### Functional Requirements

#### Mapa e geração

- **FR1** [MVP] O mapa é uma grade 2D de células. Nós e dobras de aresta encaixam sempre em células inteiras.
- **FR2** [MVP] O mapa é gerado de forma determinística a partir de uma seed (texto): a mesma seed gera sempre o mesmo mapa. O jogador pode informar a seed ou usar uma aleatória.
- **FR3** [MVP] O mapa completo de 120×120 células é gerado no início; a área revelada inicial é de 48×48 células ao redor do Núcleo.
- **FR4** Cada pesquisa de expansão revela um anel de +12 células por lado: Expansão 1 → 72², Expansão 2 → 96², Expansão 3 → 120².
- **FR5** [MVP] As jazidas são infinitas e ocupam de 3×3 a 6×6 células; jazidas dos anéis externos são maiores (5×5 a 6×6).
- **FR6** [MVP] Existem 5 recursos brutos: minério de ferro, minério de cobre, carvão, pedra e petróleo.
- **FR7** [MVP] A área inicial tem sempre ferro, cobre, carvão e pedra a ≤ 15 células do Núcleo. A garantia é verificada depois da geração; se falhar, o gerador tenta de novo com a sub-seed seguinte.
- **FR8** O petróleo só aparece do anel 2 em diante e a ≥ 40 células do Núcleo.
- **FR9** [MVP] Na seed fixa do MVP: ferro, pedra e carvão perto do Núcleo; um cobre pequeno 3×3 (uma vaga de extrator) perto da base; um cobre grande atrás de um corredor de terra entre lagos com 1 célula de largura e ≥ 16 células de comprimento, que só o trilho atravessa. Layout exato em GDD 1.6 (\"Mapa do MVP\"): seed `mvp-1` + cenário carimbado, 96² revelado desde o início.
- **FR10** [MVP] Lagos (água) bloqueiam nós e arestas; trilhos só atravessam água com Ponte. Nas expansões, os lagos formam corredores.
- **FR11** [MVP] O Núcleo começa colocado no mapa.

#### Câmera

- **FR12** [MVP] Arrastar com um dedo no vazio move a câmera.
- **FR13** [MVP] Pinça faz zoom, com 3 níveis de detalhe: visão geral (arestas como traço colorido pela mistura de itens, sem partículas), grafo (itens como pontos) e itens com ícone.
- **FR14** [MVP] Durante o arraste de uma aresta (ou trilho), a câmera rola sozinha quando o dedo chega à borda da tela.

#### Nós: regras gerais e colocação

- **FR15** [MVP] Todo nó tem conectores de entrada à esquerda e de saída à direita e ocupa de 2×2 a 3×3 células.
- **FR16** [MVP] Colocar nó: tocar em "+" (paleta) → escolher o tipo → tocar na célula. Uma prévia fantasma fica verde (válido) ou vermelha (inválido).
- **FR17** [MVP] Nós não se sobrepõem entre si, nem com água, nem com jazidas (exceto o Extrator, que precisa ficar sobre uma jazida).
- **FR18** [MVP] Cada tipo de nó e cada nível de aresta e de trilho só pode ser construído depois de liberado por pesquisa, exceto os nós iniciais (Extrator, Fornalha, Gerador, Caixa, Montadora 1, Laboratório).
- **FR19** [MVP] Tocar num nó abre o menu contextual (receita, upgrade, remover e opções específicas do tipo).
- **FR20** [MVP] Mover nó: segurar 500 ms sobre o nó e arrastar. As arestas ligadas recalculam a rota; se alguma ficar sem rota ou longa demais, o movimento é recusado.
- **FR21** [MVP] Remover um nó devolve 100% do custo de construção ao estoque global; os itens que estavam dentro dele (buffers) são perdidos. O Núcleo é indestrutível.
- **FR22** [MVP] O upgrade de um nó (ex.: nível de Montadora) é feito no lugar, pagando a diferença de custo.
- **FR23** [MVP] Um nó com a saída cheia fica no estado "bloqueado" e um nó sem insumo fica "faminto"; o ícone do nó mostra o estado.
- **FR24** [MVP] Cada conector de entrada tem buffer de 2× a quantidade que a receita pede daquele insumo. Um item só entra se houver receita ativa que o consuma e espaço no buffer; senão, a aresta para.
- **FR25** [MVP] Os insumos entram por qualquer conector de entrada (não há conector reservado por ingrediente); o buffer de entrada é por tipo de item.
- **FR26** [MVP] O buffer de saída de um nó de produção comporta 1 lote da receita; cheio, o nó fica "bloqueado".
- **FR27** [MVP] A receita de uma Montadora ou Planta química é escolhida ao colocar o nó e pode ser trocada tocando nele; trocar a receita perde os itens dentro do nó.

#### Nós: tipos

- **FR28** [MVP] **Núcleo:** caixa inicial especial, destino do clique, indestrutível, 4 entradas / 2 saídas, capacidade de 2.000 itens; gera 3 ⚡ grátis.
- **FR29** [MVP] **Caixa:** buffer ou armazém de 500 itens de tipos misturados, 2 entradas / 2 saídas; conta no estoque global. Uma Caixa com saída entrega em ordem de chegada (FIFO); cheia, bloqueia as arestas de entrada.
- **FR30** [MVP] **Extrator:** produz o recurso da jazida sob ele, 1 item a cada 2 s (0,5 item/s); 0 entradas / 1 saída (2 e 3 saídas via pesquisa de conectores extras).
- **FR31** [MVP] **Fornalha:** fundição, 2 entradas / 1 saída, receitas de 2 a 5 s.
- **FR32** [MVP] **Gerador:** 1 entrada / 0 saídas; queima 1 carvão a cada 4 s e gera 10 ⚡ (depois também combustível sólido).
- **FR33** **Painel solar:** 0 / 0 conectores, gera 3 ⚡ sem combustível (era azul).
- **FR34** [MVP] **Montadora (níveis 1–3):** 3 entradas / 1 saída; velocidade 0,5× / 0,75× / 1,25× aplicada aos tempos-base das receitas. (Nível 1 é MVP; níveis 2 e 3 via pesquisa.)
- **FR35** **Refinaria:** 1 entrada / 3 saídas; petróleo → produtos, 5 s por ciclo.
- **FR36** **Planta química:** 3 entradas / 1 saída, receitas de 2 a 5 s.
- **FR37** [MVP] **Divisor:** 1 entrada / até 3 saídas, instantâneo, rodízio entre as saídas; uma saída bloqueada é pulada; com todas bloqueadas, o Divisor fica "bloqueado".
- **FR38** [MVP] **Mesclador:** até 3 entradas / 1 saída, instantâneo, rodízio justo entre as entradas que têm item disponível.
- **FR39** **Filtro:** 1 entrada / 2 saídas, instantâneo; o item X configurado vai para a saída A e o resto para a B; se a saída de destino estiver bloqueada, o Filtro bloqueia.
- **FR40** [MVP] **Laboratório:** 3 entradas / 0 saídas; consome 1 pacote de ciência a cada 5 s para a pesquisa ativa.
- **FR41** [MVP] **Estação:** nó nas duas camadas, 3 entradas / 3 saídas (ver Trens).
- **FR42** **Silo:** 3 entradas / 0 saídas; recebe partes de foguete; 50 partes disparam o lançamento.

#### Custos de construção e receitas

- **FR43** [MVP] Custos de construção: Extrator = 10 minério de ferro + 5 pedra; Fornalha = 10 pedra; Gerador = 10 pedra + 10 minério de ferro; Caixa = 10 minério de ferro; Montadora 1 = 20 placas de ferro + 10 placas de cobre; Laboratório = 20 placas de ferro + 10 placas de cobre + 10 tijolos; Divisor / Mesclador / Filtro = 5 placas de ferro + 2 engrenagens; Estação = 20 placas de ferro + 10 tijolos; Locomotiva = 20 placas de ferro + 20 engrenagens + 10 circuitos; Vagão = 20 placas de ferro + 10 engrenagens.
- **FR44** [MVP] Aresta custa por célula de comprimento: nível 1 = 1 minério de ferro; nível 2 = + 1 engrenagem; nível 3 = + 1 circuito.
- **FR45** [MVP] Trilho custa 1 item "trilho" por célula; receita do trilho: 1 placa de ferro + 1 pedra → 2 trilhos.
- **FR46** Nós avançados (Montadora 2 e 3, Refinaria, Planta química, Silo) custam itens processados da era correspondente, com valores na planilha de balanceamento.
- **FR47** [MVP] Não existe fabricação manual: todo item processado sai de um nó. A cadeia de partida funciona sem crafting: clique → Extrator e Fornalha → placas → Montadora 1 → engrenagem → ciência vermelha → Laboratório.
- **FR48** O jogo tem 31 itens: brutos (5), fundição (placa de ferro, placa de cobre, tijolo, aço = 5 placas de ferro), básicos (engrenagem, fio de cobre, circuito, cano, trilho), petróleo (gás, plástico, enxofre, ácido sulfúrico, lubrificante, combustível sólido), avançados (bateria, circuito avançado, motor, motor elétrico, unidade de processamento, estrutura leve, combustível de foguete), ciência (vermelha, verde, azul) e parte de foguete (estrutura leve + unidade de processamento + combustível de foguete).
- **FR49** [MVP] Receitas da era vermelha: ferro, cobre, carvão e pedra → placa de ferro, placa de cobre, tijolo, engrenagem, fio de cobre, circuito, trilho e ciência vermelha. Quantidades copiadas do Factorio base como placeholder.
- **FR50** [MVP] Tempos-base das receitas (velocidade 1,0×): engrenagem 1 s, fio 0,5 s, circuito 1 s, ciência vermelha 5 s, ciência verde 6 s, ciência azul 12 s; demais na planilha. As Montadoras multiplicam esses tempos pela velocidade do nível.

#### Arestas

- **FR51** [MVP] Criar aresta: arrastar de um conector de saída até um conector de entrada. Arrastar a partir do vazio move a câmera em vez de criar aresta.
- **FR52** [MVP] A rota da aresta é automática: o menor caminho ortogonal na grade, desviando de nós, água e arestas, com desempate determinístico. O jogador não coloca dobras; para mudar, remove e recria ou move nós (issue #2).
- **FR53** [MVP] **Regra planar:** a aresta não cruza outra aresta, não atravessa nó e não atravessa água. Durante o arraste, um traçado inválido fica vermelho (com o motivo), e soltar sobre ele não cria nada. Não há ponte nem túnel para arestas.
- **FR54** [MVP] Comprimento máximo: 12 células (nível 1), 20 (nível 2) e 32 (nível 3). O comprimento é a soma dos comprimentos dos segmentos da polilinha, em células, arredondada para cima; é o mesmo valor usado no custo.
- **FR55** [MVP] Vazão: 2 itens/s (nível 1), 4 (nível 2) e 8 (nível 3). A velocidade visual dos itens é de 3 células/s; o espaçamento mínimo entre itens é velocidade ÷ vazão.
- **FR56** [MVP] Uma aresta transporta vários tipos de item ao mesmo tempo, dividindo a vazão total.
- **FR57** [MVP] Se o nó de destino não aceita o item, a fila da aresta para e a aresta fica "cheia".
- **FR58** [MVP] Uma aresta existente pode receber upgrade de nível no lugar, pagando a diferença de custo.
- **FR59** [MVP] Tocar numa aresta abre o menu contextual (upgrade, remover). Remover uma aresta reembolsa 100% do custo e perde os itens em trânsito.
- **FR60** [MVP] Arestas conduzem energia (ver Energia).

#### Energia

- **FR61** [MVP] Não há rede elétrica separada, postes nem fios. Cada componente conexo de nós ligados por arestas forma uma **malha**, e todo gerador da malha alimenta todos os nós dela.
- **FR62** Trilhos também conduzem energia: uma Estação une a malha dela às malhas das outras Estações da mesma rede ferroviária.
- **FR63** [MVP] Consumo por nó em operação: Extrator 1 ⚡, Fornalha 2 ⚡, Montadora 2 / 3 / 4 ⚡ (níveis 1 / 2 / 3), Laboratório 2 ⚡, Refinaria e Planta química 4 ⚡, Silo 10 ⚡. Divisor, Mesclador, Filtro, Caixa e Estação não consomem.
- **FR64** [MVP] Satisfação por malha = min(1, oferta ÷ demanda); todos os nós da malha desaceleram nessa proporção. Nada para de vez, a não ser com oferta zero. A demanda conta só os nós que não estão famintos nem bloqueados.
- **FR65** [MVP] Com falta de energia, as arestas da malha brilham mais fraco e o medidor de ⚡ na barra superior fica vermelho.
- **FR66** [MVP] Não há armazenamento de energia na v1.
- **FR67** [MVP] O carvão chega ao Gerador por aresta como qualquer insumo; os 3 ⚡ do Núcleo bastam para os 2 ou 3 primeiros extratores.

#### Estoque global

- **FR68** [MVP] Tudo o que está no Núcleo e nas Caixas soma no **estoque global**, mostrado na barra superior. O jogador nunca carrega nem arrasta itens.
- **FR69** [MVP] Construir debita o estoque global automaticamente. Sem estoque suficiente, a construção é recusada com motivo ("sem estoque").
- **FR70** [MVP] Ordem de débito: primeiro Caixas sem aresta de saída (armazéns), depois Caixas com saída (buffers), sempre da mais próxima do local da obra.
- **FR71** [MVP] Cada Caixa tem a opção "não usar em construção", que exclui a Caixa do débito.
- **FR72** [MVP] Os itens voam da caixa até a obra numa animação de 0,6 s; o transporte é instantâneo na simulação.
- **FR73** [MVP] Quando Núcleo e Caixas enchem, as arestas de entrada bloqueiam e a fábrica para a montante (estado visível, nada é destruído).

#### Clique manual (fôlego)

- **FR74** [MVP] Tocar numa jazida de ferro, cobre, carvão ou pedra gera 1 item desse recurso, que voa até o Núcleo em 0,4 s, com pop visual e som "tic" de tom variável. Não há clique em petróleo.
- **FR75** [MVP] **Fôlego:** cada toque gasta 1 ponto de uma barra de 20; a barra recarrega 1 ponto a cada 3 s (0,33 toque/s sustentado). Sem fôlego, o toque não gera item.
- **FR76** [MVP] A pesquisa "Ferramentas" eleva o valor do toque para 2 e depois 4 itens.
- **FR77** [MVP] Não há combo nem streak.

#### Trens: trilhos e interconexões

- **FR78** [MVP] A camada de trilhos é independente. Um botão (e a tecla T) alterna a camada em foco; a camada fora de foco fica esmaecida (alpha 0,3).
- **FR79** [MVP] No modo Trilhos, arrastar a partir de uma Estação ou de um trilho existente traça trilho célula a célula, com curvas de 45° e 90°.
- **FR80** [MVP] Todo trilho é via dupla: uma faixa de ida e uma de volta. Trens em sentidos opostos nunca disputam o mesmo trecho.
- **FR81** [MVP] Trilhos passam por cima de arestas. Trilho não atravessa nó, exceto a Estação, nem água sem Ponte.
- **FR82** Traçar um trilho atravessando outro cria automaticamente um cruzamento X. Tocar na interseção alterna entre X (trens seguem reto) e interchange (trens podem trocar de faixa em qualquer direção), e a troca reconstrói o grafo de rotas.
- **FR83** Junção (Y): um trilho se divide em dois e o trem escolhe o caminho pela rota.
- **FR84** Ponte (liberada por pesquisa, era azul): passa sobre água ou sobre outro trilho em nível separado, sem criar interconexão.
- **FR85** [MVP] A rede é dividida em segmentos entre pontos de interconexão (X, Y, Estação). A rota até a próxima parada é calculada por A* sobre o grafo de segmentos.

#### Trens: reserva, movimento e estações

- **FR86** [MVP] **Reserva automática (sem sinais manuais):** antes de entrar num segmento, cruzamento ou junção, o trem reserva a cadeia de segmentos até o próximo ponto onde pode parar; se estiver reservada, ele espera no fim do segmento atual. Um cruzamento X é recurso exclusivo das faixas que se cruzam. Colisões são impossíveis.
- **FR87** Impasse residual (ciclo de trens esperando uns pelos outros em junções ou estações lotadas) é detectado por um grafo de espera; os trens e o trecho envolvidos são destacados na UI.
- **FR88** [MVP] Trem = 1 locomotiva + 1 a 4 vagões (2 no MVP; mais vagões via pesquisa "vagões extras"). Trens não consomem combustível.
- **FR89** [MVP] Cada vagão leva 50 itens de um único tipo: assume o tipo do primeiro item carregado e só é liberado quando esvazia.
- **FR90** [MVP] Velocidade máxima de 8 células/s, aceleração de 0 a 8 células/s em 3 s e frenagem de 8 células/s², que define o ponto de parada antes de um segmento não reservado.
- **FR91** [MVP] Cada vagão e a locomotiva ocupam 1 célula. Um segmento só é destino de parada se o comprimento dele for ≥ o comprimento do trem. A plataforma da Estação ocupa 1 célula por veículo do maior trem.
- **FR92** [MVP] Estação: arestas de entrada carregam o trem e arestas de saída descarregam. O buffer da Estação é 2× a capacidade do maior trem que para nela.
- **FR93** [MVP] O trem carrega e descarrega a 50 itens/s por vagão (placeholder) até cumprir a condição de partida.
- **FR94** [MVP] Estados do trem: carregando, partindo, em movimento, esperando reserva, descarregando.

#### Automação ferroviária (T1–T5)

- **FR95** [MVP] **T1 – linha fixa** (pesquisa Ferrovia: era verde no jogo completo, ciência vermelha no MVP; libera trilho, Estação e Locomotiva): a linha é uma lista ordenada de paradas.
- **FR96** [MVP] Cada parada tem uma condição de partida: "cheio", "vazio", "esperar X s", "cheio OU X s" ou "inativo por X s" (nenhuma carga ou descarga nesse tempo).
- **FR97** [MVP] A UI da linha mostra a vazão efetiva = (carga por viagem ÷ tempo de ida e volta) × número de trens.
- **FR98** Várias linhas e vários trens por linha podem coexistir na mesma rede.
- **FR99** **T2 – Logística ferroviária** (era verde): Estações com o mesmo nome formam um grupo; uma parada pode apontar para um grupo, e o trem vai para a Estação do grupo com vaga e menor custo de rota.
- **FR100** T2: cada Estação tem um limite de trens a caminho (padrão 1). Sem vaga em nenhuma Estação do grupo, o trem espera onde está.
- **FR101** T2: o Depósito é uma Estação sem carga onde trens ociosos esperam.
- **FR102** **T3 – Automação de estações** (era azul): até 3 regras por Estação no formato SE [item do buffer] [>, <, =] [valor] ENTÃO [ativar | desativar | limite de trens = N | limite = buffer ÷ capacidade do trem]. Estação desativada não recebe trens. As regras são avaliadas uma vez por segundo simulado.
- **FR103** **T4 – Trens inteligentes** (era azul): lista priorizada de regras de interrupção por trem: SE [carga contém X | vazio | esperando há mais de N s | destino indisponível] ENTÃO ir para [Estação ou grupo]. Avaliadas quando o trem parte ou fica bloqueado.
- **FR104** T4: o curinga `{item}` usa o item da carga (ex.: "SE carga contém {item} ENTÃO ir para 'Descarga {item}'"), permitindo um trem genérico que atende qualquer item.
- **FR105** **T5 – Rede de pedidos** (azul, tardia; última grande pesquisa antes do Silo): uma Estação pode estar em modo Fornecedor (oferece o item quando o buffer passa do mínimo) ou Pedido (pede quando o buffer cai abaixo do mínimo e aceita entregas até o máximo).
- **FR106** T5: o despachante roda a cada 2 s simulados, em ordem determinística (IDs crescentes). Casa cada pedido com o fornecedor mais próximo que tenha ≥ 1 lote e escolhe um trem ocioso num depósito da mesma rede; o trem recebe a missão temporária fornecedor → pedido → depósito.
- **FR107** Cada trem está em um modo: linha (T1–T4) ou despachante (T5). Os dois modos coexistem na mesma rede.
- **FR108** Toda lógica ferroviária é editada em formulário com seletores tocáveis (`RulesEditor`); não há fios, combinadores nem camada de circuitos.

#### Pesquisa e progressão

- **FR109** [MVP] O Laboratório consome pacotes de ciência para avançar a pesquisa ativa; o jogador escolhe a próxima pesquisa numa tela de pesquisa.
- **FR110** [MVP] Pesquisas do MVP, pagas com ciência vermelha: Divisor e Mesclador 10, Ferramentas 10, Caixas extras 20, Aresta 2 30, Ferrovia 50 e, depois da Ferrovia, Protótipo final 1.000. Não há meta de vitória no MVP: ao concluir o Protótipo final, um aviso informa "fim do conteúdo do protótipo" e o jogo segue aberto.
- **FR111** A árvore completa tem cerca de 20 tecnologias em 3 eras, com fila de pesquisa. Custo de 10 a 1.000 pacotes por tecnologia, crescendo ~1,6× por tecnologia dentro de cada era.
- **FR112** Era vermelha: Divisor e Mesclador, Aresta 2, Ferramentas, Caixas extras, Expansão 1.
- **FR113** Era verde: Ferrovia (T1), Logística ferroviária (T2), Montadora 2, Filtro, conectores extras, Expansão 2 e petróleo, teto offline +4 h (→ 12 h).
- **FR114** Era azul: Automação de estações (T3), Trens inteligentes (T4), Rede de pedidos (T5), Ponte, Painel solar, Aresta 3, Montadora 3, vagões extras, Expansão 3, Silo, cadeia avançada, teto offline +12 h (→ 24 h).
- **FR115** Não há upgrades de multiplicador genéricos: todo upgrade é físico ou espacial (nível de aresta, nível de Montadora, conectores, vagões, tetos offline).
- **FR116** [MVP] Concluir uma pesquisa emite o evento de pesquisa concluída, com jingle e liberação imediata do conteúdo.

#### Foguete e endgame

- **FR117** Vitória: entregar 50 partes de foguete ao Silo dispara o lançamento, com animação e tela de vitória.
- **FR118** Depois do lançamento, o jogo continua em modo livre: a meta passa a ser foguetes por hora, com recorde por seed.
- **FR119** Não há derrota, inimigos nem falência; estados emergentes (gargalo, estoque cheio, impasse de trens) são sempre visíveis, têm destaque na UI e nunca destroem itens ou estruturas.

#### Offline

- **FR120** [MVP] Ao carregar, o jogo calcula Δt = agora − último save, limitado pelo teto: 8 h na base, 12 h com a pesquisa verde, 24 h com a azul. Eficiência de 100% dentro do teto. (Teto de 8 h é MVP; 12 e 24 h vêm no jogo completo.)
- **FR121** [MVP] O cálculo offline é híbrido: roda a mesma simulação em avanço rápido até o regime e extrapola as taxas do regime para o tempo restante, truncando pela capacidade de cada Caixa e do Núcleo.
- **FR122** [MVP] Offline, os Laboratórios não consomem e as pesquisas não avançam; os pacotes de ciência se acumulam nas arestas e buffers até bloquear.
- **FR123** Trens, regras e despachante funcionam no cálculo offline, porque usam a mesma simulação.
- **FR124** Tela de retorno "Enquanto você esteve fora": mostra os itens produzidos e o principal gargalo (nó com maior tempo bloqueado ou faminto); tocar no gargalo leva a câmera até ele.
- **FR125** [MVP] Ao voltar de uma aba em segundo plano, se o intervalo passar de 10 s, usa-se o caminho offline; senão, a simulação recupera o atraso até o limite de 5 ticks por frame.

#### Save

- **FR126** [MVP] Salvamento automático local a cada 30 s e ao sair da aba (`visibilitychange`/`pagehide`).
- **FR127** [MVP] Carregar o save automaticamente ao abrir o jogo.
- **FR128** [MVP] Exportar o save como texto (copiado para a área de transferência) e importar um save colado.
- **FR129** O save anterior é mantido como backup a cada salvamento; ao falhar a leitura do save principal, o jogo oferece o backup.
- **FR130** Conquistas, prestígio e preferências ficam fora do save da partida e sobrevivem ao reset.

#### UI, HUD e controles

- **FR131** [MVP] Barra superior com estoque global, medidor de ⚡ (vermelho em falta) e fôlego.
- **FR132** [MVP] Paleta de nós acessível pelo botão "+", mostrando só os tipos liberados e o custo de cada um.
- **FR133** [MVP] Toda área tocável tem ≥ 44×44 px na tela, qualquer que seja o zoom; conectores têm área de toque ampliada.
- **FR134** [MVP] Toque vs. arraste: movimento > 8 px conta como arraste; toque simples no vazio só seleciona ou desseleciona.
- **FR135** [MVP] Pressão longa = 500 ms sem mover mais de 8 px; sobre um nó ativa Mover nó e o arraste seguinte não move a câmera.
- **FR136** [MVP] Dois dedos sempre cancelam a ferramenta em curso e fazem pinça e pan.
- **FR137** [MVP] Desfazer: botão ↶ desfaz as últimas 20 ações de construção; um desfazer pode falhar (ex.: posição agora ocupada) e mostra o motivo.
- **FR138** [MVP] Desktop: arrastar com o mouse e roda para zoom; arrastar no vazio, botão do meio ou espaço + arrastar = pan; teclas 1–9 = paleta; T = alternar camada; Ctrl+Z = desfazer; Esc = cancelar a ferramenta.
- **FR139** [MVP] Onboarding mínimo com 3 dicas contextuais: tocar na jazida, colocar extrator, ligar aresta.
- **FR140** [MVP] Painel de linha ferroviária (paradas, condições de partida, trens, vazão efetiva).
- **FR141** Painel de estatísticas: taxa por item (itens/min produzidos e consumidos) nos últimos 1, 10 e 60 min.
- **FR142** Conquistas: marcos de ritmo (1º extrator, 1ª ciência vermelha, 1º trem, petróleo, foguete), "foguete em < X h" e "nenhuma aresta nível 1"; estatística de melhor tempo por seed.
- **FR143** Onboarding completo (além das 3 dicas do MVP).
- **FR144** Tela de erro "Algo deu errado" com os botões Recarregar e Exportar save, mostrada quando ocorre um bug.
- **FR145** ~~Aviso "Nova versão — recarregar" do PWA~~ (descartado na issue #9: sem PWA no itch.io).
- **FR146** Todo texto visível ao jogador está em pt-BR, num módulo de strings pronto para i18n.

#### Arte e áudio

- **FR147** [MVP] Todo item em trânsito é visível na aresta com cor e (no zoom próximo) ícone por tipo; a posição é interpolada entre ticks.
- **FR148** Estilo blueprint: fundo de papel técnico azul-escuro com grade sutil; tema claro opcional em papel creme.
- **FR149** [MVP] Nós como fichas de diagrama com cabeçalho colorido por categoria, ícone da receita e conectores em círculo; arestas em traço branco com espessura por nível; trilhos em traço duplo âmbar com dormentes; trens como retângulos estilizados.
- **FR150** Paleta de ~31 itens distinguíveis por daltônicos: cada item combina cor e forma do ícone.
- **FR151** Áudio: 1–2 faixas ambientes calmas (lo-fi/eletrônico) e ~15 SFX: tic de produção (tom por item, volume agregado), clique de conexão, apito e rolamento do trem, jingle de pesquisa concluída.
- **FR152** [MVP] O áudio fica mudo até a primeira interação do jogador (política de autoplay dos navegadores).
- **FR153** Preferências do jogador (áudio, tema, zoom) são salvas separadamente do save.

#### Debug

- **FR154** Ferramentas de debug ativadas por `?debug=1` ou em build de dev.
- **FR155** Painel superadmin: dar ou remover qualquer item; completar ou reverter pesquisas; desbloquear tudo; editar valores de qualquer nó, aresta ou trem; teletransportar a câmera; trocar ou regenerar a seed; velocidade da simulação 0×, 1×, 10× e 100×; forçar falta de energia; simular N horas offline; importar, exportar ou limpar o save.
- **FR156** Overlay de desempenho: FPS, ms por tick, ms de render, itens visíveis e totais, nós, arestas, trens e memória (`performance.memory` quando disponível).
- **FR157** Overlays visuais: baldes do hash espacial, malhas de energia coloridas, segmentos e reservas de trilho, grafo de espera dos trens e estados bloqueado/faminto.
- **FR158** `window.game` expõe o estado, o dispatcher de comandos e os cheats no console (também para agentes via Chrome DevTools MCP).
- **FR159** Replay determinístico: grava `{seed, versão, [tick, comando]…}`, reproduz em qualquer velocidade e é exportado junto com o save.

#### Prestígio (stretch)

- **FR160** Depois do lançamento, "fundar uma nova colônia": mapa novo (outra seed) e progresso zerado.
- **FR161** Moeda "Patentes", ganha por foguetes lançados e pelo tempo de lançamento.
- **FR162** Bônus permanentes pequenos e espaciais: começar com pesquisa X, +1 conector inicial nos extratores, +1 vagão inicial por trem.

### NonFunctional Requirements

- **NFR1** Desempenho: 60 FPS com 1.000 itens animados visíveis e 20 trens num Samsung Galaxy A52 (Chrome atual) e num iPhone 11 (Safari atual). Mínimo aceitável: 30 FPS no mesmo cenário.
- **NFR2** Memória: ≤ 300 MB, medida durante 10 min de jogo na era azul no aparelho de referência; medição no iPhone 11 desde o protótipo do E1.
- **NFR3** Carregamento: ≤ 5 MB transferidos e jogo interativo em ≤ 3 s em 4G. Assets de boot (atlas + SFX curtos) ≤ 1 MB; música ambiente carregada sob demanda depois de interativo.
- **NFR4** Escala da simulação: 500 nós, 1.000 arestas e 20 trens mantendo 10 ticks/s sem queda.
- **NFR5** Offline: o cálculo de 24 h leva ≤ 1 s; o avanço rápido tem orçamento de 400 ms de CPU.
- **NFR6** Validação planar durante o arraste roda no máximo uma vez por frame, em O(k) sobre os baldes do hash espacial tocados, sem derrubar o frame rate.
- **NFR7** Confiabilidade do save: zero perda de save em 50 ciclos de fechar e reabrir a aba.
- **NFR8** Determinismo: mesma seed + mesma sequência de comandos = hash de estado idêntico; sem aleatoriedade depois da geração do mapa.
- **NFR9** Consistência offline: o resultado offline não diverge da simulação ao vivo (mesmo código, mesmo tick).
- **NFR10** Acessibilidade de toque: todo alvo tocável ≥ 44×44 px em qualquer zoom.
- **NFR11** Acessibilidade de cor: todo item e estado é distinguível sem depender só da cor (cor + forma).
- **NFR12** Legibilidade: um gargalo é identificável em até 3 s de olhar, sem abrir menus.
- **NFR13** Plataforma: Chrome/Android e Safari/iOS atuais em retrato e paisagem; desktop em Chrome, Firefox e Safari.
- **NFR14** Hospedagem: itch.io HTML5, página pública, publicada a cada push no `main` via butler. Sem PWA nem service worker. Chaves de armazenamento com o prefixo `train-mind-map:`. No iOS dentro do iframe, sugerir exportar o save (issue #9).
- **NFR15** Hospedagem estática (GitHub Pages, Cloudflare Pages ou similar).
- **NFR16** Robustez: perda de contexto WebGL no iOS Safari é recuperada sem perder a partida.
- **NFR17** Áudio: no máximo 8 vozes simultâneas de SFX; SFX iguais em menos de 50 ms são agregados.
- **NFR18** Manutenibilidade: todo número de gameplay vem de `src/data/` ou `src/config/constants.ts`; toda regra do GDD com número tem ao menos um teste unitário.
- **NFR19** Ritmo (métricas de playtest): 1º extrator automático em ≤ 2 min sem ajuda; 1ª ciência vermelha automatizada em ≤ 15 min; 1º trem em 25–45 min no MVP; petróleo em ~3 h; foguete em 8–12 h ativas; as 5 pesquisas do MVP concluíveis numa seed fixa em 45–75 min.
- **NFR20** Critérios de sucesso do MVP: ≥ 4 de 5 testadores dizem que o trem foi o momento mais divertido; ≥ 3 de 5 voltam no dia seguinte; tentativas de aresta inválida por minuto caem com o tempo.
- **NFR21** O tamanho do bundle principal exclui o código de debug e replay (chunk separado, carregado sob demanda).

### Additional Requirements

**Starter template (Epic 1, Story 1 — primeiro passo obrigatório):**

```bash
npm create pixi.js@latest train-mind-map -- --template bundler-vite
cd train-mind-map
npm i preact @preact/signals idb-keyval
npm i -D typescript@~6.0 @preact/preset-vite vite-plugin-pwa vitest eslint typescript-eslint
mkdir -p .claude/skills && cp -r node_modules/pixi.js/skills/* .claude/skills/
```

- **AR1** Versões fixadas: PixiJS 8.21.x (WebGL; WebGPU desligado), TypeScript 6.0.x (`<6.1`, exigido pelo typescript-eslint 8.70), Vite 8.3.x (Rolldown), Vitest 5.0.x, Preact 10.29.x, @preact/preset-vite 2.10.x, @preact/signals 2.11.x, idb-keyval 6.3.x, vite-plugin-pwa 1.3.x, ESLint 10.11.x, typescript-eslint 8.70.x. Node.js ≥ 22 LTS. `tsconfig` com `strict: true`.
- **AR2** Copiar as skills oficiais do PixiJS (`node_modules/pixi.js/skills/`) para `.claude/skills` do projeto.
- **AR3** Estrutura de pastas por domínio: `src/{config,data,sim,render,input,ui,audio,platform,debug}` e `tests/{sim,data,e2e}`, conforme a arquitetura.
- **AR4** Fronteiras de camada checadas por ESLint (`no-restricted-imports`): `sim/` importa só `sim/`, `data/` e `config/` (nunca `pixi.js`, `preact`, DOM, `render/`, `ui/`, `input/`, `platform/`); `render/`, `input/`, `ui/` e `audio/` só alteram estado via comandos; `debug/` só por `import()` dinâmico.
- **AR5** `GameState` é um objeto puro e serializável (`tick`, `rng`, `map` com `revealedRing`, `nodes`, `edges`, `rails`, `trains`, `lines`, `research`, `stamina`, `stats`, `rocketsLaunched`), com coleções `Map<Id, T>` e IDs numéricos incrementais (branded types). Dados específicos ficam no próprio nó, discriminados por `kind`. `stock` é cache derivado recalculado no fim do tick e não é salvo. Nenhuma referência a objetos do Pixi.
- **AR6** Padrão Command: toda mutação passa por comandos (`PlaceNode`, `ConnectEdge`, `MoveNode`, `RemoveNode`, `PlaceRail`, `ToggleCrossing`, `SetRecipe`, `ManualTap`, `SetStationRules`, `SetTrainRules`, `SetStationMode`, `SetTrainMode`…) com `validate(state)`, `apply(state)` e `invert()`. `dispatch` valida na hora e enfileira; a fila é aplicada no início do próximo tick, em ordem de chegada, com revalidação. Desfazer = pilha de 20 inversos que passam pela mesma fila. Replay grava `[tick, comando]`.
- **AR7** Regras de determinismo: `sim/` não usa `Math.random`, `Date.now` nem `performance.now`; tempo e aleatoriedade entram como parâmetros (rng da seed, dt). Teste de determinismo por hash de estado.
- **AR8** Tick fixo de 100 ms num acumulador sobre `requestAnimationFrame`, limitado a 5 ticks por frame. Ordem fixa dos sistemas: comandos → energia (satisfação com demanda do tick anterior) → extração → produção → fluxo nas arestas → estações e trens → pesquisa → estoque e estatísticas.
- **AR9** Fila de eventos tipada (uniões discriminadas, nomes no passado em PascalCase: `ItemProduced`, `NodeBlocked`, `NodeStatusChanged`, `TrainArrived`, `ResearchDone`, `TrainDeadlock`). A simulação só emite; o loop esvazia a fila após o tick para render, áudio, UI e log.
- **AR10** Máquinas de estado como uniões de strings: `NodeStatus = 'working' | 'starved' | 'blocked' | 'no_power'`; `TrainState = 'loading' | 'departing' | 'moving' | 'waiting_reservation' | 'unloading'`. Transições só nos sistemas da simulação, cada uma emitindo evento.
- **AR11** Ponte com a UI: adaptador publica um resumo do estado em `@preact/signals` a 4 Hz; a UI nunca lê o `GameState` direto. UI em DOM + Preact sobre o canvas.
- **AR12** Tratamento de erros: falhas esperadas retornam `Result<T>` (`{ok:true,value}` | `{ok:false,reason}`, com motivos como `crosses_edge`, `no_stock`, `occupied`) e viram feedback visual. Bugs lançam exceção; handler global (`window.onerror` + `unhandledrejection`) pausa a simulação, grava `save:crash` com estado e log e mostra a tela de erro. `catch` vazio é proibido. `assert` ativo em dev e produção.
- **AR13** Logger: `log.{error|warn|info|debug}(modulo, mensagem, dados?)` com módulos `sim | rail | power | input | render | save | ui | audio`. Dev: console, todos os níveis. Produção: só `warn`+ num buffer circular de 200 entradas, incluído no save exportado e no `save:crash`. Proibido logar no tick quente.
- **AR14** Persistência em IndexedDB via idb-keyval: chaves `save:auto`, `save:backup` (rotação), `save:crash`, `settings` e `meta`. Formato `{schemaVersion, gameVersion, savedAt, seed, state}` em JSON, com `Map` serializado como array de pares. Cadeia de migrações `migrate[v]` aplicada em sequência. Exportar/importar: JSON → gzip (`CompressionStream`) → base64.
- **AR15** Offline híbrido em `sim/offline/` como função pura `(state, Δt, budget) => {state', report}`: avanço rápido com `ctx.offline = true`, sem render nem eventos visuais; regime detectado quando as taxas por item variam < 2% entre duas janelas consecutivas, cada uma ≥ 60 s e ≥ 2× o maior ciclo de ida e volta das linhas de trem; orçamento de 400 ms, usando a última janela completa se estourar; extrapolação truncada pela capacidade das Caixas e do Núcleo.
- **AR16** Aba em segundo plano: em `visibilitychange` oculto, salvar e registrar o timestamp; ao voltar com intervalo > 10 s, usar o caminho offline.
- **AR17** Modelo de fluxo: aresta = fila de itens `{type, pos, prevPos}`; o render interpola com `alpha = acumulador / TICK_MS` e nunca escreve no estado.
- **AR18** Geometria planar: polilinhas em coordenadas inteiras de célula, interseção de segmentos por aritmética inteira (produto vetorial), hash espacial em baldes de 8×8 células indexando segmentos de aresta, retângulos de nó e água. A mesma função `validate` roda no arraste e no `dispatch`. Testes de caso-limite obrigatórios (colineares, toque em vértice, cruzamento X, ciclo de espera).
- **AR19** Duas topologias: `FactoryGraph` e `RailNetwork`, cada uma com índice espacial próprio; a validação de uma nunca consulta o índice da outra, exceto trilho contra retângulo de nó. A Estação é o único tipo nas duas camadas.
- **AR20** Energia: malhas por union-find sobre arestas + trilhos + Estações, recalculadas só quando a topologia muda (marcadas como sujas em qualquer comando topológico); custo zero por tick.
- **AR21** Ferrovia: cada trilho gera duas faixas dirigidas; interconexões dividem as faixas em segmentos; tabela de reserva `segmento → trem`; A* sobre o grafo de segmentos; grafo de espera para detectar ciclos (`TrainDeadlock`). Regras são dados declarativos (`StationRule`, `TrainRule`) em `sim/rail/rules.ts`; despachante em `sim/rail/dispatch.ts`; grupos de estação como índice derivado `nome → StationId[]`.
- **AR22** Semântica de E/S dos nós conforme a arquitetura (buffers de entrada 2× a receita, buffer de saída 1 lote, rodízio de Divisor e Mesclador, bloqueio do Filtro).
- **AR23** Render: um único `Application` do Pixi com 8 camadas (terreno e grade, jazidas, arestas, itens, nós, trilhos, trens, sobreposições). Itens num `ParticleContainer` com uma textura por item no atlas e culling por AABB do viewport. LOD por zoom (traço colorido / pontos / ícones). Pool para sprites de itens e trens; views criadas e descartadas por diff estado × views, uma por ID.
- **AR24** Tratamento de `webglcontextlost` com recriação dos recursos (mitigação de pixijs#12224).
- **AR25** Câmera e gestos próprios (sem `pixi-viewport`); regras de gesto: 8 px, 500 ms, dois dedos cancelam, conector vs. vazio.
- **AR26** Áudio com Web Audio API nativa (sem `@pixi/sound`): formato único AAC `.m4a`, desbloqueio no 1º gesto, máximo de 8 vozes, agregação de SFX iguais em < 50 ms.
- **AR27** Assets: ícones SVG no repositório (`kebab-case`) empacotados num atlas PNG no build; pré-carregamento de tudo no boot (≤ 1 MB).
- **AR28** PWA com `vite-plugin-pwa` (`generateSW`), pré-cache do shell e dos assets de boot, aviso de nova versão, manifest com `orientation: any`.
- **AR29** Geração de mapa: PRNG sfc32 com seed de 128 bits derivada da string; ruído value/simplex próprio em `sim/mapgen/noise.ts`; mapa de 120² gerado inteiro, anéis revelados por `revealedRing`; garantias verificadas com nova tentativa na sub-seed seguinte.
- **AR30** Dados de jogo como módulos TS tipados em `src/data/*.ts` (items, recipes, nodes, research, costs); teste de integridade (toda receita alcançável, sem ciclos impossíveis). Números novos com comentário de origem (ex.: "Factorio placeholder").
- **AR31** Debug em chunk separado, carregado por `import()` dinâmico só com `?debug=1` ou em dev: superadmin, overlay de desempenho, overlays visuais, `window.game`, replay.
- **AR32** Convenções de nome: arquivos `camelCase.ts`, componentes `PascalCase.tsx`, constantes `UPPER_SNAKE_CASE`, IDs em snake_case inglês nos dados (`iron_plate`, `assembler_1`), comandos verbo + objeto, eventos no passado, assets `kebab-case`; código em inglês, textos em pt-BR em `ui/strings.ts`.
- **AR33** Injeção explícita de dependências em `main.ts` (sem singletons globais, exceto `log`). Entidades criadas por funções de fábrica puras chamadas só por comandos.
- **AR34** Checklist de consistência para agentes (7 itens da arquitetura) aplicado em toda story: nada de Pixi/DOM em `sim/`, nenhuma mutação fora de comandos, nada de relógio/`Math.random` em `sim/`, nenhum número mágico, `Result` para falhas esperadas, nenhum log no tick, texto só em `ui/strings.ts`.
- **AR35** Primeiros passos da arquitetura na ordem: estrutura + lint de fronteira → `sim/state`, `sim/commands`, `sim/tick.ts` com teste de determinismo → `sim/geometry` com testes → câmera, gestos e render de nós e arestas → medir FPS e memória no iPhone 11 desde o primeiro protótipo.

### UX Design Requirements

Nenhum documento de UX dedicado. Requisitos de interação/HUD estão nos FRs de UI/Controles; gds-ux pode ser rodado depois para refinar.

### FR Coverage Map

- FR1: Epic 1
- FR2: Epic 1
- FR3: Epic 1
- FR4: Epic 6
- FR5: Epic 1
- FR6: Epic 1
- FR7: Epic 1
- FR8: Epic 6
- FR9: Epic 1
- FR10: Epic 1
- FR11: Epic 1
- FR12: Epic 1
- FR13: Epic 1
- FR14: Epic 1
- FR15: Epic 2
- FR16: Epic 2
- FR17: Epic 2
- FR18: Epic 2
- FR19: Epic 2
- FR20: Epic 2
- FR21: Epic 2
- FR22: Epic 2
- FR23: Epic 3
- FR24: Epic 3
- FR25: Epic 3
- FR26: Epic 3
- FR27: Epic 2
- FR28: Epic 3
- FR29: Epic 3
- FR30: Epic 3
- FR31: Epic 3
- FR32: Epic 3
- FR33: Epic 8
- FR34: Epic 3
- FR35: Epic 8
- FR36: Epic 8
- FR37: Epic 3
- FR38: Epic 3
- FR39: Epic 6
- FR40: Epic 4
- FR41: Epic 5
- FR42: Epic 8
- FR43: Epic 2
- FR44: Epic 2
- FR45: Epic 5
- FR46: Epic 6
- FR47: Epic 2
- FR48: Epic 6, Epic 8
- FR49: Epic 3
- FR50: Epic 3
- FR51: Epic 2
- FR52: Epic 2
- FR53: Epic 2
- FR54: Epic 2
- FR55: Epic 3
- FR56: Epic 3
- FR57: Epic 3
- FR58: Epic 2
- FR59: Epic 2
- FR60: Epic 3
- FR61: Epic 3
- FR62: Epic 7
- FR63: Epic 3
- FR64: Epic 3
- FR65: Epic 3
- FR66: Epic 3
- FR67: Epic 3
- FR68: Epic 2
- FR69: Epic 2
- FR70: Epic 2
- FR71: Epic 2
- FR72: Epic 2
- FR73: Epic 3
- FR74: Epic 2
- FR75: Epic 2
- FR76: Epic 4
- FR77: Epic 2
- FR78: Epic 5
- FR79: Epic 5
- FR80: Epic 5
- FR81: Epic 5
- FR82: Epic 7
- FR83: Epic 7
- FR84: Epic 7
- FR85: Epic 5
- FR86: Epic 5
- FR87: Epic 7
- FR88: Epic 5
- FR89: Epic 5
- FR90: Epic 5
- FR91: Epic 5
- FR92: Epic 5
- FR93: Epic 5
- FR94: Epic 5
- FR95: Epic 5
- FR96: Epic 5
- FR97: Epic 5
- FR98: Epic 7
- FR99: Epic 7
- FR100: Epic 7
- FR101: Epic 7
- FR102: Epic 7
- FR103: Epic 7
- FR104: Epic 7
- FR105: Epic 7
- FR106: Epic 7
- FR107: Epic 7
- FR108: Epic 7
- FR109: Epic 4
- FR110: Epic 4
- FR111: Epic 6
- FR112: Epic 6
- FR113: Epic 6
- FR114: Epic 6
- FR115: Epic 6
- FR116: Epic 4
- FR117: Epic 8
- FR118: Epic 8
- FR119: Epic 8
- FR120: Epic 4
- FR121: Epic 4
- FR122: Epic 4
- FR123: Epic 7
- FR124: Epic 6
- FR125: Epic 4
- FR126: Epic 4
- FR127: Epic 4
- FR128: Epic 4
- FR129: Epic 4
- FR130: Epic 9
- FR131: Epic 3
- FR132: Epic 2
- FR133: Epic 2
- FR134: Epic 2
- FR135: Epic 2
- FR136: Epic 2
- FR137: Epic 2
- FR138: Epic 2
- FR139: Epic 4
- FR140: Epic 5
- FR141: Epic 9
- FR142: Epic 9
- FR143: Epic 9
- FR144: Epic 4
- FR145: Epic 9
- FR146: Epic 1
- FR147: Epic 3
- FR148: Epic 1, Epic 9
- FR149: Epic 3
- FR150: Epic 9
- FR151: Epic 9
- FR152: Epic 9
- FR153: Epic 9
- FR154: Epic 1
- FR155: Epic 1
- FR156: Epic 1
- FR157: Epic 2, Epic 3, Epic 5
- FR158: Epic 1
- FR159: Epic 2
- FR160: Epic 10
- FR161: Epic 10
- FR162: Epic 10

## Epic List

### Epic 1: Mapa navegável no celular

O jogador abre o jogo no navegador do celular e explora, com arraste e pinça, um mapa gerado por seed com jazidas, lagos e o Núcleo. O desenvolvedor já tem o overlay de desempenho, o `window.game` e o painel superadmin básico para testar desde o primeiro dia.
**FRs:** FR1, FR2, FR3, FR5, FR6, FR7, FR9, FR10, FR11, FR12, FR13, FR14, FR146, FR148 (base), FR154, FR155 (base), FR156, FR158
**Notas:** a story 1.1 é o starter (AR1). Inclui a fronteira de lint de `sim/`, o loop com tick fixo, as camadas de render, o handler global de erros e o logger. Mede FPS e memória no iPhone 11 desde já.

### Epic 2: Construir a fábrica em grafo

O jogador toca nas jazidas (com fôlego), paga construções com o estoque global, coloca nós, puxa arestas com rota automática respeitando a regra planar, move, remove e desfaz.
**FRs:** FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR27, FR43, FR44, FR47, FR51, FR52, FR53, FR54, FR58, FR59, FR68, FR69, FR70, FR71, FR72, FR74, FR75, FR77, FR132, FR133, FR134, FR135, FR136, FR137, FR138, FR157 (hash espacial), FR159
**Notas:** fila de comandos, desfazer e replay; geometria planar com testes de caso-limite.

### Epic 3: A fábrica ganha vida

Itens fluem visivelmente pelas arestas, e extratores, fornalhas, montadoras, geradores, divisores e mescladores produzem a cadeia da era vermelha. A energia é distribuída pelas malhas, e os gargalos ficam visíveis.
**FRs:** FR23, FR24, FR25, FR26, FR28, FR29, FR30, FR31, FR32, FR34, FR37, FR38, FR49, FR50, FR55, FR56, FR57, FR60, FR61, FR63, FR64, FR65, FR66, FR67, FR73, FR131, FR147, FR149, FR157 (malhas)
**Notas:** meta de 1.000 itens a 60 FPS (ParticleContainer, culling, LOD) e estados bloqueado, faminto e sem energia.

### Epic 4: Progresso que persiste

O jogador pesquisa no Laboratório (as 4 pesquisas do MVP que não são ferroviárias), o progresso é salvo e continua com o jogo fechado (teto de 8 h), e as dicas iniciais guiam os primeiros minutos.
**FRs:** FR40, FR76, FR109, FR110, FR116, FR120, FR121, FR122, FR125, FR126, FR127, FR128, FR129, FR139, FR144
**Notas:** IndexedDB com migrações, avanço rápido offline, clamp de aba em segundo plano.

### Epic 5: O primeiro trem (fecha o MVP)

O jogador pesquisa a Ferrovia, traça trilho de via dupla, coloca duas Estações e põe um trem de 2 vagões numa linha com condições de partida, levando cobre distante até a base sem colisões.
**FRs:** FR41, FR45, FR78, FR79, FR80, FR81, FR85, FR86, FR88, FR89, FR90, FR91, FR92, FR93, FR94, FR95, FR96, FR97, FR140, FR157 (reservas)
**Notas:** marco do MVP, sem meta de vitória (fim do conteúdo ao concluir o Protótipo final) e playtest com 3 a 5 pessoas.

---
**▲ MVP (Épicos 1–5) ▲**
---

### Epic 6: Expansão e árvore tecnológica

O jogador avança pelas eras vermelha, verde e azul, expande o mapa em anéis, desbloqueia a Montadora 2 e 3, o Filtro, conectores extras, arestas nível 3, tetos offline maiores e o relatório de retorno.
**FRs:** FR4, FR8, FR39, FR46, FR48 (itens até a ciência verde), FR111, FR112, FR113, FR114, FR115, FR124

### Epic 7: Redes ferroviárias automatizadas

O jogador escala a ferrovia: cruzamentos X e interchange, junções, pontes, várias linhas e trens, energia pelos trilhos, destaque de impasse e automação T2 a T5 (grupos, limites, depósito, regras de estação e de trem, rede de pedidos).
**FRs:** FR62, FR82, FR83, FR84, FR87, FR98, FR99, FR100, FR101, FR102, FR103, FR104, FR105, FR106, FR107, FR108, FR123

### Epic 8: Rumo ao foguete

O jogador explora petróleo, refinaria, planta química, painel solar, a cadeia avançada e a ciência azul, constrói o Silo, lança o foguete e segue em modo livre.
**FRs:** FR33, FR35, FR36, FR42, FR48 (restante), FR117, FR118, FR119

### Epic 9: Acabamento

A arte blueprint final (temas escuro e claro), ícones acessíveis a daltônicos, áudio completo, painel de estatísticas, conquistas, onboarding completo, preferências e o PWA com aviso de atualização.
**FRs:** FR130, FR141, FR142, FR143, FR145, FR148 (final), FR150, FR151, FR152, FR153

### Epic 10: Prestígio (stretch)

Depois do lançamento, o jogador funda uma nova colônia numa seed nova e ganha Patentes e bônus espaciais permanentes.
**FRs:** FR160, FR161, FR162

> Implementation is tracked on GitHub (wayfinder map, issue #1). The per-story breakdown is generated with `/to-tickets`, not in this file.
