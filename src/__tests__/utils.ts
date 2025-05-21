import fs from "fs/promises";
import path from "path";

// 테스트 디렉토리 경로 설정
const TEST_DIR = path.join(process.cwd(), "src", "__tests__");

const FIXTURES = {
  "test-edits.txt": `line 1: function hello() {
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

  "test-matches.txt": `// Basic component with props
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
};`,

  "sample.txt": `Line 1
Line 2
Line 3
Line 4
Line 5`
};

/**
 * 테스트 픽스처 파일의 전체 경로를 반환합니다.
 * @param {string} filename - 픽스처 파일 이름
 * @returns {string} 픽스처 파일의 전체 경로
 */
function getFixturePath(filename: string): string {
  return path.join(TEST_DIR, "fixtures", filename);
}

async function resetFixtures() {
  const fixturesDir = path.join(TEST_DIR, "fixtures");

  // Ensure fixtures directory exists
  await fs.mkdir(fixturesDir, { recursive: true });

  // Reset each fixture file
  for (const [filename, content] of Object.entries(FIXTURES)) {
    const filepath = path.join(fixturesDir, filename);
    await fs.writeFile(filepath, content, "utf-8");
  }
}

// 테스트 시작 시 무조건 한 번 fixture 초기화
resetFixtures().catch(console.error);

export { getFixturePath, resetFixtures };
