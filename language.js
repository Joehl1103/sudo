const BLOCK_KEYWORDS = new Set(['WORKFLOW', 'FOR EACH', 'IF', 'ELSE']);
const KEYWORD_PATTERN = /^(FOR\s+EACH|WORKFLOW|USING|WHERE|DO|THEN|IF|ELSE|NOTE|STOP)(?=\s|:|$)/i;

// Diagnostics use one-based positions so the CLI and editor share one contract.
function report(diagnostics, line, code, message, severity = 'error') {
    diagnostics.push({
        line: line.number,
        column: line.indent + 1,
        code,
        message,
        severity,
    });
}

// Only the fixed prefix is parsed. Action text and predicates remain opaque prose.
function parseStatement(line, diagnostics) {
    const match = line.text.match(KEYWORD_PATTERN);
    if (!match) {
        report(diagnostics, line, 'unknown-statement', 'Start with DO, THEN, IF, ELSE, FOR EACH, WHERE, USING, NOTE, or STOP.');
        return { ...line, keyword: '', body: line.text, block: false, children: [] };
    }

    const keyword = match[1].replace(/\s+/g, ' ').toUpperCase();
    const block = BLOCK_KEYWORDS.has(keyword);
    let body = line.text.slice(match[0].length).trim();
    if (block) {
        if (!body.endsWith(':')) {
            report(diagnostics, line, 'missing-colon', `${keyword} opens a block and must end with a colon.`);
        } else {
            body = body.slice(0, -1).trim();
        }
    }

    if (keyword === 'ELSE') {
        if (body !== '') {
            report(diagnostics, line, 'else-text', 'Write ELSE: without a condition. Nest another IF inside it if needed.');
        }
    } else if (keyword === 'STOP') {
        body = body.toUpperCase();
        if (body !== 'RECORD' && body !== 'WORKFLOW') {
            report(diagnostics, line, 'stop-scope', 'Choose STOP RECORD or STOP WORKFLOW.');
        }
    } else if (body === '') {
        report(diagnostics, line, 'missing-text', `${keyword} needs descriptive text.`);
    }

    if (keyword === 'FOR EACH') {
        const loop = body.match(/^([A-Za-z_]\w*)\s+IN\s+(.+)$/i);
        if (!loop) {
            report(diagnostics, line, 'invalid-loop', 'Write FOR EACH record IN source:');
        } else {
            body = `${loop[1]} IN ${loop[2]}`;
        }
    }

    if (keyword === 'IF' && /^(THIS|IT) IS (TRUE|FALSE|YES|NO)$/i.test(body)) {
        report(diagnostics, line, 'vague-condition', 'Name the condition so its meaning survives edits.', 'warning');
    }

    return { ...line, keyword, body, block, children: [] };
}

// Attach a line to the suite selected by its indentation; never repair bad nesting.
function chooseFrame(node, frames, previous, diagnostics) {
    let frame = frames[frames.length - 1];
    if (node.indent > frame.indent) {
        if (!previous || !previous.block) {
            report(diagnostics, node, 'unexpected-indent', 'Only a block header ending in : can introduce indentation.');
        } else {
            frame = { indent: node.indent, owner: previous, children: previous.children };
            frames.push(frame);
        }
    } else {
        while (frames.length > 1 && node.indent < frame.indent) {
            frames.pop();
            frame = frames[frames.length - 1];
        }
        if (node.indent !== frame.indent) {
            report(diagnostics, node, 'invalid-dedent', 'Dedent to an existing outer indentation level.');
        }
    }
    return frame;
}

// Comments do not open/close suites. Their whitespace selects the nearest scope.
function commentDepth(line, frames, previous) {
    if (previous && previous.block && line.indent > previous.indent) {
        return previous.depth + 1;
    }
    for (let index = frames.length - 1; index >= 0; index -= 1) {
        if (line.indent >= frames[index].indent) {
            return index;
        }
    }
    return 0;
}

// These checks use the indentation tree; they do not evaluate business conditions.
function checkStructure(node, frame, frames, diagnostics) {
    const siblings = frame.children;
    const previousSibling = siblings[siblings.length - 1];
    if (node.keyword === 'WORKFLOW' && frame.owner) {
        report(diagnostics, node, 'nested-workflow', 'WORKFLOW belongs at the top level.');
    }
    if (!frame.owner && node.keyword !== 'WORKFLOW') {
        report(diagnostics, node, 'outside-workflow', 'Indent this statement inside a WORKFLOW.');
    }
    if (node.keyword === 'ELSE' && (!previousSibling || previousSibling.keyword !== 'IF')) {
        report(diagnostics, node, 'orphan-else', 'ELSE must immediately follow an IF block at the same indentation.');
    }
    if (node.keyword === 'WHERE' && (!frame.owner || frame.owner.keyword !== 'FOR EACH' || siblings.length !== 0)) {
        report(diagnostics, node, 'where-position', 'WHERE must be the first statement directly inside FOR EACH.');
    }
    const insideLoop = frames.some(item => item.owner && item.owner.keyword === 'FOR EACH');
    if (node.keyword === 'STOP' && node.body === 'RECORD' && !insideLoop) {
        report(diagnostics, node, 'record-outside-loop', 'STOP RECORD needs an enclosing FOR EACH loop.');
    }
    if (siblings.some(item => item.keyword === 'STOP')) {
        report(diagnostics, node, 'unreachable', 'This statement follows STOP in the same block.', 'warning');
    }
}

// Build a small tree and retain source-line metadata for loss-minimizing formatting.
function analyze(source) {
    const diagnostics = [];
    const roots = [];
    const statements = [];
    const lines = [];
    const frames = [{ indent: 0, owner: null, children: roots }];
    const sourceLines = source.replace(/\r\n?/g, '\n').split('\n');
    let previous = null;

    for (let index = 0; index < sourceLines.length; index += 1) {
        const raw = sourceLines[index];
        const whitespace = raw.match(/^\s*/)[0];
        const line = { number: index + 1, indent: whitespace.length, text: raw.trim(), depth: 0 };
        if (line.text === '') {
            lines.push({ ...line, kind: 'blank' });
            continue;
        }
        if (whitespace.includes('\t')) {
            report(diagnostics, line, 'tabs', 'Use spaces for indentation; tabs are ambiguous.');
        }
        if (line.text.startsWith('#')) {
            line.depth = commentDepth(line, frames, previous);
            lines.push({ ...line, kind: 'comment' });
            continue;
        }

        const node = parseStatement(line, diagnostics);
        if (!previous && node.indent !== 0) {
            report(diagnostics, node, 'root-indent', 'The WORKFLOW header must begin in column 1.');
        }
        const frame = chooseFrame(node, frames, previous, diagnostics);
        node.depth = frames.length - 1;
        checkStructure(node, frame, frames, diagnostics);
        frame.children.push(node);
        statements.push(node);
        lines.push({ ...node, kind: 'statement' });
        previous = node;
    }

    for (const node of statements) {
        if (node.block && node.children.length === 0) {
            report(diagnostics, node, 'empty-block', `${node.keyword} needs at least one indented statement.`);
        }
    }
    const workflows = roots.filter(node => node.keyword === 'WORKFLOW');
    const firstLine = { number: 1, indent: 0 };
    if (workflows.length === 0) {
        report(diagnostics, firstLine, 'workflow-required', 'Start the document with WORKFLOW name:');
    } else if (workflows.length > 1) {
        report(diagnostics, workflows[1], 'workflow-count', 'Use one WORKFLOW per file.');
    }
    diagnostics.sort((first, second) => first.line - second.line || first.column - second.column);
    return { roots, lines, diagnostics };
}

// Formatting only succeeds when hierarchy is unambiguous. Prose stays unchanged.
function format(source) {
    const result = analyze(source);
    if (result.diagnostics.some(item => item.severity === 'error')) {
        throw new Error('Fix syntax errors before formatting; indentation determines meaning.');
    }
    const output = result.lines.map(line => {
        if (line.kind === 'blank') {
            return '';
        }
        const indentation = '    '.repeat(line.depth);
        if (line.kind === 'comment') {
            return indentation + line.text;
        }
        let text = line.keyword;
        if (line.body !== '') {
            text += ' ' + line.body;
        }
        if (line.block) {
            text += ':';
        }
        return indentation + text;
    });
    while (output.length > 0 && output[output.length - 1] === '') {
        output.pop();
    }
    return output.join('\n') + '\n';
}

module.exports = { analyze, format };
