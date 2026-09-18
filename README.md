# Workflow language experiment

An experimental language for writing instructions to agents. You define the language as you try it. Indentation defines blocks like Python. This version provides syntax checking and formatting, with no compiler or executor.

```text
WORKFLOW Check items:
    FOR EACH item IN my list:
        WHERE the item needs attention
        IF the item is ready:
            DO process the item
        ELSE:
            NOTE why the item is not ready
            STOP RECORD
```

## Try it in Neovim

From this directory, run `npm run editor`. It opens Neovim with the local plugin loaded and `examples/location-sms.workflow` open. Your Neovim configuration is not modified. Node.js 20+ and Neovim with `vim.system` (0.10+) are required; tested on Neovim 0.12.1.

- Live diagnostics check unsaved edits after a 200 ms pause.
- `:WorkflowLint` checks the current buffer immediately.
- `:WorkflowFormat` normalizes indentation and keywords, changing the buffer without saving it.
- `:lua vim.diagnostic.open_float()` shows the error at the cursor.
- Syntax highlighting distinguishes structural keywords, strings, URLs, and comments.
- Open `examples/playground.workflow` for a smaller starting point.

To load it in an existing Neovim session:

```vim
:luafile /Users/josephshomefolder/development/ai-experiments/workflow-language/nvim/workflow.lua
```

The plugin supports files already open, and future `.workflow` buffers. It changes indentation settings only for workflow buffers. It uses Neovim's built-in diagnostics directly; no language-server setup or plugin-manager dependency is needed. It does not add snippets or a custom indent expression yet: indent blocks manually, then use the formatter to normalize spacing.

## Optional VS Code adapter

The original adapter remains available for experimentation. From the project directory:

```sh
code --new-window --extensionDevelopmentPath="$PWD" "$PWD/examples/location-sms.workflow"
```

This opens an Extension Development Host; the extension is not installed globally.

- Edit either example. Errors appear as underlines and in the Problems panel.
- Use **Format Document** (Shift+Option+F on macOS) to normalize indentation and keywords.
- Use completion (Control+Space) for block/step snippets.
- A file with syntax errors is not formatted: fix the Problems entries first.
- Open `examples/playground.workflow` for a smaller starting point.

## Terminal

Node.js 20+; zero runtime dependencies.

```sh
npm test
npm run test:nvim
node cli.js lint examples/location-sms.workflow
node cli.js format examples/playground.workflow
node cli.js format examples/playground.workflow --write
```

Formatting prints to stdout unless `--write` is provided. Use `-` as the filename to read stdin, and `lint - --json` for structured editor diagnostics. `format - --write` is rejected. Exit codes: 0 = success (warnings allowed), 1 = syntax errors, 2 = usage/filesystem error. `npm run lint -- <file>` and `npm run format -- <file>` are shortcuts.

## Syntax v0

| Form | Meaning |
| --- | --- |
| `WORKFLOW name:` | One named workflow per file, in column 1 |
| `USING approach` | A tool or working instruction |
| `FOR EACH record IN source:` | A loop with a single-word record name |
| `WHERE condition` | Optional first direct statement inside a loop |
| `DO action` / `THEN action` | An action; both mean the same thing |
| `IF condition:` | Conditional block |
| `ELSE:` | Alternative immediately after IF, at the same indentation |
| `NOTE destination and message` | Describe what to record and where |
| `STOP RECORD` | End this iteration of the nearest loop; continue with its next record |
| `STOP WORKFLOW` | End the entire workflow |
| `# comment` | Whole-line comment; ignored structurally |

Block headers require a trailing colon and at least one indented statement. Any consistent space indentation is accepted; formatting uses four spaces per level. Tabs are rejected. Keywords are case-insensitive and formatted uppercase. All actions and conditions fit on one line in v0. Inline comments, ELSE IF, functions, declarations, and multiline continuations are not defined yet.

Only the keywords and structure are checked. Everything after DO, THEN, USING, NOTE, WHERE, and IF is natural-language text. Expressions such as `record["Location Code"]`, `===`, and `AND` communicate intent to a reader/agent; they are **not parsed or evaluated** in v0. Names, column spellings, URLs, quotes, predicate truth, contradictory instructions, and SMS recipients are not validated. Syntax-valid does not mean ready to execute.

The full SMS example preserves the provided workflow as a draft. Comments expose its unresolved assumptions: stopping the whole batch, the failure-note column, and the source column spelling. It uses the row's location-code value as the SMS body. No spreadsheet or HubSpot instance was accessed.

## Change the language

- `language.js`: recognized statements, indentation tree, checks, and formatter. Both CLI and editor use it.
- `language.test.js`: intended behavior; start here when changing syntax.
- `extension.js`: live diagnostics, formatting, and completion.
- `cli.js` / `cli.test.js`: terminal behavior.
- `nvim/workflow.lua` / `nvim/test.lua`: Neovim plugin and real headless editor integration tests.
- `open-editor.js`: launches Neovim with the local plugin using absolute paths.
- `workflow.tmLanguage.json` / `language-configuration.json`: highlighting and editor indentation.
- `editor.test.js`: integration checks run inside VS Code's actual extension host.

Re-run the editor tests with isolated VS Code state:

```sh
code --user-data-dir /tmp/workflow-experiment-test-profile --extensions-dir /tmp/workflow-experiment-test-extensions --extensionDevelopmentPath="$PWD" --extensionTestsPath="$PWD/editor.test.js" --disable-workspace-trust --skip-welcome --skip-release-notes
```

The host exits after tests and writes `editor-test-results.json` locally (gitignored). `docs/PLAN.md` records the scope; `docs/RESEARCH.md` records related work. No dependency on those languages.
