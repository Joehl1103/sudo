# Workflow language experiment — v0

The user wants to invent a language, even if it overlaps SudoLang. Indentation defines blocks like Python (explicitly chosen 2026-09-18). This is an authoring experiment, not a compiler or workflow runner.

1. Define a small indentation-based grammar: WORKFLOW, DEFINE / AS, USING, FOR EACH / IN, WHERE, DO, THEN, IF, ELSE, NOTE, STOP.
2. Write behavior tests first. Implement one deterministic parser/linter and formatter shared by a CLI and VS Code extension.
3. Add highlighting, live diagnostics, completion, and document formatting. Provide the user's complete example as a non-executable document.
4. Run core/CLI tests and an actual VS Code extension-host test. Save a local feature commit; no remote publication.

Initial decisions, open to experiment: block headers end in a colon; any consistent space indentation is accepted and formatted to four spaces; tabs are errors; natural-language actions/predicates are opaque; one workflow per file. STOP must explicitly target RECORD or WORKFLOW. No credentials, network calls, generated automation scripts, or external mutations from authored workflows.

Variables use explicit `$UPPERCASE_NAMES` (chosen 2026-09-18). `DEFINE $NAME AS description` introduces an authoring alias after that line in the current block and nested blocks. `FOR EACH $RECORD IN source:` declares a loop-scoped variable. Variables are linted but never evaluated.

Success: edit a .workflow file, see structural errors, format without altering hierarchy or prose, and lint from the terminal. Checks do not claim to prove business logic or external UI state.

## Editor correction

Joseph uses Neovim (explicit correction during implementation). Make Neovim the primary editor: reuse the CLI through stdin/JSON for live diagnostics and formatting, provide buffer-local syntax highlighting and commands, and test in real headless Neovim. Keep user configuration untouched. The original VS Code adapter remains optional.
