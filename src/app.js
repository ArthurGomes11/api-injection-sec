const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');

const app = express();

// [SEGURANÇA] OWASP A05 – Security Misconfiguration
// O helmet configura automaticamente ~15 headers HTTP de segurança:
// Content-Security-Policy, X-Frame-Options (clickjacking), X-Content-Type-Options,
// Strict-Transport-Security (HSTS), entre outros. Sem esses headers, o browser
// do cliente não tem instruções de como se proteger contra ataques comuns.
app.use(helmet());

// [SEGURANÇA] OWASP A05 – Security Misconfiguration (CORS irrestrito)
// cors() sem opções aceita qualquer origem (*), permitindo que sites maliciosos
// façam requisições autenticadas em nome do usuário (CSRF-like via fetch).
// Aqui restringimos a origem permitida: em produção, apenas o valor de
// ALLOWED_ORIGIN; em desenvolvimento, apenas localhost:3000.
const allowedOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGIN || '')
  : 'http://localhost:3000';

app.use(cors({
  origin: allowedOrigin || false,
  credentials: true,
}));

// [SEGURANÇA] OWASP A03 – Injection (limite de payload)
// Limitar o corpo da requisição a 10kb impede ataques de DoS via payloads
// gigantes que poderiam esgotar memória ou travar o processo Node.
app.use(express.json({ limit: '10kb' }));

// [SEGURANÇA] OWASP A03 – NoSQL Injection (defesa em profundência)
// express-mongo-sanitize@2.x é incompatível com Express 5: tenta reatribuir
// req.query que é um getter somente-leitura no Express 5, causando TypeError.
// Solução: middleware próprio que percorre os objetos IN-PLACE (sem reatribuir),
// deletando chaves que começam com '$' ou contêm '.', que são operadores MongoDB.
// Esta função é equivalente ao comportamento padrão do express-mongo-sanitize.
function sanitizeMongoOperators(obj) {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (/^\$/.test(key) || key.includes('.')) {
        delete obj[key];
      } else {
        sanitizeMongoOperators(obj[key]);
      }
    }
  }
}

function mongoSanitizeMiddleware(req, res, next) {
  if (req.body) sanitizeMongoOperators(req.body);
  if (req.query) sanitizeMongoOperators(req.query);
  if (req.params) sanitizeMongoOperators(req.params);
  next();
}
app.use(mongoSanitizeMiddleware);

// [SEGURANÇA] OWASP A07 – Identification and Authentication Failures (Brute Force)
// Sem rate limiting, um atacante pode testar infinitas senhas por segundo.
// Este limiter bloqueia um mesmo IP após 100 requisições em 15 minutos
// nos endpoints de autenticação, tornando ataques de força bruta inviáveis.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas requisicoes, tente novamente mais tarde' },
});
app.use('/api/auth', authLimiter);

// [SEGURANÇA] OWASP A09 – Security Logging and Monitoring Failures
// morgan em produção poderia vazar dados sensíveis dos requests em logs.
// Habilitamos o log detalhado apenas em desenvolvimento.
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Rota nao encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({ message: 'Dados invalidos', errors: err.issues });
  }

  return res.status(500).json({ message: 'Erro interno do servidor' });
});

module.exports = app;
