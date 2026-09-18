const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyze, format } = require('./language');

// Keep fixtures readable: each argument corresponds to one authored source line.
function workflow(...lines) {
    return ['WORKFLOW Example:', ...lines].join('\n') + '\n';
}

function errorCodes(source) {
    return analyze(source).diagnostics.filter(item => item.severity === 'error').map(item => item.code);
}

describe('Indentation and blocks', () => {
    test('accepts nested branches and loops with arbitrary consistent space widths', () => {
        const source = workflow('  FOR EACH record IN spreadsheet:', '    WHERE status equals waiting', '    IF card exists:', '      DO inspect it', '    ELSE:', '      STOP RECORD');
        assert.deepEqual(errorCodes(source), []);
    });

    test('requires a colon and an indented nonempty body', () => {
        assert.ok(errorCodes(workflow('    IF card exists', '        DO inspect')).includes('missing-colon'));
        assert.ok(errorCodes(workflow('    IF card exists:', '    DO inspect')).includes('empty-block'));
        assert.ok(errorCodes('WORKFLOW Empty:\n    # Only a comment\n').includes('empty-block'));
    });

    test('rejects tabs, indentation under actions, and unmatched dedentation', () => {
        assert.ok(errorCodes(workflow('\tDO inspect')).includes('tabs'));
        assert.ok(errorCodes(workflow('    DO inspect', '        DO send')).includes('unexpected-indent'));
        assert.ok(errorCodes(workflow('    IF card exists:', '        DO inspect', '      DO send')).includes('invalid-dedent'));
    });

    test('requires exactly one top-level workflow', () => {
        assert.ok(errorCodes('').includes('workflow-required'));
        assert.ok(errorCodes('DO inspect\n').includes('workflow-required'));
        assert.ok(errorCodes('  WORKFLOW Example:\n    DO inspect\n').includes('root-indent'));
        assert.ok(errorCodes(workflow('    DO inspect') + workflow('    DO send')).includes('workflow-count'));
    });

    test('rejects orphan and duplicate ELSE while ignoring intervening comments', () => {
        assert.ok(errorCodes(workflow('    ELSE:', '        DO inspect')).includes('orphan-else'));
        const valid = workflow('    IF ready:', '        DO inspect', '    # The failure branch', '    ELSE:', '        DO record');
        assert.deepEqual(errorCodes(valid), []);
        assert.ok(errorCodes(valid + '    ELSE:\n        DO retry\n').includes('orphan-else'));
    });
});

describe('Workflow checks', () => {
    test('catches unknown keywords and empty natural-language instructions', () => {
        assert.ok(errorCodes(workflow('    THNE inspect')).includes('unknown-statement'));
        assert.ok(errorCodes(workflow('    DO')).includes('missing-text'));
        assert.ok(errorCodes(workflow('    IF :', '        DO inspect')).includes('missing-text'));
        assert.ok(errorCodes(workflow('    FOR EACH record:', '        DO inspect')).includes('invalid-loop'));
    });

    test('requires WHERE to be the first direct statement of a loop', () => {
        assert.ok(errorCodes(workflow('    WHERE ready')).includes('where-position'));
        assert.ok(errorCodes(workflow('    FOR EACH record IN sheet:', '        DO inspect', '        WHERE ready')).includes('where-position'));
    });

    test('makes stop scope explicit and requires a loop for STOP RECORD', () => {
        assert.ok(errorCodes(workflow('    STOP')).includes('stop-scope'));
        assert.ok(errorCodes(workflow('    STOP RECORD')).includes('record-outside-loop'));
        assert.deepEqual(errorCodes(workflow('    STOP WORKFLOW')), []);
    });

    test('warns about vague conditions and directly unreachable actions', () => {
        const source = workflow('    IF THIS IS TRUE:', '        STOP WORKFLOW', '        DO send SMS');
        const warnings = analyze(source).diagnostics.filter(item => item.severity === 'warning');
        assert.ok(warnings.some(item => item.code === 'vague-condition'));
        assert.ok(warnings.some(item => item.code === 'unreachable'));
    });

    test('leaves business predicates, quotes, URLs, and action prose uninterpreted', () => {
        const source = workflow('    DO open https://example.com/#section', '    IF status === "Waiting" AND the icon looks enabled:', '        NOTE customer\'s text contains: IF, ELSE, and STOP');
        assert.deepEqual(errorCodes(source), []);
    });

    test('accepts the complete sample without diagnostics', () => {
        const sample = fs.readFileSync(path.join(__dirname, 'examples/location-sms.workflow'), 'utf8');
        assert.deepEqual(analyze(sample).diagnostics, []);
    });
});

describe('Formatting preserves intent', () => {
    test('normalizes keyword case and indentation without changing prose', () => {
        const source = 'workflow Example:\r\n  if card exists:\r\n    do send "a  b" to https://example.com/#here  \r\n  else:\r\n    note leave Case ALONE\r\n';
        const expected = workflow('    IF card exists:', '        DO send "a  b" to https://example.com/#here', '    ELSE:', '        NOTE leave Case ALONE');
        assert.equal(format(source), expected);
        assert.equal(format(expected), expected);
    });

    test('keeps comments in their original block and preserves blank lines', () => {
        const source = workflow('  IF ready:', '    # Nested comment', '', '    DO send', '  # Outer comment', '  DO record');
        const expected = workflow('    IF ready:', '        # Nested comment', '', '        DO send', '    # Outer comment', '    DO record');
        assert.equal(format(source), expected);
    });

    test('refuses malformed files instead of guessing their hierarchy', () => {
        assert.throws(() => format(workflow('    DO inspect', '        DO send')), /syntax errors/i);
    });
});
