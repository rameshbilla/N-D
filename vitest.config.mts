import { defineConfig } from 'vitest/config';

// Unit tests for the framework-independent code (pricing, validation, payment signatures, server helpers).
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
