process.env.JWT_SECRET ??=
  "test-only-secret-min-32-characters-long!!";
process.env.DATABASE_APP_URL ??=
  "postgresql://unified_app:unified_app@localhost:5432/unified_org";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/unified_org";
process.env.COOKIE_SECURE ??= "false";
