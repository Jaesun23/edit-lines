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

    console.log("\n=== Testing basic file info ===");
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

    console.log("\n=== Testing dry run edit ===");
    const dryRunResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "edit_file_lines",
          arguments: {
            p: path.join(fixturesDir, "example.txt"),
            e: [[2, 2, '  console.log("Hello from dry run!");']],
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
              path: path.join(fixturesDir, "example.txt"),
              lineNumbers: [2],
              context: 1
            }
          }
        },
        ToolResultSchema
      );
      console.log(verifyResult.content[0].text);
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

    console.log("\n=== Testing approve_edit with previosly used state ID ===");
    // Wait for state to expire (if TTL is short for testing)
    await new Promise(resolve => setTimeout(resolve, 100));
    
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

    // Reset fixtures again to clean up
    await resetFixtures();
    console.log("\n=== Test fixtures reset to original state ===");

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