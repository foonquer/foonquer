import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    },
  },
});
