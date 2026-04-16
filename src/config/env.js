const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1, 'MONGO_URI obrigatorio'),
  // [SEGURANÇA] OWASP A02 – Cryptographic Failures
  // Segredos JWT curtos são vulneráveis a ataques de força bruta offline:
  // um atacante com um token pode tentar assinar o mesmo payload com segredos
  // comuns até encontrar um que produza a mesma assinatura.
  // Exigimos mínimo de 32 caracteres (256 bits), tornando isso computacionalmente inviável.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  // [SEGURANÇA] OWASP A05 – Security Misconfiguration (CORS)
  // Centraliza a origem permitida numa variável de ambiente para que cada
  // ambiente (staging, produção) configure o seu próprio domínio frontend,
  // sem precisar alterar código.
  // preprocess converte string vazia em undefined para que .optional() funcione
  // corretamente quando a variável existe no ambiente mas não foi preenchida.
  ALLOWED_ORIGIN: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional()
  ),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Erro nas variaveis de ambiente:');
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = parsedEnv.data;
