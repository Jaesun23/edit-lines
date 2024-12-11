// scripts/reset-fixtures.ts
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES = {
  'test-edits.txt': `line 1: function hello() {
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
line 12: };`,

  'test-matches.txt': `// Basic component with props
const Button = ({ color = "blue", size = "md" }) => {
  return <button className={\`btn-\${color} size-\${size}\`}>Click me</button>;
};

// Component with multiple props and nested structure
export const Card = ({
  title,
  subtitle = "Default subtitle",
  theme = "light",
  size = "lg",
}) => {
  const cardClass = \`card-\${theme} size-\${size}\`;
  
  return (
    <div className={cardClass}>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
};

// Constants and configurations
const THEME = {
  light: { bg: "#ffffff", text: "#000000" },
  dark: { bg: "#000000", text: "#ffffff" },
};

const CONFIG = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
  retries: 3,
};`
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