# Handoff: Redesign do MoldAI (comparado à implementação atual)

## Visão geral

Este pacote documenta o redesign visual de 10 telas do MoldAI, feito como referência de design (arquivos `.dc.html` em `screens/`), e destaca o que muda em relação ao app real hoje (`moldai/`, Next.js + moldai-ui). O objetivo desta tarefa é implementar essas mudanças no código existente — não substituir a stack.

## Sobre os arquivos de design

Os arquivos em `screens/*.dc.html` são **referências de design**, não código para copiar. Foram construídos num editor de design próprio e não rodam fora dele (dependem de um runtime interno). Use os **screenshots em `screenshots/`** para ver o resultado visual, e o HTML apenas para ler estrutura, texto exato e valores de estilo (a maior parte do estilo já usa os tokens do design system `moldai-ui`, que é o mesmo que o app já usa).

## Fidelidade

**Alta fidelidade.** Cores, tipografia, espaçamento e componentes vêm do design system `moldai-ui` já publicado em `moldai/` (mesmos tokens: `--color-olive`, `--radius-card`, escalas de texto etc.). Recrie pixel a pixel usando os componentes de `components/ui/*` e os padrões que o próprio repositório já segue (App Router, Zustand stores, next-intl para textos).

## O que muda em relação ao app atual

A maior parte do redesign é **reorganização visual dentro do vocabulário que o app já usa** (mesmas cores, mesma tipografia, mesmos componentes `moldai-ui`) — não uma nova identidade visual. As mudanças reais de conteúdo/comportamento identificadas foram:

1. **Dashboard — checklist de onboarding novo.** O design adiciona um cartão "Comece com o pé direito · N de 5" no topo do dashboard, com 5 passos (gerar primeiro molde, configurar tabela de medidas, exportar PDF, importar moldes existentes, convidar alguém da equipe), barra de progresso e botão de fechar. Isso **não existe** em `DashboardShell.tsx` hoje (que só renderiza `PatternGrid` + `CreditsCard` + `RecentUsageCard`) nem em `messages/pt-BR.json`. É a maior peça nova do pacote — precisa de: estado de progresso (por conta), textos novos no `pt-BR.json`, e decidir a fonte de cada "concluído" (ex.: "configurar tabela de medidas" = já tem grade custom ativa).
   - **"Convidar alguém da equipe"** implica multi-usuário por conta, que não existe no schema/autenticação atual (é por conta individual). Confirmar com o time se esse item entra nesta fase ou fica como link externo/placeholder.

2. **Configurações — reordenação do menu lateral.** Hoje (`lib/settings/sections.ts`): Perfil, Alterar senha, **Excluir conta**, Créditos e uso, Plano e cobrança. No redesign: Perfil, Alterar senha, Créditos e uso, Plano e cobrança, **Excluir conta** (por último). Mudar a ordem em `SETTINGS_SECTIONS`.

3. **Histórico de versões — nova métrica de comparação.** `VersionCompare.tsx` hoje só calcula/mostra duas deltas: **Cava** (armhole) e **Consumo** (consumption). O design mostra também uma linha **Comprimento** (ex. "63,0 → 63,5 cm +0,5") na comparação entre versões. Precisa de um novo cálculo de delta de comprimento da peça e uma chave de tradução nova (`VersionCompare` só tem `armholeDeltaLabel` e `consumptionDeltaLabel` hoje).

4. **Login — botão "Continuar com Google".** O design mostra um divisor "ou" e um botão OAuth do Google abaixo do formulário de email/senha. `LoginCard.tsx` hoje só chama `signIn("credentials", …)`; não há Google configurado. Confirmar se `auth.ts` deve ganhar um provider OAuth do Google antes de implementar o botão (senão ele fica decorativo).

5. **Demais telas (Landing, Planos, Onboarding, Bases do ateliê, Medidas e grades, Importação, Editor, Versões — layout geral):** copy e estrutura batem com o que já existe em `messages/pt-BR.json` e nos componentes atuais (ex. o hero da Landing, os 3 passos do onboarding, os planos e preços, as abas do editor). Tratar como refinamento visual/de layout usando os componentes `moldai-ui`, não como mudança de conteúdo — mas confira componente a componente, o design pode ter ajustado espaçamentos, hierarquia ou estados (hover/empty/loading) que valem a pena revisar visualmente contra o screenshot.

## Telas

### 1. Landing (`Landing.dc.html` → `app/page.tsx` visitante deslogado → `components/landing/LandingPage.tsx`)

Nav (MoldAI wordmark, Como funciona, Dúvidas, Planos, Entrar, Testar grátis) + hero ("Do texto ao molde pronto para cortar", CTA "Começar com 30 créditos grátis", nota "Sem cartão de crédito") + preview do editor abaixo. Copy confere com `Landing.hero.*` em `pt-BR.json`. Seções seguintes (Como funciona, Dúvidas, Créditos, Footer) não capturadas no screenshot mas já existem como `StepsSection`, `FaqSection`, `CreditsSection`, `LandingFooter` — comparar layout individualmente.

### 2. Autenticação (`Autenticacao.dc.html` → `app/login/page.tsx` → `components/auth/LoginCard.tsx`)

Cartão centralizado: wordmark, "Entrar", campos Email/Senha, link "Esqueci minha senha", botão "Entrar", divisor "ou", botão "Continuar com Google" (**novo**, ver item 4 acima), texto "Ainda não tem conta? Criar conta.". Mesmo cartão serve de referência para Signup/PasswordReset/Verify (mesma moldura, ver `SignupCard.tsx`, `PasswordResetCard.tsx`, `VerifyCard.tsx`).

### 3. Onboarding (`Onboarding.dc.html` → `app/onboarding/page.tsx` → `OnboardingShell.tsx`)

Wizard de 3 passos com indicador de progresso (bolinhas), passo 1 mostrado: "Como você trabalha?" com 3 opções em radiogroup (Modelista de confecção / Marca ou ateliê / Costuro para mim) e "Pular por agora" / "Continuar". Estrutura e copy batem com `OnboardingShell.tsx` e `Onboarding.step1.*`. Sem mudanças de conteúdo identificadas.

### 4. Dashboard (`Dashboard.dc.html` → `app/page.tsx` usuário logado → `DashboardShell.tsx`)

Header com wordmark, título "Meus moldes", medidor de créditos, avatar. Sidebar (Meus moldes / Medidas e grades / Bases e modelos). Conteúdo: "6 moldes", busca, filtro de tipo, botão "+ Novo molde", **checklist de onboarding novo** (ver item 1), grade de moldes abaixo (cortada no screenshot). Mapeie o checklist antes de mexer no resto — é a peça de maior esforço desta tela.

### 5. Editor (`Editor.dc.html` → `app/pattern/[id]/page.tsx` → `EditorShell.tsx`)

Layout de duas colunas: chat à esquerda (histórico de mensagens/créditos gastos por versão, "ver o que mudou · desfazer", campo de input), canvas 2D à direita com peças (Frente/Costas/Manga), tabs (Molde 2D / Prova 3D / Ficha técnica / Plano de corte), seletor de tamanho M/P/G, "graduar", zoom. Estrutura confere com `ChatPanel` + `CanvasArea` + `TabBar`. Sem mudanças de conteúdo identificadas — revisar densidade/espaçamento contra o screenshot.

### 6. Histórico de versões (`Versoes.dc.html` → `app/pattern/[id]/versions/page.tsx` → `VersionsShell.tsx`)

Linha do tempo v5→v1 (data relativa, motivo, custo em créditos, "Restaurar"), comparador "De/Para" com overlay e **delta de Comprimento** (ver item 3, novo) ao lado do delta de Cava já existente.

### 7. Bases do ateliê (`Bases do atelie.dc.html` → `app/slopers/page.tsx` → `SlopersShell.tsx`)

Grid de cartões de base (miniatura, tipo de peça, nome, descrição, "Usar base"), busca e filtro de tipo. Confere com `SloperGrid`/`SloperCard`.

### 8. Medidas e grades (`Medidas e grades.dc.html` → `app/size-charts/page.tsx` → `SizeChartsShell.tsx`)

Coluna de grades do sistema + minhas grades à esquerda, tabela de medidas com regra de progressão por tamanho à direita (Busto, Cintura, Quadril, Altura de cava, Comprimento de costas, Ombro). Confere com `SizeChartLibrary`/`SizeChartTable`.

### 9. Configurações (`Configuracoes.dc.html` → `app/settings/page.tsx` → `SettingsShell.tsx`)

Menu lateral **reordenado** (ver item 2), seção Perfil (Nome/Ateliê/E-mail/Telefone), cartão de conta com plano e créditos, membro desde. _(Corrigido nesta sessão: o arquivo de design tinha aspas duplas aninhadas quebrando o atributo `style` de 7 elementos — já corrigido para aspas simples, sem outra alteração.)_

### 10. Planos (`Planos.dc.html` → `app/planos/page.tsx` → `PricingPage.tsx`)

Nav pública, título "Todos os recursos em todos os planos", toggle Mensal/Anual (−20%), cartão do plano Grátis (30 créditos/mês, lista de recursos). Confere com `PricingPage.tsx` e `Pricing.*`/`PlanSection.plans.*`.

### 11. Importar molde (`Importacao.dc.html` → `app/import/page.tsx` → `ImportShell.tsx`)

Passo 2 de 2 (mapear camadas): badges Beta + Grátis, nota de formato, cartão do arquivo (.dxf, peças, tamanho), preview com zoom/pan, painel de regras de graduação (.rul), identificação de peças. Confere com `FileSummaryCard` + `LayerPreviewCanvas` + `RulCompanionCard` + `PieceLabelPanel`.

## Design tokens (já existentes em `moldai-ui`, não inventar novos)

Cor: `--color-olive` (marca), `bg-surface`/`bg-surface-alt`/`bg-paper`, `text-muted-foreground`/`text-muted-2`, `border-border`, `bg-amber-bg`/`border-amber-border`/`text-amber-text` (avisos), `bg-destructive`/`text-destructive` (erros). Tipografia: escala `text-tick/meta/ui/control/body/title/display`, fontes `font-display` (Bricolage Grotesque) e Archivo (corpo). Raio: `rounded-card` (13.5px), `rounded-btn` (9.5px).

## Assets

Nenhum asset de imagem novo — os cartões de "base"/"molde" no design usam placeholders de miniatura, iguais aos que já existem no app.

## Arquivos

- `screens/*.dc.html` — os 11 arquivos de referência de design (10 telas; Autenticação cobre Login/Signup/Reset/Verify com o mesmo cartão).
- `screenshots/*.png` — captura visual de cada tela, para quem não pode abrir os `.dc.html`.
