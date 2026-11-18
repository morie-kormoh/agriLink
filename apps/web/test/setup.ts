// Runs before every test file: point at the test database and use in-memory side effects.
if (!process.env.DATABASE_URL_TEST) {
  throw new Error("DATABASE_URL_TEST is not set (see .env.example).");
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SMS_PROVIDER = "memory";
process.env.RATE_LIMIT_STORE = "memory";
process.env.PAYMENT_PROVIDER_MODE = "mock";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret";
