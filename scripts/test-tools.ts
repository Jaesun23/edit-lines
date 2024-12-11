// scripts/test-tools.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import path from 'path';
import { fileURLToPath } from 'url';
import { resetFixtures } from './reset-fixtures.js';
import fs from 'fs/promises';

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

    console.log("\n=== Testing dry run edit ===");
    const dryRunResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testEditsFilePath,
            e: [
              {
                startLine: 2,
                endLine: 2,
                content: 'console.log("Hello from dry run!");'
              }
            ],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(dryRunResult.content[0].text);
    
    // Extract state ID from the dry run result
    const stateIdMatch = dryRunResult.content[0].text.match(/State ID: ([a-f0-9]+)/);
    const stateId = stateIdMatch ? stateIdMatch[1] : null;
    
    if (stateId) {
      console.log("\n=== Testing approve_edit with valid state ID ===");
      const approveResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "approve_edit",
            arguments: {
              stateId
            }
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

    console.log("\n=== Testing approve_edit with previously used state ID ===");
    
    if (stateId) {
      const expiredStateResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "approve_edit",
            arguments: {
              stateId
            }
          }
        },
        ToolResultSchema
      );
      console.log(expiredStateResult.content[0].text);
    }

    console.log("\n=== Testing approve_edit with invalid state ID ===");
    const invalidStateResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "approve_edit",
          arguments: {
            stateId: "invalid123"
          }
        }
      },
      ToolResultSchema
    );
    console.log(invalidStateResult.content[0].text);

    console.log("\n=== Testing String Matching ===");

    // Basic string match tests
    console.log("\n1. Basic: Replace color default value");
    let result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 2,
              endLine: 2,
              content: "red",
              strMatch: "blue"
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    console.log("\n2. Basic: Replace size default value");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 2,
              endLine: 2,
              content: "lg",
              strMatch: "md"
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    // Advanced string match tests
    console.log("\n3. Advanced: Replace multiple theme values while preserving structure");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 25,
              endLine: 25,
              content: "system",
              strMatch: "light"
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    console.log("\n4. Advanced: Update configuration value with string containing special characters");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 30,
              endLine: 30,
              content: "https://api.newdomain.com",
              strMatch: "https://api.example.com"
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    console.log("\n5. Advanced: Replace nested prop while preserving indentation");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 9,
              endLine: 9,
              content: "Custom subtitle",
              strMatch: "Default subtitle"
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    console.log("\n=== Testing Regex Matching ===");

    // Basic regex match tests
    console.log("\n1. Basic: Replace size prop using regex");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 2,
              endLine: 2,
              content: 'size = "xl"',
              regexMatch: 'size = "[^"]*"'
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    console.log("\n2. Basic: Replace any API URL");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 30,
              endLine: 30,
              content: "http://localhost:3000",
              regexMatch: 'https?://[^"]*'
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    // Advanced regex match tests
    console.log("\n3. Advanced: Replace template literal with regex");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 3,
              endLine: 3,
              content: "className={styles.button}",
              regexMatch: 'className=\\{`[^`]*`\\}'
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    console.log("\n4. Advanced: Update multiple prop values with capture groups");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 25,
              endLine: 25,
              content: "#f5f5f5",
              regexMatch: '#[a-fA-F0-9]{6}'
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

    console.log("\n5. Advanced: Replace export statement with regex");
    result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: testMatchesFilePath,
            e: [{
              startLine: 7,
              endLine: 7,
              content: "export default",
              regexMatch: '^export const'
            }],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(result.content[0].text);

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