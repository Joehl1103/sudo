const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

// Poll only while waiting for VS Code's asynchronous document-change events.
async function waitFor(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error('Timed out waiting for editor diagnostics.');
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

// Executed inside a real extension host, not against a mock of the VS Code API.
async function run() {
    const results = [];
    const reportPath = path.join(__dirname, 'editor-test-results.json');
    try {
        const extension = vscode.extensions.getExtension('local-experiments.workflow-language-experiment');
        assert.ok(extension, 'The extension must be discoverable.');
        await extension.activate();

        const document = await vscode.workspace.openTextDocument({
            language: 'workflow-experiment',
            content: 'WORKFLOW Example:\n    ELSE:\n        DO inspect\n',
        });
        const editor = await vscode.window.showTextDocument(document);
        await waitFor(() => vscode.languages.getDiagnostics(document.uri).some(item => item.code === 'orphan-else'));
        results.push('Opening a malformed workflow publishes orphan-else diagnostics.');

        const invalidEdits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', document.uri, { tabSize: 4, insertSpaces: true });
        assert.ok(!invalidEdits || invalidEdits.length === 0, 'Invalid documents must produce no edits.');
        results.push('The formatter refuses malformed indentation/structure.');

        await editor.edit(builder => {
            builder.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), 'workflow Example:\n  do inspect\n');
        });
        await waitFor(() => vscode.languages.getDiagnostics(document.uri).length === 0);
        results.push('Editing the workflow clears stale diagnostics.');

        const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', document.uri, { tabSize: 4, insertSpaces: true });
        assert.ok(edits && edits.length > 0, 'A valid unformatted document must produce edits.');
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, edits);
        assert.equal(await vscode.workspace.applyEdit(workspaceEdit), true);
        assert.equal(document.getText(), 'WORKFLOW Example:\n    DO inspect\n');
        results.push('Format Document applies canonical indentation and keywords.');

        const completions = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, new vscode.Position(1, 4));
        assert.ok(completions.items.some(item => item.label === 'IF'));
        results.push('Completion offers workflow snippets.');

        const example = await vscode.workspace.openTextDocument(path.join(__dirname, 'examples/location-sms.workflow'));
        assert.equal(example.languageId, 'workflow-experiment');
        assert.deepEqual(vscode.languages.getDiagnostics(example.uri), []);
        results.push('The .workflow extension selects the language for the full example.');
        fs.writeFileSync(reportPath, JSON.stringify({ passed: true, results }, null, 2) + '\n');
    } catch (error) {
        fs.writeFileSync(reportPath, JSON.stringify({ passed: false, results, error: error.stack }, null, 2) + '\n');
        throw error;
    }
}

module.exports = { run };
