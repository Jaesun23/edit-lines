// scripts/test-tools.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import path from 'path';
import { fileURLToPath } from 'url';
import { resetFixtures } from './reset-fixtures';

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

  // Reset fixtures before running tests
  await resetFixtures();

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
    // Connect to server
    await client.connect(transport);

    // Test get_file_lines
    console.log("\nTesting get_file_lines:");
    const getFileResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "get_file_lines",
          arguments: {
            path: path.join(fixturesDir, "example.txt"),
            lineNumbers: [1, 2, 3],
            context: 1
          }
        }
      },
      ToolResultSchema
    );
    console.log(getFileResult.content[0].text);

    // Test edit_file_lines with dry run
    console.log("\nTesting edit_file_lines (dry run):");
    const editFileResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: path.join(fixturesDir, "example.txt"),
            e: [[2, 2, '  console.log("Hello World!");']],
            dryRun: true
          }
        }
      },
      ToolResultSchema
    );
    console.log(editFileResult.content[0].text);

    // Test edit_file_lines with actual change
    console.log("\nTesting edit_file_lines (actual change):");
    const realEditResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: path.join(fixturesDir, "example.txt"),
            e: [[2, 2, '  console.log("Hello World!");']],
            dryRun: false
          }
        }
      },
      ToolResultSchema
    );
    console.log(realEditResult.content[0].text);

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