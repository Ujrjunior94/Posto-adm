# 🚀 Guia de Integração e Configuração com OpenRouter

Este documento apresenta todas as instruções, arquitetura de segurança e endpoints do servidor Node.js/Express para a integração com a **OpenRouter API** utilizando as variáveis de ambiente `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`.

---

## 🔒 1. Princípio Fundamental de Segurança: Proteção Total da Chave

Para assegurar conformidade com as melhores práticas de segurança de aplicações web:
* **A chave `OPENROUTER_API_KEY` NUNCA é exposta ou embutida no frontend/navegador.**
* **Todas as requisições para a IA passam obrigatoriamente pelo servidor backend Node.js (Proxy Server).**
* O navegador do usuário final apenas se comunica com as rotas `/api/*` do servidor local, que valida a carga, injeta a chave de autenticação em cabeçalhos HTTP no lado do servidor e encaminha para a OpenRouter.
* O endpoint de status (`GET /api/openrouter/status`) retorna apenas se a chave está configurada e uma versão mascarada (ex: `sk-or-v1-...9a4f`), sem expor o segredo.

---

## ⚙️ 2. Variáveis de Ambiente Necessárias

No arquivo `.env` na raiz do projeto (copiado a partir de `.env.example`), configure:

```bash
# Chave de API secreta obtida no painel da OpenRouter (https://openrouter.ai/keys)
OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Identificador do modelo de IA (Padrão: modelo multimodal rápido e gratuito)
OPENROUTER_MODEL="google/gemini-2.0-flash-lite-preview-02-05:free"
```

### 🧠 Modelos Recomendados no OpenRouter:

| Identificador do Modelo | Tipo | Custo | Finalidade Recomendada |
| :--- | :--- | :--- | :--- |
| `google/gemini-2.0-flash-lite-preview-02-05:free` | Multimodal (Visão + Texto) | **Gratuito** | Leitura OCR de escalas, tabelas e alta velocidade |
| `meta-llama/llama-3.2-11b-vision-instruct:free` | Multimodal (Visão + Texto) | **Gratuito** | Análise visual e leitura de documentos |
| `google/gemini-2.5-flash` | Multimodal | Pago (Baixo custo) | Maior precisão em imagens complexas e tabelas manuscritas |
| `anthropic/claude-3.5-sonnet` | Multimodal | Pago | Máxima acurácia em raciocínio visual e metrologia |
| `openai/gpt-4o-mini` | Multimodal | Pago (Baixo custo) | Equilíbrio excelente entre custo e velocidade |

---

## 🌐 3. Endpoints do Servidor Backend (`server.ts`)

O servidor Express disponibiliza os seguintes endpoints sob o prefixo `/api/`:

### 3.1. `POST /api/analyze-schedule-image`
Endpoint especializado para OCR e extração tabular de escalas de trabalho em postos de combustível.
* **Corpo da Requisição (JSON):**
  ```json
  {
    "imageBase64": "data:image/jpeg;base64,...",
    "mimeType": "image/jpeg"
  }
  ```
* **Comportamento:**
  - Valida a presença e integridade do Base64 da imagem;
  - Monta o prompt do sistema para reconhecimento óptico;
  - Envia a imagem para o modelo especificado em `OPENROUTER_MODEL` via autenticação Bearer com `OPENROUTER_API_KEY`;
  - Retorna a estrutura crua em JSON contendo `cells` (células indexadas por linha e coluna) e `colaboradoresEscala`.

### 3.2. `GET /api/openrouter/status`
Verifica o estado da integração com o OpenRouter sem revelar a chave de API.
* **Resposta de Sucesso:**
  ```json
  {
    "status": "configured",
    "configured": true,
    "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
    "maskedKey": "sk-or-v...3f8a",
    "serverTime": "2026-10-05T12:00:00.000Z"
  }
  ```

### 3.3. `POST /api/openrouter/test`
Testa a conectividade com o OpenRouter disparando uma solicitação de teste leve (ping) com timeout de 15 segundos.
* **Resposta de Sucesso:**
  ```json
  {
    "success": true,
    "message": "Conexão com OpenRouter estabelecida com sucesso!",
    "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
    "reply": "PONG"
  }
  ```

### 3.4. `POST /api/openrouter/chat`
Proxy universal para chamadas de completions (texto ou visão computacional).
* **Corpo da Requisição (JSON):**
  ```json
  {
    "messages": [
      { "role": "user", "content": "Olá, qual modelo você é?" }
    ],
    "temperature": 0.2,
    "max_tokens": 100
  }
  ```

---

## 🛠️ 4. Como Usar no Frontend (React / TypeScript)

O frontend consome a integração de forma transparente através de:
1. `src/services/openrouterService.ts`
2. `src/services/AIProvider.ts`
3. `src/services/ai/scheduleImageImporter.ts`

### Exemplo 1: Verificação de Status
```typescript
import { getOpenRouterStatus, testOpenRouterConnection } from './services/openrouterService';

// Verificar se o servidor possui chave configurada
const status = await getOpenRouterStatus();
console.log('OpenRouter configurado:', status.configured, 'Modelo:', status.model);

// Testar conexão
const teste = await testOpenRouterConnection();
if (teste.success) {
  console.log('OpenRouter operacional!');
}
```

### Exemplo 2: Importação de Escala de Trabalho com Imagem
```typescript
import { scheduleImageImporter } from './services/ai/scheduleImageImporter';

const resultado = await scheduleImageImporter.processImage(
  imageBase64String,
  funcionariosCadastrados,
  turnosCadastrados,
  10, // Mês
  2026 // Ano
);

console.log('Colaboradores importados:', resultado.colaboradores);
```

---

## 🧪 5. Testando via Linha de Comando (cURL)

Você pode testar os endpoints diretamente no terminal com a aplicação em execução:

```bash
# 1. Checar status da configuração
curl http://localhost:3000/api/openrouter/status

# 2. Testar conectividade real com a API do OpenRouter
curl -X POST http://localhost:3000/api/openrouter/test

# 3. Enviar uma mensagem via Proxy
curl -X POST http://localhost:3000/api/openrouter/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Responda apenas OK"}]}'
```

---

## 📋 6. Resumo dos Componentes do Sistema

```
[ Frontend (React SPA) ]
         │
         │  POST /api/analyze-schedule-image  (Sem chaves expostas)
         ▼
[ Backend Express (server.ts) ]
         │
         │  Injeta process.env.OPENROUTER_API_KEY
         │  Aplica process.env.OPENROUTER_MODEL
         ▼
[ OpenRouter API Gateway ]
         │
         ▼
[ Modelo Multimodal (Gemini Flash / Llama Vision / Claude) ]
```
