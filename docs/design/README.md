# Handoff: MoldAI — plataforma de modelagem do vestuário com IA

## Overview
MoldAI gera moldes (patterns) de vestuário a partir de linguagem natural, foto, croqui, tabela de medidas ou de um molde existente. A saída é molde 2D vetorial, graduado na grade do usuário, com ficha técnica e plano de corte, exportável para Audaces Moldes, Molde.me, plotter (.plt) e PDF A4 encaixável. Monetização por créditos: 30/mês grátis e 3 planos pagos. Nenhum recurso é bloqueado por plano — o único paywall aparece quando o saldo de créditos não cobre a ação.

## About the Design Files
O arquivo deste pacote (`MoldAI Wireframes.dc.html`) é **referência de design em HTML** — protótipo de aparência e comportamento pretendidos, não código de produção para copiar. A tarefa é **recriar essas telas no ambiente do codebase de destino** (React, Vue, SwiftUI, etc.) usando seus padrões e bibliotecas já estabelecidos. Se ainda não existe codebase, escolha o framework mais adequado (sugestão: React + TypeScript, canvas de molde em SVG ou Canvas 2D) e implemente lá.

O arquivo é um documento de opções: cada `<section class="dv-turn">` é uma rodada de design, cada `div.dv-opt` com id (`1a`, `2a`, `3c`, `4a`, `5g`…) é uma tela. Abra no navegador para navegar.

## Fidelity
Duas camadas, ambas presentes no arquivo:
- **Alta fidelidade (implementar assim)** — turnos **4** e **5**: ids `4a`, `4b`, `5a`–`5i`. Cores, tipografia e espaçamentos finais.
- **Wireframe low-fi (só referência de estrutura e fluxo)** — turnos **1**, **2** e **3**: ids `1a`–`1f`, `2a`, `3a`–`3g`. Fonte manuscrita e traço solto são intencionais do wireframe, **não** da UI final.

Onde uma tela existe nos dois níveis, vale a versão de alta fidelidade. Telas ainda só em wireframe: geração em andamento (`3a`), ficha técnica e plano de corte (abas do editor, não desenhadas).

## Design Tokens

### Cores
| Token | Hex | Uso |
| --- | --- | --- |
| ink | `#1c1c19` | texto principal, botões neutros primários, traço do molde |
| paper (app bg) | `#f4f2ec` | fundo da aplicação e do canvas |
| surface | `#ffffff` | painéis, cards, barras |
| surface-alt | `#fcfbf7` | inputs vazios, cabeçalho de tabela, blocos tracejados |
| border | `#ded9cc` | bordas de card, painel, botão |
| line | `#f0ece1` | divisórias internas |
| grid-line | `#e8e4d8` | malha do canvas (26px, ou 22–24px em cards menores) |
| olive | `#4a5a3a` | cor de ação: CTA primário, seleção, bolha do usuário |
| olive-dark | `#38452c` | texto sobre olive-tint |
| olive-tint | `#eaeee2` | fundo de item selecionado/ativo |
| olive-border | `#d7ddc9` | borda de avatar/tint |
| amber-bg | `#fdf3d8` | **exclusivo de crédito** e avisos leves |
| amber-border | `#f0dfa8` | idem |
| amber-text | `#7a5f14` | idem |
| muted | `#8b8779` | texto secundário |
| muted-2 | `#5a564a` | texto de corpo secundário mais escuro |
| placeholder | `#a29e91` | texto de placeholder |
| disabled | `#b8b3a4` / borda `#ece8dd` | botão desabilitado |
| pattern-guide | `#b3ab93` | contorno de graduação (tracejado `5 4`) |
| alert | `#b5502f` | conflito de costura (círculo tracejado, valor da diferença) |
| track | `#ece8dd` | trilho da barra de progresso |

Regra de cor: **âmbar só significa crédito**. Verde-oliva é ação e estado ativo. Nenhuma outra cor de destaque, exceto `#b5502f` para conflito.

### Tipografia
- Display/títulos: **Bricolage Grotesque** (600/700), `letter-spacing` −.4 a −1.4px conforme tamanho.
- Interface/corpo: **Archivo** (400/500/600).
- Escala usada: h1 landing 44px/1.05 (−1.4px); título de tela 21–27px (600); título de card 15–19px (600); corpo 13–13.5px/1.5; UI padrão 12.5px; secundário 11.5–12px; label de seção 11px, 600, `letter-spacing:.8px`, uppercase, cor muted.

### Espaçamento, raio e sombra
- Espaçamento em múltiplos de ~2: gaps 5/7/9/11/14/16px; padding de card 14–22px; padding de tela 22–30px.
- Raio: 20px pill/chip · 16px modal e card grande · 13–14px card · 11px item de lista · 9–10px botão · 6–7px chip de tab.
- Bolha de chat: `12px 12px 3px 12px` (usuário, olive) e `12px 12px 12px 3px` (IA, paper com borda).
- Sombras: card em canvas `0 2px 10px rgba(28,28,25,.07)`; modal `0 12px 34px rgba(28,28,25,.22)`; plano destacado `0 3px 14px rgba(74,90,58,.13)`; overlay do modal `rgba(28,28,25,.28)` + blur 1.2px no conteúdo ao fundo.
- Barra de progresso de crédito: altura 5–6px, raio 3px, trilho `#ece8dd`, preenchimento olive.

## Screens / Views

### 1. Editor de molde (`4a`) — tela central do produto
**Propósito:** conversar com a IA e ajustar o molde. Estrutura fixa em três faixas.
- **Topbar** (h ≈ 55px, surface, borda inferior): logo "Mold**AI**" (AI em olive) · divisor 1×20px `#e6e2d7` · nome do molde (13px/600) + "salvo há 2 min · v5" (11px muted) · espaçador · bloco de crédito 168px (label "Ateliê · 320 créditos" / "de 500" + barra 64%) · botão "Comprar créditos" (borda) · avatar 30px circular olive-tint com iniciais.
- **Painel de conversa** (largura fixa **312px**, surface, borda direita): header com label CONVERSA e nome do modelo à direita; lista de mensagens (bolhas descritas nos tokens; resposta da IA carrega chips "3 peças" e "−4 créditos" em âmbar); rodapé com 3 chips de anexo (＋ foto / ＋ croqui / ＋ molde .dxf), input placeholder "Descreva o ajuste…" (raio 11px) e botão **Gerar** (ink, flex:1) com o custo "4 créditos" ao lado em muted — o custo aparece sempre antes da ação.
- **Área central** (flex:1): barra de abas — grupo segmentado em paper com borda (`Molde 2D` ativo em branco com sombra leve, `Prova 3D`, `Ficha técnica`, `Plano de corte`) · espaçador · "Tamanho 40 ▾" · botão **Detalhes da peça** em estado ativo (borda e texto olive, fundo olive-tint, "✕" para fechar).
- **Canvas** (altura ≈ 440px, paper + malha 26px, `overflow:hidden`): peças em `fill:#fff`, `stroke:#1c1c19`, `stroke-width:1.7`; contorno de graduação em `#b3ab93` tracejado; linha de fio em olive tracejado; pence como triângulo aberto; rótulos das peças 11px muted ("FRENTE · 1×"). Barra de ferramentas flutuante à **esquerda** (coluna de 4 botões 30px, ativo em olive-tint). Painel **Detalhes da peça** flutuante à **direita** (230px, `top/bottom:20px`, raio 13px): título da peça, 5 linhas label/valor com divisórias (folga de costura, pence de busto, cava, fio, consumo), bloco GRADUAÇÃO tracejado com tamanhos aplicados em olive-tint e os pendentes em cinza + "Graduar G e GG · 6 créditos", botão "Graduar", link "Glossário: o que é pence?" no pé.
- **Rodapé** (surface, borda superior): "3 peças · base 40 · unidade cm" · "Exportar" (borda) · "Salvar versão" (olive).

### 2. Dashboard (`4b`)
Topbar com pill de crédito em âmbar ("◆ 320 créditos") e menu "◍ Conta ▾" — **créditos e plano vivem no menu de conta, não na navegação lateral** (Créditos e uso, Plano e cobrança, Preferências, Sair). Sidebar 186px: Meus moldes (ativo, olive-tint), Medidas e grades, Bases do ateliê; no pé um bloco "Importar molde · Audaces · Molde.me · .dxf" e o botão ink "＋ Novo molde". Conteúdo: título 24px + "14 moldes · 4 graduados", busca 180px e filtros Tipo/Recentes; grade de 4 colunas, gap 14px, card raio 13px com thumb 112px em paper (mini-SVG das peças), nome 13px/600 e badge de estado (graduado = olive-tint · rascunho = paper com borda · exportado = âmbar) + data; último card tracejado "Importar .dxf · Audaces". Abaixo, card "Créditos do mês" (número 26px em Bricolage, "de 500 · renova em 12 dias", barra 64%) e card 290px "Uso recente" com 3 lançamentos negativos.

### 3. Landing (`5a`)
Nav (logo, Como funciona / Formatos / Planos, Entrar com borda, "Testar grátis" ink). Hero em duas colunas: à esquerda eyebrow olive uppercase "MODELAGEM COM IA", h1 44px "Descreva a peça. Receba o molde pronto para cortar.", parágrafo 15px/1.55 (máx 390px), CTA olive "Começar com 30 créditos grátis" + secundário "Ver um molde real", nota "Sem cartão. Todos os recursos liberados — você só paga mais créditos quando quiser."; à direita card branco raio 16px simulando o produto (campo de prompt + botão Gerar, canvas com malha e peças, chips graduar/plano de corte/exportar). Abaixo, 3 cards de passo (Descreva ou envie · Ajuste conversando · Exporte e corte).

### 4. Onboarding (`5b`)
Três cards lado a lado, gap 16px, cada um com marcador de passo (círculo 22px: preenchido olive no passo atual, borda cinza nos demais) e título 19px. Passo 1 "Como você trabalha?": 3 opções com subtítulo, a selecionada com borda 1.5px olive e fundo olive-tint. Passo 2 "Sua tabela de medidas": ABNT / importar planilha ou tabela do Audaces / preencher agora + nota tracejada de que pode ser feito depois. Passo 3 "Seu primeiro molde": textarea, chips de sugestão, pill âmbar "◆ 30 créditos grátis por mês", CTA olive "Gerar meu molde · 4 créditos".

### 5. Planos (`5c`)
Título + subtítulo "Todos os recursos em todos os planos. A diferença é quanto você gera por mês."; toggle Mensal/Anual −20%. Quatro cards: **Grátis** R$ 0 · 30 cr/mês (graduação e .dxf liberados, Audaces e Molde.me, modelo v2 padrão, botão "Plano atual" desabilitado) · **Ateliê** R$ 59 · 500 cr · grade própria, histórico ilimitado, 1 usuário · **Estúdio** R$ 149 · 2.000 cr — destaque: borda 2px olive, sombra, badge âmbar "mais escolhido", modelo v2 Pro, plano de corte, 3 usuários, CTA olive · **Confecção** R$ 399 · 10.000 cr · fila prioritária e API, 5 usuários, "Falar com vendas". Rodapé com a tabela de custos: geração 4 · ajuste 1 · graduação 6 · plano de corte 2 · correção 0; "Créditos avulsos: 100 por R$ 19".

### 6. Limite de crédito (`5d`) — único paywall
Editor ao fundo com `opacity:.3` + `blur(1.2px)`, overlay `rgba(28,28,25,.28)`, modal 470px centrado (`top:52px`, raio 16px). Ícone circular âmbar "◆" + título "Seus créditos acabaram"; corpo: "Essa graduação usa 6 créditos e você tem 2. Nada foi perdido — o molde continua salvo em v5."; **dois cards clicáveis** (não botões separados): "Créditos avulsos R$ 19 · 100 créditos · sem assinatura · Comprar ›" e "Ateliê R$ 59/mês · badge melhor custo · 500 créditos/mês · Assinar ›" (borda 2px olive, fundo olive-tint). Pé: "Seus 30 créditos grátis renovam em 12 dias." + link "Voltar ao molde". Regra: **este diálogo só aparece quando o saldo não cobre a ação** — nunca por recurso indisponível no plano.

### 7. Conflito de costura (`5e`)
Badge âmbar "1 conflito" na topbar. No chat, mensagem da IA em âmbar explicando a diferença (cava frente 1,8 cm maior que a da manga) e três ações em chip: "Corrigir manga" (ink), "Ver diferença", "Ignorar", com a nota "Correções não consomem crédito." No canvas, círculos tracejados `#b5502f` nos pontos em conflito, rótulos com os valores e card lateral "Conflito · Cava frente ↔ manga · diferença 1,8 cm · Sugestão: abrir 1,8 cm na copa da manga". Rodapé: "v4 · não exportável com conflito" e botão Exportar desabilitado.

### 8. Histórico de versões (`5f`)
Lista de versões à esquerda (v5 ativa em olive-tint), cada item com autoria da mudança e crédito gasto; total do molde no pé. À direita, comparação v4 → v5 com chips e botão "sobrepor", canvas mostrando v4 tracejado e v5 cheio, e dois cards de delta (Cava 19,6 → 21,4 cm · Consumo 1,80 → 1,85 m).

### 9. Importar Audaces / Molde.me (`5g`)
Cabeçalho "Importar molde · Passo 2 de 2 · mapear camadas" + badge olive-tint "importação grátis". Card do arquivo: ícone, nome, "Audaces Moldes · AAMA/ASTM · 3 peças · 5 tamanhos · 412 KB", botão Trocar. À esquerda, **camadas encontradas** com select por camada (contorno → corte, linha interna → costura, piques e furos → marcação, texto → ignorar, fio → badge âmbar "não encontrado"); selects mapeados em olive-tint, não mapeados com borda. À direita, **verificação** (2 itens ✓ em olive-dark, 2 avisos ⚠ em âmbar-text), prévia das peças e ações Cancelar / "Importar molde" (olive).

### 10. Exportar (`5h`)
Coluna de formatos como lista selecionável (Audaces Moldes .dxf AAMA/ASTM selecionado em olive-tint; Molde.me; Plotter .plt/.hpgl; PDF A4 encaixável; Ficha técnica .pdf/.xlsx). À direita, "O que vai no arquivo" (tamanhos, margem de costura, piques e fio, nome das peças — cada um com select) e "Checagem antes de baixar" (sem conflitos, peças fechadas, consumo estimado). Ações: "Salvar preset" e "Baixar .dxf" (olive).

### 11. Medidas e grades (`5i`)
Lista de grades à esquerda (padrão do sistema, grades da marca, masculino, infantil; ativa em olive-tint) + bloco tracejado de importação de planilha/tabela do Audaces. À direita: nome da grade, chip "tipo de corpo: reto ▾", Duplicar, "Editar regra de progressão"; tabela de medidas com cabeçalho em surface-alt, coluna do tamanho base destacada em olive/600, valores alinhados à direita; abaixo, "Bases do ateliê" (chips + "＋ salvar molde como base") e card "Progressão" (busto 4 cm, cintura 4 cm, cava 0,5 cm) com CTA "Usar esta grade".

## Interactions & Behavior
- **Fluxo de geração:** usuário escreve/anexa → o botão Gerar sempre mostra o custo → ao enviar, débito imediato, chat bloqueado (input e botão em cinza), botão "Cancelar" na barra do canvas, progresso por etapa ("passo 2/4 · pences", "1 de 3 peças") e peças aparecendo parcialmente traçadas. Wireframe de referência: `3a`.
- **Ajuste conversacional:** custo 1 crédito; a IA descreve o que mudou e cria nova versão.
- **Validação de molde:** ao detectar costuras que não fecham, a IA avisa no chat, marca os pontos no canvas, oferece correção **gratuita** e bloqueia a exportação enquanto houver conflito.
- **Paywall:** disparado só quando `saldo < custo da ação`. O trabalho não é perdido; a versão atual permanece salva. Dois caminhos: crédito avulso ou assinatura.
- **Detalhes da peça:** botão alterna o painel flutuante direito; painel reflete a peça selecionada no canvas.
- **Graduação:** ação de 6 créditos; tamanhos aplicados aparecem em olive-tint no painel, pendentes em cinza; a curva de graduação é desenhada tracejada sobre o molde.
- **Importação:** duas etapas (escolher arquivo → mapear camadas + confirmar avisos); não consome crédito.
- **Exportação:** roda a checagem antes de liberar o download; presets salváveis por formato.
- **Estados a cobrir na implementação:** vazio (nenhum molde), carregando (geração), erro de geração, conflito, saldo insuficiente, arquivo de importação inválido, exportação bloqueada.
- Transições sugeridas: 150–200ms ease-out em hover/seleção; modal com fade do overlay + leve subida do card.

## State Management
- `user`: plano (`free|atelier|studio|factory`), créditos disponíveis, cota do ciclo, data de renovação, papel/tipo de trabalho (do onboarding).
- `patterns[]`: id, nome, tipo, estado (`rascunho|graduado|exportado`), grade usada, versão atual, atualizado_em, thumb.
- `pattern`: peças[] (nome, quantidade, polígono/curvas, folga de costura, pences, cava, fio, consumo), tamanho base, tamanhos graduados, conflitos[].
- `chat`: mensagens[] (autor, texto, chips de resultado, custo em créditos), status (`idle|generating|error`), etapa da geração.
- `versions[]`: id, rótulo, descrição, custo, criado_em; seleção de par para comparar (`compareFrom`, `compareTo`), modo sobrepor.
- `editorUI`: aba ativa (2D/3D/ficha/corte), peça selecionada, painel de detalhes aberto, ferramenta ativa, zoom/pan.
- `grades[]`: nome, origem (sistema/minha), tipo de corpo, tamanhos, medidas por tamanho, regra de progressão; grade ativa.
- `importJob`: arquivo, formato detectado, camadas[] → papel mapeado, verificações[] (ok/aviso), prévia.
- `exportJob`: formato, tamanhos, margem de costura, piques/fio, convenção de nomes, resultado da checagem, presets.
- `billing`: modal de saldo insuficiente (ação pretendida + custo), compra avulsa, assinatura.
- Regra de negócio central: toda ação declara custo; débito no início; falha da IA devolve o crédito; correção de conflito custa 0.

## Assets
Nenhum asset binário. Todos os gráficos são SVG inline gerados no protótipo (peças de molde, mini-thumbs dos cards, malha do canvas via `background-image` de gradientes). Ícones estão como glifos de texto (↔ ✂ ⟲ ⌗ ↥ ◆ ◍ ✓ ⚠) — substituir por um set de ícones do codebase. Fontes: Bricolage Grotesque e Archivo (Google Fonts). As figuras de molde são ilustrativas: a geometria real vem do motor de modelagem.

## Files
- `MoldAI Wireframes.dc.html` — documento único com todos os turnos e telas. Alta fidelidade: `4a`, `4b`, `5a`–`5i`. Wireframe: `1a`–`1f`, `2a`, `3a`–`3g`. Cada tela é um `div.dv-opt[id]`; abra no navegador e use os ids para localizar.
