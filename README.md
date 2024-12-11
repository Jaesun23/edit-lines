# Edit File Lines MCP Server

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

Example file (`src/components/App.tsx`):
```typescript
// Basic component with props
const Button = ({ color = "blue", size = "md" }) => {
  return Click me;
};

// Component with multiple props and nested structure
export const Card = ({
  title,
  subtitle = "Default subtitle",
  theme = "light",
  size = "lg",
}) => {
  const cardClass = `card-${theme} size-${size}`;
  
  return (
    
      {title}
      {subtitle}
    
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
};
```

### Example Use Cases

1. Simple String Replacement
```json
// Input
{
  "p": "src/components/App.tsx",
  "e": [{
    "startLine": 2,
    "endLine": 2,
    "content": "primary",
    "strMatch": "blue"
  }],
  "dryRun": true
}

// Output
Index: src/components/App.tsx
===================================================================
--- src/components/App.tsx        original
+++ src/components/App.tsx        modified
@@ -1,6 +1,6 @@
 // Basic component with props
-const Button = ({ color = "blue", size = "md" }) => {
+const Button = ({ color = "primary", size = "md" }) => {
   return Click me;
 };
 
 // Component with multiple props and nested structure

State ID: fcbf740a
Use this ID with approve_edit to apply the changes.
```

2. Multi-line Content with Preserved Structure
```json
// Input
{
  "p": "src/components/App.tsx",
  "e": [{
    "startLine": 17,
    "endLine": 20,
    "content": "    \n      <h2 className=\"title\">{title}\n      <p className=\"subtitle\">{subtitle}\n    ",
    "regexMatch": "]*>[\\s\\S]*?"
  }],
  "dryRun": true
}

// Output
Index: src/components/App.tsx
===================================================================
--- src/components/App.tsx        original
+++ src/components/App.tsx        modified
@@ -13,10 +13,10 @@
   const cardClass = `card-${theme} size-${size}`;
   
   return (
     
-      {title}
-      {subtitle}
+      {title}
+      {subtitle}
     
   );
 };

State ID: f2ce973f
Use this ID with approve_edit to apply the changes.
```

3. Complex JSX Structure Modification
```json
// Input
{
  "p": "src/components/App.tsx",
  "e": [{
    "startLine": 8,
    "endLine": 12,
    "content": "  title,\n  subtitle = \"New default\",\n  theme = \"modern\",\n  size = \"responsive\"",
    "regexMatch": "\\s*title,[\\s\\S]*?size = \"lg\""
  }],
  "dryRun": true
}

// Output
Index: src/components/App.tsx
===================================================================
--- src/components/App.tsx        original
+++ src/components/App.tsx        modified
@@ -5,11 +5,11 @@
 
 // Component with multiple props and nested structure
 export const Card = ({
   title,
-  subtitle = "Default subtitle",
-  theme = "light",
-  size = "lg",
+  subtitle = "New default",
+  theme = "modern",
+  size = "responsive"
 }) => {
   const cardClass = `card-${theme} size-${size}`;
   
   return (

State ID: f1f1d27b
Use this ID with approve_edit to apply the changes.
```

4. Configuration Update with Whitespace Preservation
```json
// Input
{
  "p": "src/components/App.tsx",
  "e": [{
    "startLine": 29,
    "endLine": 32,
    "content": "  baseUrl: \"https://api.newexample.com\",\n  timeout: 10000,\n  maxRetries: 5",
    "regexMatch": "\\s*apiUrl:[\\s\\S]*?retries: \\d+"
  }],
  "dryRun": true
}

// Output
Index: src/components/App.tsx
===================================================================
--- src/components/App.tsx        original
+++ src/components/App.tsx        modified
@@ -26,8 +26,8 @@
   dark: { bg: "#000000", text: "#ffffff" },
 };
 
 const CONFIG = {
-  apiUrl: "https://api.example.com",
-  timeout: 5000,
-  retries: 3,
+  baseUrl: "https://api.newexample.com",
+  timeout: 10000,
+  maxRetries: 5
 };

State ID: 20e93c34
Use this ID with approve_edit to apply the changes.
```

5. Flexible Whitespace Matching
```json
// Input
{
  "p": "src/components/App.tsx",
  "e": [{
    "startLine": 9,
    "endLine": 9,
    "content": "description",
    "strMatch": "subtitle   =   \"Default subtitle\""  // Extra spaces are handled
  }],
  "dryRun": true
}

// Output works even with extra spaces in the match pattern
```

### Additional Tools

#### `get_file_lines`
Inspect specific lines in a file with optional context lines. This tool is useful for verifying line content before making edits.

```json
// Input
{
  "path": "src/components/App.tsx",
  "lineNumbers": [1, 2, 3],
  "context": 1
}

// Output
Line 1:
> 1: // Basic component with props
  2: const Button = ({ color = "blue", size = "md" }) => {

Line 2:
  1: // Basic component with props
> 2: const Button = ({ color = "blue", size = "md" }) => {
  3:   return Click me;

Line 3:
  2: const Button = ({ color = "blue", size = "md" }) => {
> 3:   return Click me;
  4: };
```

#### `approve_edit`
Apply changes from a previous dry run of `edit_file_lines`. This tool provides a two-step editing process for safety. Here is an example workflow:

1. First, make a dry run edit:
```json
// Input
{
  "p": "src/components/App.tsx",
  "e": [{
    "startLine": 2,
    "endLine": 2,
    "content": "const Button = ({ color = \"primary\", size = \"md\" }) => {",
    "strMatch": "const Button = ({ color = \"blue\", size = \"md\" }) => {"
  }],
  "dryRun": true
}

// Output
Index: src/components/App.tsx
===================================================================
--- src/components/App.tsx        original
+++ src/components/App.tsx        modified
@@ -1,6 +1,6 @@
 // Basic component with props
-const Button = ({ color = "blue", size = "md" }) => {
+const Button = ({ color = "primary", size = "md" }) => {
   return Click me;
 };

State ID: fcbf740a
Use this ID with approve_edit to apply the changes.
```

2. Then, approve the changes using the state ID:
```json
// Input
{
  "stateId": "fcbf740a"
}

// Output
Index: src/components/App.tsx
===================================================================
--- src/components/App.tsx        original
+++ src/components/App.tsx        modified
@@ -1,6 +1,6 @@
 // Basic component with props
-const Button = ({ color = "blue", size = "md" }) => {
+const Button = ({ color = "primary", size = "md" }) => {
   return Click me;
 };
```

3. Verify the changes:
```json
// Input
{
  "path": "src/components/App.tsx",
  "lineNumbers": [2],
  "context": 1
}

// Output
Line 2:
  1: // Basic component with props
> 2: const Button = ({ color = "primary", size = "md" }) => {
  3:   return Click me;
```

Note that state IDs expire after a short time for security. Attempting to use an expired or invalid state ID will result in an error:
```json
// Input
{
  "stateId": "invalid123"
}

// Output
Error: Invalid or expired state ID
```

### Important Notes

1. Whitespace Handling
   - The tool intelligently handles whitespace in both string and regex matches
   - Original indentation is preserved in replacements
   - Multiple spaces between tokens are normalized for matching

2. Pattern Matching
   - String matches (`strMatch`) are whitespace-normalized
   - Regex patterns (`regexMatch`) support look-ahead and look-behind
   - Cannot use both `strMatch` and `regexMatch` in the same edit
   - Overlapping regex patterns are detected and prevented

3. Best Practices
   - Always use dry run first to verify changes
   - Review the diff output before approving changes
   - Keep edit operations focused and atomic
   - Use appropriate pattern matching for your use case


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