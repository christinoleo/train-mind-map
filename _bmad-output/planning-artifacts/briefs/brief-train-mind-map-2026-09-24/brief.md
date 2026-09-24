---
title: "Game Brief: train-mind-map (título provisório)"
status: final
created: 2026-09-24
updated: 2026-09-24
---

# Game Brief: train-mind-map (título provisório)

## Resumo

Um factory builder no espírito de Factorio, jogado no navegador do celular, em que a fábrica é um **diagrama de nós**. O jogador pousa nós de extração sobre recursos num mapa 2D, liga esses nós a fornalhas e fábricas por arestas e vê os itens correrem pelas linhas. A regra que define o jogo: **arestas nunca se cruzam**. Conforme a fábrica cresce, o espaço plano se esgota. Os **trens** entram então como a grande virada: levam lotes de itens para longe, rápido, e tiram a fábrica do emaranhado.

O ritmo é de clicker e idle. No começo o jogador toca nos recursos para produzir. A automação vai tirando o dedo do processo até a fábrica rodar sozinha, inclusive com o jogo fechado. A profundidade vem da cadeia de receitas e da logística espacial. A leveza vem da interface de diagrama, que simplifica tudo o que o Factorio tem de pesado sem jogar fora a diversão.

É um projeto pessoal, feito por uma pessoa com ajuda de agentes de IA. O MVP precisa ficar jogável em semanas.

## Visão

- **Conceito em uma frase:** construir uma fábrica como um mind map, sem cruzar as linhas, até que os trens a façam atravessar o mapa.
- **Fantasia central:** ver um rabisco de nós virar uma máquina viva e organizada, com itens coloridos fluindo por todas as linhas.
- **Emoção que fica:** a satisfação de destravar um gargalo, primeiro com o dedo, depois com a automação e por fim com um trem, e o prazer de abrir o jogo e ver que os números subiram.

## Público-alvo

- **Primário:** quem joga factory e idle no celular: gente que já jogou ou quer jogar Factorio, shapez ou Builderment, mas no celular, em sessões curtas de 2 a 10 minutos, várias vezes ao dia.
- **Secundário:** quem joga idle ou clicker e quer mais decisão do que "clicar no upgrade".
- **Contexto:** nos portais de navegador predominam os factory games idle e incrementais, e já há provas de que factory games profundos funcionam no toque (Mindustry, com cerca de 9,3M downloads no Android; Builderment, com mais de 1,5M). Detalhes no `addendum.md`.

## Fundamentos

**Gênero:** factory builder com ritmo de clicker e idle. Não é um jogo de puzzle: a regra de não cruzar é uma **restrição de construção**, como o espaço no Factorio, e não um desafio de fase.

**Loop central:**
1. Tocar num recurso para produzir à mão. No começo esse é o motor.
2. Pousar um nó de extração sobre o recurso. Ele produz sozinho a cada X segundos e sai por um conector à direita; pesquisar tecnologia libera mais conectores.
3. Ligar arestas até fornalhas e fábricas. A cadeia de receitas segue o Factorio (minério → placa → engrenagem → circuito…). A árvore é reduzida em relação à do Factorio.
4. Vender, entregar ou pesquisar com o que foi produzido, e com isso liberar novos nós, recursos, área do mapa e trens.
5. Fechar o jogo. A fábrica continua rodando (progresso offline).

**Pilares:**
1. **Nunca cruzar.** Toda aresta precisa caber no plano, e é essa tensão espacial que dá profundidade à construção. Exceções (pontes, trens) são poucas e conquistadas.
2. **Fluxo visível.** Cada aresta mostra os itens andando, com cor ou ícone por tipo, e tem vazão máxima. O gargalo é algo que se **vê**, não algo que se descobre numa planilha.
3. **Trem é a recompensa.** Os trens resolvem o que as arestas não resolvem: distância, volume (lotes) e a saída do emaranhado planar. Devem ser a parte mais divertida do jogo.
4. **Do dedo ao idle.** A progressão tira o clique aos poucos. Automatizar é o próprio objetivo, e o jogo precisa rodar leve no celular.

**Proposta de trens** (hipótese a validar no protótipo do MVP):
- **Estação** é um nó do grafo. Arestas chegam a ela, e ela acumula itens até formar um **lote** (tamanho definido pelo número de vagões).
- **Trilho** é uma camada separada: pode passar por cima das arestas, mas **trilho não cruza trilho**. É um segundo plano de construção por cima do primeiro.
- **Vazão do trem** = carga ÷ tempo de viagem × número de trens. Latência alta e volume grande, o contrário da aresta.
- **Sem sinais estilo Factorio.** Linhas simples, estilo Mini Metro; a complexidade fica no layout, não no agendamento.
- **Pontes e túneis** são um recurso escasso liberado por pesquisa: permitem cruzar sem abandonar a regra.

## Referências e diferencial

| Título | O que pegamos | O que deixamos de fora |
|---|---|---|
| Factorio | cadeia de receitas, trens como virada do mid-game, mineração na mão | sinais, combate, complexidade de desktop |
| Mini Metro / Mini Motorways | cruzamentos como recurso escasso, linhas simples | pressão de tempo e game over |
| shapez / Builderment | fábrica abstrata e relaxante no toque | grade de esteiras |
| Station to Station | cadeias de suprimento ligadas por trilho | estrutura de fases fechadas |
| Idle (Industry Idle, Factory Idle) | progresso offline, sessões curtas | ausência de decisão espacial |
| Node Factory / Nodes | fábrica como grafo de nós | canvas abstrato sem mapa |

**Diferencial:** nenhum jogo encontrado combina mapa de recursos, fábrica em grafo, arestas com vazão, regra de não cruzar e trens. Os grafos puros tiveram recepção fraca (Nodes: 56% positivo); o que falta neles é justamente o mapa espacial com trens.

## Escopo e MVP

- **Plataforma:** navegador no celular (principal) e navegador no desktop (de brinde).
- **Time:** uma pessoa com agentes de IA. **Prazo do MVP:** semanas.
- **Tecnologia:** decidida na fase de arquitetura. Restrições: carregamento leve, toque preciso para puxar arestas e animação de itens fluida em celulares medianos.
- **MVP (valida a hipótese "construir sem cruzar e depois destravar com trem é divertido no celular"):**
  - um mapa pequeno com 2 ou 3 recursos;
  - extração manual por toque, depois nó extrator;
  - 1 fornalha e 1 fábrica, com uma cadeia de 3 ou 4 itens;
  - arestas com vazão, animação e a regra de não cruzar;
  - 1 linha de trem com 2 estações e lote fixo;
  - progresso offline básico;
  - uma meta curta ("entregue N circuitos").
- **Fora do MVP:** prestígio (stretch goal), mapa expansível, pontes, várias linhas de trem, árvore de pesquisa completa, arte final.

## Conteúdo e direção

- **Mundo:** sem narrativa pesada. O mapa é o protagonista. A meta final, como no Factorio, é **lançar um foguete**.
- **Progressão:** lançar o foguete (meta final), mapa que se abre com pesquisa e, mais tarde, prestígio num mapa novo.
- **Arte:** estilo **blueprint/diagrama**: mapa como papel técnico ou lousa, nós como fichas de diagrama e arestas como traços com itens coloridos. É barato de produzir e legível em tela pequena.
- **Áudio:** ambiente calmo, com sons suaves de "tic" na produção e no trem.

## Riscos e perguntas abertas

- **Não cruzar pode frustrar.** Num jogo relaxante, a regra pode travar o jogador. Mitigação: testar no protótipo, com pontes cedo como válvula de escape e ferramenta para mover nós facilmente.
- **O design dos trens ainda não existe.** A proposta acima é uma hipótese; o protótipo do MVP precisa provar que o trem é a parte mais divertida.
- **Toque:** puxar arestas precisas entre nós pequenos numa tela de celular. Precisa de protótipo cedo.
- **Desempenho:** muitos itens animados nas arestas no navegador do celular. Pode exigir simulação agregada, animando só o que está visível.
- **Idle contra construção:** quanto progresso offline existe sem que construir perca o sentido?
- **Em aberto para o GDD:** a árvore de receitas exata; as regras do trilho (curvas, comprimento, custo); se a regra de não cruzar vale entre arestas de tipos diferentes; e a economia de pesquisa.
