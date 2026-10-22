# Simplificação de Relatórios e Exportação em PDF Otimizado para Mobile

Plano arquitetural para reorganizar o módulo de relatórios do **Meu Posto**, introduzindo um modo simplificado executivo na interface e um gerador de relatórios em **PDF Mobile** com tipografia ampliada, cartões verticais e leitura imediata em smartphones e WhatsApp.

---

## Revisão do Usuário & Decisões Críticas

> [!IMPORTANT]
> Como as perguntas interativas foram dispensadas, assumimos o padrão recomendado da indústria para documentos operacionais em postos de combustível:
> 1. **PDF Mobile Vertical**: Formato com proporções e tipografia calibradas para leitura instantânea no celular (sem necessidade de pinçar ou rolar horizontalmente em tabelas estreitas).
> 2. **Alternância Flexível**: Manter a opção de baixar tanto o **PDF Mobile (Celular / WhatsApp)** quanto o **PDF A4 Tradicional (Mesa / Contabilidade)**, preservando toda a riqueza de dados do sistema.
> 3. **Apresentação em Cartões e Blocos Executivos**: Substituir tabelas densas de 10 colunas por blocos estruturados e cartões verticais com indicadores de alto impacto (KPIs de Caixa, Litragem por Combustível, Aferições e Escala).

---

## 1. Visão Geral & Conceito Central

### O que o recurso faz
- **Interface Simplificada dos Relatórios**: Permite ao gestor e ao fiscal de pista alternar entre uma visão executiva limpa (focada em números essenciais, cartões de resumo e filtros ágeis) e a visão operacional analítica completa.
- **Gerador de PDF Especializado para Smartphone**: Gera um documento PDF em formato vertical, com contraste nítido, tipografia de 10pt a 16pt (ao contrário dos 6–8pt de tabelas A4 densas), cartões de fechamento, litragens e aferições prontos para envio direto via WhatsApp ou abertura em telas de 5 a 6,8 polegadas.
- **Pré-visualização e Ações de 1 Toque**: Permite exportar com um toque o relatório consolidado do turno ou do período com badges de status auditáveis.

### Público-Alvo
- Gerentes de posto, proprietários, fiscais de pista e operadores de caixa que precisam conferir rapidamente resultados pelo smartphone no WhatsApp, sem depender de computador ou impressora de mesa.

---

## 2. Experiência do Usuário & Design Visual

### Fluxo do Usuário
1. O usuário acessa a aba **Relatórios**.
2. No topo, encontra uma barra de ações simplificada com:
   - Seletor de Período Rápido (Hoje, Ontem, Semana Atual, Mês Atual, Personalizado).
   - Seletor de Tipo de Relatório agrupado e limpo.
   - Alternador de visualização: **Visão Simplificada (Cartões / Resumo)** vs. **Visão Analítica (Tabelas)**.
3. Botões de Exportação destacados:
   - **Baixar PDF Mobile (Celular/WhatsApp)**: Gera o PDF vertical em cartões legíveis.
   - **Exportar PDF A4 Tradicional**: Gera o relatório completo para impressão em papel.
   - **Cupom Térmico 80mm**: Mantido para impressoras de bobina de pista.
4. No mobile (telas < 768px), as tabelas se transformam automaticamente em cartões verticais com separadores suaves, evitando quebras de layout.

### Identidade Visual & Diretrizes Anti-Slop
- **Paleta de Cores**:
  - Fundo neutro limpo (`slate-50` / `white` no modo claro, `slate-900` no modo escuro).
  - Superfícies com bordas suaves de 1px (`border-slate-200` / `border-slate-800`), sem acúmulo de cartões dentro de cartões.
  - Destaques funcionais em Teal/Emerald para fechamentos conferidos e conformidade, e Amber/Rose para divergências de caixa e aferições fora de margem.
- **Tipografia**:
  - Títulos em `Plus Jakarta Sans` ou `DM Sans`.
  - Valores monetários, litros e horários sempre com numerais tabulares (`tabular-nums` / `font-mono`).
  - Sem pílulas estáticas ou distintivos vazios: metadados separados por divisores pontuais (`·`).
- **Ergonomia Mobile**:
  - Alvos de toque com altura mínima de 44px (`min-h-[44px]`).
  - Botão de exportação mobile acessível com um toque.

---

## 3. Decisões de Produto & Trade-offs

- **Decisão 1: PDF Mobile em Folha Otimizada com Cartões vs. A4 Paisagem Multi-coluna**
  - *Abordagem*: No modo Mobile, o PDF é montado com largura padronizada de leitura e distribuição vertical em cartões e blocos de resumo executivo.
  - *Motivo*: Relatórios A4 paisagem com 10 colunas ficam ilegíveis em celulares, forçando zoom constante e rolagens frustrantes no WhatsApp.
- **Decisão 2: Manutenção do Acervo de Relatórios sem Perda de Dados**
  - *Abordagem*: Nenhuma informação ou tipo de relatório existente é removido. O modo simplificado filtra o ruído visual e sintetiza os números principais, enquanto o modo analítico continua acessível em um clique.
- **Decisão 3: Visualização Prévia Mobile na Tela**
  - *Abordagem*: A própria interface de relatórios ganha uma prévia de cartões mobile-friendly, permitindo que o gestor confira antes mesmo de gerar o arquivo.

---

## 4. Arquitetura Técnica & Estratégia de Dados

### Diagrama da Arquitetura de Relatórios

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RelatoriosView.tsx                              │
│                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────────────────────┐  │
│  │   Filtros Rápidos     │  │   Ações de Exportação Primárias       │  │
│  │   - Hoje / Semana/ Mês│  │   [ 📱 Baixar PDF Mobile ]             │  │
│  │   - Posto / Turno     │  │   [ 📄 PDF A4 Clássico ]  [ 🖨️ 80mm ] │  │
│  └───────────────────────┘  └───────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │   Alternador: [ 📱 Modo Simplificado ]  [ 📊 Modo Detalhado ]    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│             ▼                                         ▼                │
│  ┌───────────────────────┐               ┌──────────────────────────┐  │
│  │ Painel Mobile Cards   │               │ Tabelas Analíticas       │  │
│  │ - KPIs Principais     │               │ - Detalhamento Completo  │  │
│  │ - Cartões por Turno   │               │ - Todas as Colunas       │  │
│  │ - Volumes e Diferença │               │                          │  │
│  └───────────────────────┘               └──────────────────────────┘  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        pdfGenerator.ts                                 │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  gerarRelatorioMobilePDF(...)                                    │  │
│  │  - Página vertical calibrada (largura 120mm ou A4 single-column) │  │
│  │  - Fontes 10pt a 16pt com excelente contraste e legibilidade     │  │
│  │  - Cartões de Caixa, Litragens, Aferições e Equipe               │  │
│  │  - Rodapé executivo para conferência e WhatsApp                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Principais Módulos Envolvidos
1. `src/utils/pdfGenerator.ts`:
   - Implementação da função `gerarRelatorioMobilePDF` (e variantes para Fechamento de Caixa, Balanço e Escalas), gerando blocos verticais com `jsPDF` e `autoTable` com formatação vertical de cartões de 1 coluna.
2. `src/features/relatorios/RelatoriosView.tsx`:
   - Adição do alternador "Modo Simplificado Executivo" vs. "Modo Analítico Detalhado".
   - Renderização responsiva com cartões touch-first para visualização rápida no celular.
   - Integração do botão de download do PDF Mobile com feedback visual imediato.

---

## 5. Plano de Execução Passo a Passo

1. **Desenvolver o Gerador de PDF Mobile (`pdfGenerator.ts`)**:
   - Criar funções de renderização de cartões verticais com tipografia proporcional ampliada.
   - Formatar blocos: Cabeçalho com dados do posto, Resumo de KPIs do período, Cartão de Fechamentos de Caixa (receitas, formas de pagamento, sobras/faltas), Cartão de Combustíveis e Volumes, Cartão de Aferições e Assinaturas.
2. **Implementar a Visualização Simplificada em `RelatoriosView.tsx`**:
   - Adicionar estado de visualização (`visaoSimplificada: boolean`).
   - Criar o componente de Cartões Executivos Mobile dentro da visão de relatórios.
   - Conectar os botões de ação para acionar o `gerarRelatorioMobilePDF`.
3. **Verificação & Testes**:
   - Executar compilação com `compile_applet` e linting com `lint_applet`.
   - Testar a geração e layout dos PDFs sem quebras de página abruptas ou elementos sobrepostos.
