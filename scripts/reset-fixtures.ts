// scripts/reset-fixtures.ts
import { fileURLToPath } from 'url';
import { resetFixtures } from '../src/__tests__/utils.js';

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetFixtures().catch(console.error);
}

export { resetFixtures };