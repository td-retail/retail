// Configurazione da variabili d'ambiente
const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  baseUrl: env.BASE_URL || 'http://localhost:3000',
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:dev@localhost:5432/retail',
  sessionSecret: env.SESSION_SECRET || 'dev-only-change-me',
  secureCookies: env.NODE_ENV === 'production',
  sessionHours: Number(env.SESSION_HOURS || 10),
  requireTotpForAdmins: (env.REQUIRE_TOTP_FOR_ADMINS || 'true') === 'true',
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 40),
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  demoData: (env.DEMO_DATA || 'false') === 'true',   // carica il set dimostrativo al primo avvio se il database è vuoto
  entra: {
    tenantId: env.ENTRA_TENANT_ID || '',
    clientId: env.ENTRA_CLIENT_ID || '',
    clientSecret: env.ENTRA_CLIENT_SECRET || '',
    get enabled() { return Boolean(this.tenantId && this.clientId && this.clientSecret); },
  },
  seed: {
    adminEmail: env.SEED_ADMIN_EMAIL || '',
    adminName: env.SEED_ADMIN_NAME || 'Amministratore',
    adminPassword: env.SEED_ADMIN_PASSWORD || '',
  },
  appName: 'Toscana Diagnostica · Retail',
};

if (env.NODE_ENV === 'production' && config.sessionSecret === 'dev-only-change-me') {
  throw new Error('SESSION_SECRET obbligatorio in produzione');
}
