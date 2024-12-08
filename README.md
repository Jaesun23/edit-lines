# edit-file-lines MCP Server

A TypeScript-based MCP server that provides tools for making precise line-based edits to text files within allowed directories.

## Features

### Tools
#### `edit_file_lines`
Make line-based edits to a file. Replace one or more entire lines with new content.

Example usage:
```json
{
  "p": "file.txt",
  "e": [
    [
      5, 7, "new line 1\nnew line 2"
    ]
  ],
  "dryRun": false
}
```

#### `get_file_lines`
Get information about specific line numbers in a file, including their content and optional context lines.

Example usage:
```json
{
  "path": "file.txt",
  "lineNumbers": [1, 2, 3],
  "context": 2
}
```

### Common Features
All editing tools:
- Operate only within allowed directories for security
- Return git-style diffs showing the changes made
- Support `dryRun` mode to preview changes without applying them
- Handle line endings consistently across platforms
- Validate inputs and provide clear error messages

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

For Testing:
```bash
npm run test
```

## Usage

The server requires one or more allowed directories to be specified when starting:

```bash
node build/index.js <allowed-directory> [additional-directories...]
```

All file operations will be restricted to these directories for security.

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
      ]
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

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
