# edit-file-lines MCP Server

A TypeScript-based MCP server that provides tools for making precise line-based edits to text files within allowed directories.

## Features

### Main Editing Tool

#### `edit_file_lines`
Make line-based edits to a file using string or regex pattern matching. Each edit can:
- Replace entire lines
- Replace specific text matches while preserving line formatting
- Use regex patterns for complex matches
- Handle multiple lines and multiple edits
- Preview changes with dry run mode

1. Basic String Match
```json
// Input
{
  "p": "src/components/Button.tsx",
  "e": [{
    "startLine": 2,
    "endLine": 2,
    "content": "red",
    "strMatch": "blue"
  }],
  "dryRun": true
}

// Output
Index: src/components/Button.tsx
===================================================================
--- src/components/Button.tsx	original
+++ src/components/Button.tsx	modified
@@ -1,6 +1,6 @@
 // Basic component with props
-const Button = ({ color = "blue", size = "md" }) => {
+const Button = ({ color = "red", size = "md" }) => {
   return Click me;
 };

State ID: a1b2c3d4
Use this ID with approve_edit to apply the changes.
```

2. Multiple Edits
```json
// Input
{
  "p": "src/config.ts",
  "e": [
    {
      "startLine": 29,
      "endLine": 29,
      "content": "10000",
      "strMatch": "5000"
    },
    {
      "startLine": 30,
      "endLine": 30,
      "content": "5",
      "strMatch": "3"
    }
  ],
  "dryRun": true
}

// Output
Index: src/config.ts
===================================================================
--- src/config.ts	original
+++ src/config.ts	modified
@@ -27,8 +27,8 @@
 const CONFIG = {
   apiUrl: "https://api.example.com",
-  timeout: 5000,
-  retries: 3,
+  timeout: 10000,
+  retries: 5,
 };

State ID: b3f28a9c
Use this ID with approve_edit to apply the changes.
```

3. Multi-line Edit with Regex
```json
// Input
{
  "p": "src/components/Card.tsx",
  "e": [{
    "startLine": 15,
    "endLine": 18,
    "content": "    \n      <h2 className=\"title\">{title}\n      <h3 className=\"subtitle\">{subtitle}\n    ",
    "regexMatch": "]*>\\s*]*>[^<]*\\s*]*>[^<]*\\s*"
  }],
  "dryRun": true
}

// Output
Index: src/components/Card.tsx
===================================================================
--- src/components/Card.tsx	original
+++ src/components/Card.tsx	modified
@@ -12,10 +12,10 @@
   const cardClass = `card-${theme} size-${size}`;
   
   return (
-    
-      {title}
-      {subtitle}
-    
+    
+      {title}
+      {subtitle}
+    
   );
 };

State ID: c4d59e2f
Use this ID with approve_edit to apply the changes.
```

4. Failed Match Example
```json
// Input
{
  "p": "src/components/Button.tsx",
  "e": [{
    "startLine": 2,
    "endLine": 2,
    "content": "red",
    "strMatch": "green"
  }],
  "dryRun": true
}

// Output
Error: No string match found for "green" on line 2
```

5. Invalid Line Range Example
```json
// Input
{
  "p": "src/components/Button.tsx",
  "e": [{
    "startLine": 100,
    "endLine": 101,
    "content": "console.log('test')"
  }],
  "dryRun": true
}

// Output
Error: Invalid line range: file has 35 lines but range is 100-101
```

6. Overlapping Edits Error
```json
// Input
{
  "p": "src/components/Button.tsx",
  "e": [
    {
      "startLine": 2,
      "endLine": 3,
      "content": "new content 1"
    },
    {
      "startLine": 3,
      "endLine": 4,
      "content": "new content 2"
    }
  ],
  "dryRun": true
}

// Output
Error: Line 3 is affected by multiple edits
```

### Advanced Usage

#### Complex Regex Pattern Matching
Use regex for complex pattern matching:
```json
{
  "p": "src/theme.ts",
  "e": [{
    "startLine": 3,
    "endLine": 3,
    "content": "className={styles.button}",
    "regexMatch": "className=\\{`[^`]*`\\}"
  }],
  "dryRun": true
}
```

#### Mixed String and Regex Matching
Combine different matching types in one operation:
```json
{
  "p": "src/App.tsx",
  "e": [
    {
      "startLine": 5,
      "endLine": 5,
      "content": "xl",
      "strMatch": "md"
    },
    {
      "startLine": 10,
      "endLine": 10,
      "content": "http://localhost:3000",
      "regexMatch": "https?://[^\"]*"
    }
  ],
  "dryRun": true
}
```

### Matching Rules

#### String Matching (`strMatch`)
- Case-sensitive exact matching
- Must match the entire string exactly
- Preserves surrounding whitespace and formatting
- Throws error if string not found in specified lines
- Optional parameter - if omitted, replaces entire line(s)

#### Regex Matching (`regexMatch`)
- Uses JavaScript regex syntax
- Global flag (`g`) is automatically applied
- Preserves surrounding content and formatting
- Throws error if pattern not found in specified lines
- Optional parameter - if omitted, replaces entire line(s)

#### Matching Priority
- Cannot use both `strMatch` and `regexMatch` in the same edit
- Edit operations are applied in reverse line order
- Each line can only be affected by one edit operation

### Common Use Cases

1. Updating Component Props
```json
{
  "p": "src/components/Button.tsx",
  "e": [{
    "startLine": 5,
    "endLine": 5,
    "content": "lg",
    "strMatch": "md"
  }],
  "dryRun": true
}
```

2. Changing Configuration Values
```json
{
  "p": "src/config.ts",
  "e": [{
    "startLine": 3,
    "endLine": 3,
    "content": "10000",
    "strMatch": "5000"
  }],
  "dryRun": true
}
```

3. Updating JSX Structure
```json
{
  "p": "src/components/Card.tsx",
  "e": [{
    "startLine": 10,
    "endLine": 12,
    "content": "      <div className=\"card-header\">\n        {title}\n      "
  }],
  "dryRun": true
}
```

4. Replacing URL Patterns
```json
{
  "p": "src/api/client.ts",
  "e": [{
    "startLine": 5,
    "endLine": 5,
    "content": "http://localhost:3000",
    "regexMatch": "https?://[^\"]*"
  }],
  "dryRun": true
}
```

5. Updating CSS Classes
```json
{
  "p": "src/styles/components.css",
  "e": [{
    "startLine": 10,
    "endLine": 10,
    "content": "4px",
    "regexMatch": "\\d+px"
  }],
  "dryRun": true
}
```


### Additional Tools

#### `get_file_lines`
Inspect specific lines in a file with optional context lines. This tool is useful for verifying line content before making edits.

##### Parameters
```typescript
{
  "path": string,        // Path to the file
  "lineNumbers": number[],  // Array of line numbers to inspect
  "context": number        // Optional: Number of context lines before/after (default: 0)
}
```

##### Examples

1. Basic Line Inspection
```json
{
  "path": "src/app.js",
  "lineNumbers": [5],
  "context": 0
}
```
Response:
```
Line 5:
> 5: const apiUrl = 'https://api.example.com';
```

2. Multiple Lines with Context
```json
{
  "path": "src/components/Button.tsx",
  "lineNumbers": [1, 2, 3],
  "context": 1
}
```
Response:
```
Line 1:
> 1: // Basic component with props
  2: const Button = ({ color = "blue", size = "md" }) => {

Line 2:
  1: // Basic component with props
> 2: const Button = ({ color = "blue", size = "md" }) => {
  3:   return <button className={`btn-${color} size-${size}`}>Click me</button>;

Line 3:
  2: const Button = ({ color = "blue", size = "md" }) => {
> 3:   return <button className={`btn-${color} size-${size}`}>Click me</button>;
  4: };
```


#### `approve_edit`
Apply changes from a previous dry run of `edit_file_lines`. This tool provides a two-step editing process for safety.

##### Parameters
```typescript
{
  "stateId": string  // State ID from a previous dry run
}
```

##### Examples

1. Basic Approval Flow
First, make a dry run edit:
```json
{
  "p": "src/components/Button.tsx",
  "e": [{
    "startLine": 2,
    "endLine": 2,
    "content": "  console.log('Hello from dry run!')",
    "strMatch": "  console.log('Hello');"
  }],
  "dryRun": true
}
```
Response:
```
[diff output]
State ID: a1b2c3d4
Use this ID with approve_edit to apply the changes.
```

Then, approve the changes:
```json
{
  "stateId": "a1b2c3d4"
}
```
Response shows the applied changes in diff format.

2. Example Workflow
```typescript
// 1. Check current content
{
  "path": "src/config.js",
  "lineNumbers": [5],
  "context": 1
}

// 2. Make dry run edit
{
  "p": "src/config.js",
  "e": [{
    "startLine": 5,
    "endLine": 5,
    "content": "const DEBUG = true;",
    "strMatch": "const DEBUG = false;"
  }],
  "dryRun": true
}

// 3. Review the diff output and note the state ID

// 4. Approve the changes
{
  "stateId": "received_state_id"
}

// 5. Verify the changes
{
  "path": "src/config.js",
  "lineNumbers": [5],
  "context": 1
}
```

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

### Error Handling

The tool provides clear error messages for common issues:

1. Match Not Found
```
Error: No string match found for "oldValue" on line 5
```

2. Invalid Regex
```
Error: Invalid regex pattern "([": Unterminated group
```

3. Multiple Edits on Same Line
```
Error: Line 5 is affected by multiple edits
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