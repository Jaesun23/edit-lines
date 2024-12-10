# edit-file-lines MCP Server

A TypeScript-based MCP server that provides tools for making precise line-based edits to text files within allowed directories.

## Features

### Tools
#### `edit_file_lines`
Make line-based edits to a file. Each edit can either replace entire lines or replace specific text within lines while preserving indentation. Returns a state ID for approval when using dry run mode.

Example usage to replace specific text (preserving indentation):
```json
{
  "p": "file.txt",
  "e": [
    [
      5, 7, "new button", "old button"
    ]
  ],
  "dryRun": true
}
```

Example usage to replace entire lines:
```json
{
  "p": "file.txt",
  "e": [
    [
      5, 7, "new line 1\nnew line 2", ""
    ]
  ],
  "dryRun": true
}
```

Response:
```json
{
  "content": [
    {
      "type": "text",
      "text": "```diff\n--- file.txt\n+++ file.txt\n@@ -5,7 +5,8 @@\n-old line 1\n-old line 2\n-old line 3\n+new line 1\n+new line 2\n \n State ID: a1b2c3d4\n```"
    }
  ]
}
```

Multiple edits example:
```json
{
  "p": "src/components/Button.tsx",
  "e": [
    [10, 12, "blue", "red"],  // Replace "red" with "blue" while preserving indentation
    [15, 15, "  border-radius: 4px;", ""]  // Replace entire line
  ],
  "dryRun": true
}
```

Edit format:
- `startLine`: First line to consider for editing (integer)
- `endLine`: Last line to consider for editing (integer)
- `newContent`: The new text to insert
- `searchText`: The text to search for and replace. If empty string or no matches found, replaces entire line(s)

Common scenarios:
1. Replace text while preserving indentation:
```json
[5, 5, "new value", "old value"]  // Only replaces "old value" with "new value"
```

2. Replace entire lines:
```json
[5, 7, "new content", ""]  // Replaces entire lines 5-7
```

3. Replace specific alignment/spacing:
```json
[10, 12, "    ", "  "]  // Changes 2-space indentation to 4-space
```


### Typical Workflow

1. Use `get_file_lines` to inspect current content:
```json
{
  "path": "src/styles.css",
  "lineNumbers": [15, 16, 17],
  "context": 1
}
```

2. Preview changes with `edit_file_lines` in dry run mode:
```json
{
  "p": "src/styles.css",
  "e": [
    [16, 16, "  margin: 2rem auto;"]
  ],
  "dryRun": true
}
```

3. Approve the changes using the returned state ID:
```json
{
  "stateId": "a1b2c3d4"
}
```

### Common Features
All editing tools:
- Operate only within allowed directories for security
- Return git-style diffs showing the changes made
- Support `dryRun` mode to preview changes without applying them
- Handle line endings consistently across platforms
- Validate inputs and provide clear error messages
- State management for edit approvals with configurable TTL (default: 60 seconds)

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

### Testing

Run the test suite:
```bash
npm run test
```

Additional testing utilities:

#### Test Tools Script
Test the MCP tools directly against sample files:
```bash
npm run test:tools
```

This script:
- Resets test fixtures to a known state
- Connects to the MCP server
- Tests each tool in sequence:
  - `get_file_lines`
  - `edit_file_lines` (dry run)
  - `approve_edit`
- Shows the output of each operation
- Verifies changes were applied correctly

#### Reset Fixtures Script
Reset test fixtures to their original state:
```bash
npm run reset:fixtures
```

Use this script to:
- Reset test files to a known state before testing
- Clean up after failed tests
- Ensure consistent test environment
- Create missing fixture directories

## Usage

The server requires one or more allowed directories to be specified when starting:

```bash
node build/index.js <allowed-directory> [additional-directories...]
```

All file operations will be restricted to these directories for security.

### Environment Variables

- `MCP_EDIT_STATE_TTL`: Time-to-live in milliseconds for edit states (default: 60000). Edit states will expire after this duration and must be recreated.

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "edit-file-lines": {
      "command": "node",
      "args": [
        "/path/to/edit-file-lines/build/index.js",
        "<allowed-directory>"
      ],
      "env": {
        "MCP_EDIT_STATE_TTL": "300000"  // Optional: Set custom TTL (in milliseconds)
      }
    }
  }
}
```

### Security Considerations

- All file operations are restricted to explicitly allowed directories
- Symlinks are validated to prevent escaping allowed directories
- Parent directory traversal is prevented
- Path normalization is performed for consistent security checks
- Invalid line numbers and character positions are rejected
- Line ending normalization ensures consistent behavior across platforms
- Edit states expire after 60 seconds for security
- Edit approvals require exact match of file path and edits

### Debugging

Use the Test Tools script to test the MCP tools directly against sample files. The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) might help, but it currently does not support handing input that are not string values.