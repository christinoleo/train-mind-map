# train-mind-map — Épicos de Desenvolvimento

Este documento desdobra a seção "Épicos de Desenvolvimento" do `gdd.md`. As stories aqui são de alto nível; o detalhamento vem em `gds-create-epics-and-stories`.

**Sequência:** E1 → E2 → E3 → E6 (básico) → E4 (mínimo) → E5 (básico) → **MVP** → E4 (completo) → E5 (completo) → E7 → E8 → E9 (stretch).

---

## E1 — Mapa e grafo (MVP)

**Pilares:** Nunca cruzar · Fluxo visível
**Entrega:** o jogador navega pelo mapa, coloca nós e liga arestas que respeitam a regra planar.

- Gerar o mapa por seed (48×48 na área inicial) com jazidas, lagos e a garantia de recursos a até 15 células do Núcleo.
- Câmera: arrastar, pinça e 3 níveis de detalhe.
- Paleta de nós e colocação por célula, com prévia verde ou vermelha.
- Criar aresta arrastando entre conectores, com até 4 dobras e rolagem automática na borda.
- Validação planar em tempo real: sem cruzar aresta, nó ou água, e dentro do comprimento máximo.
- Mover e remover nós, com revalidação das arestas.
- Desfazer as últimas 20 ações.
- Controles de desktop (mouse e atalhos).

**Pronto quando:** num celular real, dá para montar um grafo de 20 nós sem nenhum cruzamento possível e com toque confortável (alvos ≥ 44 px).

## E2 — Fluxo e produção (MVP)

**Pilares:** Fluxo visível
**Entrega:** os itens fluem pelo grafo e são processados.

- Simulação a 10 ticks/s, desacoplada do render.
- Vazão das arestas (2, 4 e 8 itens/s) e transporte de vários tipos de item na mesma aresta.
- Animação dos itens com cor e ícone e interpolação entre ticks.
- Nós Núcleo, Caixa, Fornalha, Gerador, Montadora 1, Divisor e Mesclador.
- Energia: malhas formadas pelas arestas, geração e consumo em ⚡, desaceleração proporcional quando falta energia, medidor na barra superior.
- Estoque global (Núcleo + Caixas) na barra superior, débito automático na construção com ordem armazém → buffer e opção "não usar em construção".
- Receitas da era vermelha (ferro, cobre, carvão, pedra → placas, tijolo, engrenagem, fio, circuito, ciência vermelha).
- Estados "bloqueado" e "faminto" visíveis no nó.

**Pronto quando:** 1.000 itens visíveis a 60 FPS no aparelho de referência, e um gargalo é identificável sem abrir menus.

## E3 — Clique e automação inicial (MVP)

**Pilares:** Do dedo ao idle
**Entrega:** a transição do clique para a automação.

- Tocar numa jazida gera um item, que voa até o Núcleo com feedback visual e sonoro. Barra de fôlego: 20 toques, recarga de 1 a cada 3 s.
- Extrator produz 1 item a cada 2 s, com 1 conector de saída.
- Construção paga com itens do estoque global (nós iniciais custam minério bruto), com reembolso de 100% ao remover.
- Onboarding mínimo: 3 dicas contextuais (tocar, colocar extrator, ligar aresta).

**Pronto quando:** um jogador novo automatiza o primeiro extrator em ≤ 2 min.

## E6 — Idle e persistência (MVP básico → completo)

**Pilares:** Do dedo ao idle
**Entrega:** o progresso sobrevive e avança com o jogo fechado.

- **Básico:** salvamento automático local a cada 30 s e ao sair da aba, carregamento e exportar/importar o save.
- **Básico:** cálculo offline em estado estacionário, com teto de 8 h.
- **Completo:** tetos de 12 e 24 h via pesquisa, tela "Enquanto você esteve fora" com o principal gargalo, e trens incluídos no cálculo offline.

**Pronto quando:** zero perda de save em 50 ciclos, e o offline de 24 h é calculado em ≤ 1 s.

## E5 — Ferrovia (MVP básico → completo)

**Pilares:** Trem é a recompensa
**Entrega:** a camada ferroviária com trens de lote que nunca colidem.

- **Básico:** alternar a camada, traçar trilho de via dupla (curvas de 45° e 90°), nó Estação nas duas camadas, trem com 1 locomotiva e 2 vagões, linha com 2 paradas e condições de partida, reserva automática de segmentos, carga e descarga via arestas e UI com a vazão da linha.
- **Automação:** T2 (grupos de estação, limite de trens, depósito), T3 (regras de estação), T4 (regras de trem com curinga `{item}`) e T5 (rede de pedidos com despachante), com um editor de regras em formulário.
- **Completo:** cruzamento (X) e interchange, várias linhas e trens, destaque de impasse residual (ciclos em junções e estações), ponte, até 4 vagões e trens no cálculo offline.

**Pronto quando (MVP):** ligar uma jazida distante ao Núcleo por trem é o momento mais divertido do MVP para ≥ 4 de 5 testadores.

---

**Marco MVP:** ver "Meta do MVP" no GDD 1.5 (sem meta de vitória; 6 pesquisas, incluindo o Protótipo final; cobre grande só por trem, atrás de um corredor). Depois do playtest vem a decisão de seguir.

---

## E4 — Pesquisa e progressão (MVP mínimo → completo)

**Pilares:** Do dedo ao idle · Trem é a recompensa
**Entrega:** o jogador escolhe o que destravar com a ciência que produz.
- **Mínimo (MVP):** Laboratório, 5 pesquisas pagas com ciência vermelha.
**Pronto quando (MVP):** as 5 pesquisas do MVP podem ser concluídas numa seed fixa em 45–75 min.
- **Completo:**
- Nó Laboratório e fila de pesquisa.
- Árvore com cerca de 20 tecnologias em 3 eras, com custos de 10 a 1.000 pacotes.
- Expansões de mapa em anéis (72², 96², 120²), com garantias de distância por recurso.
- Ciência verde, Montadora 2 e 3, Filtro, conectores extras e níveis de aresta.

## E7 — Cadeia completa e foguete

- Petróleo (item), Refinaria e Planta química.
- Receitas de petróleo e avançadas, e ciência azul.
- Silo, 50 partes de foguete, animação de lançamento e tela de vitória, seguida de modo livre.
- Planilha de balanceamento completa (as quantidades por receita).

## E8 — Polimento

- Arte blueprint final (tema escuro e claro), ícones acessíveis a daltônicos (cor + forma).
- Áudio ambiente e cerca de 15 SFX.
- Painel de estatísticas (taxa por item em 1, 10 e 60 min).
- Conquistas, onboarding completo e PWA.

## E9 — Prestígio (stretch)

- "Nova colônia": seed nova e reset do progresso.
- Moeda Patentes e bônus permanentes espaciais.
