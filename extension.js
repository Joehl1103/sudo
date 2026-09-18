const vscode = require('vscode');
const { analyze, format } = require('./language');

const LANGUAGE_ID = 'workflow-experiment';
const SNIPPETS = [
    ['WORKFLOW', 'WORKFLOW ${1:name}:\n    $0', 'Name the workflow. Its steps are indented.'],
    ['DEFINE', 'DEFINE \\$${1:NAME} AS ${2:description}', 'Give a descriptive value a reusable variable name.'],
    ['FOR EACH', 'FOR EACH \\$${1:RECORD} IN ${2:source}:\n    $0', 'Process records; the loop variable exists only inside this loop.'],
    ['WHERE', 'WHERE ${1:condition}', 'Filter records. Put this first inside FOR EACH.'],
    ['IF', 'IF ${1:condition}:\n    $0', 'Indent the steps to take when the condition is true.'],
    ['ELSE', 'ELSE:\n    $0', 'Alternative branch immediately after IF, at the same indentation.'],
    ['DO', 'DO ${1:action}', 'Describe an action in plain language.'],
    ['THEN', 'THEN ${1:action}', 'Describe the next action; equivalent to DO.'],
    ['USING', 'USING ${1:tool or approach}', 'Describe the tools or working approach.'],
    ['NOTE', 'NOTE ${1:destination and message}', 'Describe what should be recorded and where.'],
    ['STOP RECORD', 'STOP RECORD', 'Stop this record and continue with the next record in the nearest loop.'],
    ['STOP WORKFLOW', 'STOP WORKFLOW', 'Stop the entire workflow.'],
];

// Translate the shared one-based diagnostic positions to editor ranges.
function updateDiagnostics(document, collection) {
    if (document.languageId !== LANGUAGE_ID) {
        collection.delete(document.uri);
        return;
    }
    const result = analyze(document.getText());
    const diagnostics = result.diagnostics.map(item => {
        const lineIndex = item.line - 1;
        const columnIndex = item.column - 1;
        const lineEnd = document.lineAt(lineIndex).text.length;
        const range = new vscode.Range(lineIndex, columnIndex, lineIndex, Math.max(columnIndex + 1, lineEnd));
        let severity = vscode.DiagnosticSeverity.Error;
        if (item.severity === 'warning') {
            severity = vscode.DiagnosticSeverity.Warning;
        }
        const diagnostic = new vscode.Diagnostic(range, item.message, severity);
        diagnostic.code = item.code;
        diagnostic.source = 'Workflow Experiment';
        return diagnostic;
    });
    collection.set(document.uri, diagnostics);
}

// The editor adapter only reads/writes document text. It never runs workflow steps.
function activate(context) {
    const collection = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
    const output = vscode.window.createOutputChannel('Workflow Experiment');
    output.appendLine('Authoring tools activated. Workflow execution is not implemented.');
    context.subscriptions.push(collection, output);

    for (const document of vscode.workspace.textDocuments) {
        updateDiagnostics(document, collection);
    }
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => updateDiagnostics(document, collection)),
        vscode.workspace.onDidChangeTextDocument(event => updateDiagnostics(event.document, collection)),
        vscode.workspace.onDidCloseTextDocument(document => collection.delete(document.uri)),
        vscode.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, {
            provideDocumentFormattingEdits(document) {
                try {
                    const formatted = format(document.getText());
                    const range = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
                    return [vscode.TextEdit.replace(range, formatted)];
                } catch (error) {
                    output.appendLine(error.message);
                    return [];
                }
            },
        }),
        vscode.languages.registerCompletionItemProvider(LANGUAGE_ID, {
            provideCompletionItems(document, position) {
                const prefix = document.lineAt(position.line).text.slice(0, position.character);
                if (!/^\s*[A-Za-z ]*$/.test(prefix)) {
                    return [];
                }
                return SNIPPETS.map(([label, snippet, explanation]) => {
                    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
                    item.insertText = new vscode.SnippetString(snippet);
                    item.documentation = explanation;
                    return item;
                });
            },
        }),
    );
}

module.exports = { activate };
