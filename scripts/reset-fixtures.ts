// scripts/reset-fixtures.ts
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES = {
  'example.txt': `line 1: function hello() {
line 2:   console.log("Hello");
line 3: }
line 4: 
line 5: function world() {
line 6:   return "World";
line 7: }
line 8:
line 9: module.exports = {
line 10:   hello,
line 11:   world
line 12: };`
};

async function resetFixtures() {
  const fixturesDir = path.join(__dirname, '../src/__tests__/fixtures');

  // Ensure fixtures directory exists
  await fs.mkdir(fixturesDir, { recursive: true });

  // Reset each fixture file
  for (const [filename, content] of Object.entries(FIXTURES)) {
    const filepath = path.join(fixturesDir, filename);
    await fs.writeFile(filepath, content, 'utf-8');
    console.log(`Reset ${filename}`);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetFixtures().catch(console.error);
}

export { resetFixtures };