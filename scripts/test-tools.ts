// scripts/test-tools.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import path from 'path';
import { fileURLToPath } from 'url';
import { resetFixtures } from './reset-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define result schema for tool calls
const ToolResultSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string()
    })
  ),
  isError: z.boolean().optional()
});

async function runTest(
  client: Client,
  testName: string,
  testFilePath: string,
  edit: any
): Promise<string | null> {
  console.log(`\n=== Testing: ${testName} ===`);
  const result = await client.request(
    {
      method: "tools/call",
      params: {
        name: "edit_file_lines",
        arguments: {
          p: testFilePath,
          e: [edit],
          dryRun: true
        }
      }
    },
    ToolResultSchema
  );
  console.log(result.content[0].text);
  
  // Extract and return state ID
  const stateIdMatch = result.content[0].text.match(/State ID: ([a-f0-9]+)/);
  return stateIdMatch ? stateIdMatch[1] : null;
}

async function main() {
  // Get path to fixtures directory
  const fixturesDir = path.join(__dirname, '../src/__tests__/fixtures');

  // Get path to test file
  const testMatchesFilePath = path.join(fixturesDir, "test-matches.txt");
  const testEditsFilePath = path.join(fixturesDir, "test-edits.txt");

  // Create transport
  const transport = new StdioClientTransport({
    command: "node",
    args: ["./build/index.js", fixturesDir],
  });

  // Create client
  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);

    // Basic edit_file_lines and approve_edit test
    console.log("\n=== Testing basic file info ===");
    const getFileResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "get_file_lines",
          arguments: {
            path: testEditsFilePath,
            lineNumbers: [1, 2, 3],
            context: 1
          }
        }
      },
      ToolResultSchema
    );
    console.log(getFileResult.content[0].text);

    // Basic search_file test
    console.log("\n=== Testing basic search_file ===");
    const searchResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "search_file",
          arguments: {
            path: testMatchesFilePath,
            pattern: "CONFIG",
          }
        }
      },
      ToolResultSchema
    );
    console.log(searchResult.content[0].text);

    console.log("\n=== Testing basic edit_file_lines ===");
    const basicEdit = {
      startLine: 2,
      endLine: 2,
      content: 'console.log("Hello from edit!");'
    };
    const stateId = await runTest(client, "Basic Edit", testEditsFilePath, basicEdit);

    if (stateId) {
      console.log("\n=== Testing approve_edit with valid state ID ===");
      const approveResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "approve_edit",
            arguments: { stateId }
          }
        },
        ToolResultSchema
      );
      console.log(approveResult.content[0].text);

      // Verify the changes were applied
      console.log("\n=== Verifying changes ===");
      const verifyResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "get_file_lines",
            arguments: {
              path: testEditsFilePath,
              lineNumbers: [2],
              context: 1
            }
          }
        },
        ToolResultSchema
      );
      console.log(verifyResult.content[0].text);
    }

    // Test approve_edit with previously used state ID
    console.log("\n=== Testing approve_edit with previously used state ID ===");
    if (stateId) {
      const expiredStateResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "approve_edit",
            arguments: { stateId }
          }
        },
        ToolResultSchema
      );
      console.log(expiredStateResult.content[0].text);
    }

    // Test approve_edit with invalid state ID
    console.log("\n=== Testing approve_edit with invalid state ID ===");
    const invalidStateResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "approve_edit",
          arguments: { stateId: "invalid123" }
        }
      },
      ToolResultSchema
    );
    console.log(invalidStateResult.content[0].text);
    
    // Test 1: Indentation Preservation with Regex
    await runTest(
      client,
      "Indentation Preservation with Regex",
      testMatchesFilePath,
      {
        startLine: 13,
        endLine: 13,
        content: "const newCardClass = `custom-${theme}`",
        regexMatch: "const cardClass = `[^`]*`"
      }
    );

    // Test 2: Multi-line Content with Preserved Structure
    await runTest(
      client,
      "Multi-line Content with Preserved Structure",
      testMatchesFilePath,
      {
        startLine: 16,
        endLine: 19,
        content: "    <div className={cardClass}>\n      <h2 className=\"title\">{title}</h2>\n      <p className=\"subtitle\">{subtitle}</p>\n    </div>",
        regexMatch: "<div[^>]*>[\\s\\S]*?</div>"
      }
    );

    // Test 3: Flexible Whitespace Matching
    await runTest(
      client,
      "Flexible Whitespace Matching",
      testMatchesFilePath,
      {
        startLine: 2,
        endLine: 2,
        content: "primary",
        strMatch: " blue "  // Should match even with surrounding spaces
      }
    );

    // Test 4: Named Capture Groups in Regex
    await runTest(
      client,
      "Named Capture Groups in Regex",
      testMatchesFilePath,
      {
        startLine: 25,
        endLine: 25,
        content: "${prefix}White = { bg: ${bg}, text: ${text} }",
        regexMatch: "(?<prefix>\\w+):\\s*{\\s*bg:\\s*\"(?<bg>[^\"]*)\",\\s*text:\\s*\"(?<text>[^\"]*)\""
      }
    );

    // Test 5: Complex JSX Structure
    await runTest(
      client,
      "Complex JSX Structure",
      testMatchesFilePath,
      {
        startLine: 7,
        endLine: 12,
        content: "export const Card = ({\n  title,\n  subtitle = \"New default\",\n  theme = \"modern\",\n  size = \"responsive\"\n}) => {",
        regexMatch: "export const Card[\\s\\S]*?\\) => \\{"
      }
    );

    // Test 6: Multiple Line Modifications
    await runTest(
      client,
      "Multiple Line Modifications",
      testMatchesFilePath,
      {
        startLine: 29,
        endLine: 32,
        content: "const CONFIG = {\n  baseUrl: \"https://api.newexample.com\",\n  timeout: 10000,\n  maxRetries: 5",
        regexMatch: "const CONFIG[\\s\\S]*?retries: \\d+"
      }
    );

    // Test 7: Overlapping Regex Patterns (Should Error)
    console.log("\n=== Testing: Overlapping Regex Patterns (Expected Error) ===");
    const errorResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [
              {
                startLine: 2,
                endLine: 2,
                regexMatch: "color = \"[^\"]*\"",
                content: "color = \"red\""
              },
              {
                startLine: 2,
                endLine: 2,
                regexMatch: "= \"[^\"]*\"",
                content: "= \"blue\""
              }
            ],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(errorResult.content[0].text);

    // Test 8: Look-ahead and Look-behind
    await runTest(
      client,
      "Look-ahead and Look-behind Patterns",
      testMatchesFilePath,
      {
        startLine: 2,
        endLine: 2,
        content: "warning",
        regexMatch: "(?<=color = \")[^\"]*(?=\")"
      }
    );

    // Test 9: Multi-line Regex with Complex Nesting
    await runTest(
      client,
      "Multi-line Regex with Complex Nesting",
      testMatchesFilePath,
      {
        startLine: 13,
        endLine: 18,
        content: "  const cardStyle = useMemo(() => ({\n    backgroundColor: theme === 'light' ? '#fff' : '#000',\n    padding: size === 'lg' ? '2rem' : '1rem'\n  }), [theme, size]);\n\n  return (\n    <div style={cardStyle}>\n      {children}",
        regexMatch: "\\s*const cardClass[\\s\\S]*?\\s*<div[^>]*>[\\s\\S]*?\\{"
      }
    );

    // Test 10: Whitespace Normalization
    await runTest(
      client,
      "Whitespace Normalization",
      testMatchesFilePath,
      {
        startLine: 9,
        endLine: 9,
        content: "description",
        strMatch: 'subtitle   =   "Default subtitle"' // Extra spaces should still match
      }
    );

    // Reset fixtures before running tests
    await resetFixtures();
    console.log("\n=== Resetting fixtures ===");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}