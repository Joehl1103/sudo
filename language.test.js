const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyze, format } = require('./language');

// Keep fixtures readable: each argument corresponds to one authored source line.
function workflow(...lines) {
    return ['WORKFLOW @EXAMPLE:', ...lines].join('\n') + '\n';
}

function errorCodes(source) {
    return analyze(source).diagnostics.filter(item => item.severity === 'error').map(item => item.code);
}

describe('Indentation and blocks', () => {
    test('accepts nested branches and loops with arbitrary consistent space widths', () => {
        const source = workflow('  FOR EACH $RECORD IN spreadsheet:', '    WHERE $RECORD needs attention', '    IF the card exists:', '      DO inspect $RECORD', '    ELSE:', '      STOP RECORD');
        assert.deepEqual(errorCodes(source), []);
    });

    test('requires a colon and an indented nonempty body', () => {
        assert.ok(errorCodes(workflow('    IF card exists', '        DO inspect')).includes('missing-colon'));
        assert.ok(errorCodes(workflow('    IF card exists:', '    DO inspect')).includes('empty-block'));
        assert.ok(errorCodes('WORKFLOW @EMPTY:\n    # Only a comment\n').includes('empty-block'));
    });

    test('rejects tabs, indentation under actions, and unmatched dedentation', () => {
        assert.ok(errorCodes(workflow('\tDO inspect')).includes('tabs'));
        assert.ok(errorCodes(workflow('    DO inspect', '        DO send')).includes('unexpected-indent'));
        assert.ok(errorCodes(workflow('    IF card exists:', '        DO inspect', '      DO send')).includes('invalid-dedent'));
    });

    test('requires exactly one top-level workflow', () => {
        assert.ok(errorCodes('').includes('workflow-required'));
        assert.ok(errorCodes('DO inspect\n').includes('workflow-required'));
        assert.ok(errorCodes('  WORKFLOW @EXAMPLE:\n    DO inspect\n').includes('root-indent'));
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
        assert.ok(errorCodes(workflow('    DEFINE $MESSAGE')).includes('invalid-definition'));
        assert.ok(errorCodes(workflow('    FOR EACH record IN spreadsheet:', '        DO inspect')).includes('invalid-loop'));
    });

    test('requires WHERE to be the first direct statement of a loop', () => {
        assert.ok(errorCodes(workflow('    WHERE ready')).includes('where-position'));
        assert.ok(errorCodes(workflow('    FOR EACH $RECORD IN sheet:', '        DO inspect $RECORD', '        WHERE ready')).includes('where-position'));
    });

    test('makes stop scope explicit and requires a loop for STOP RECORD', () => {
        assert.ok(errorCodes(workflow('    STOP')).includes('stop-scope'));
        assert.ok(errorCodes(workflow('    STOP WORKFLOW')).includes('stop-scope'));
        assert.ok(errorCodes(workflow('    STOP THIS WORKFLOW')).includes('stop-scope'));
        assert.ok(errorCodes(workflow('    STOP RECORD')).includes('record-outside-loop'));
        assert.deepEqual(errorCodes(workflow('    STOP @EXAMPLE')), []);
    });

    test('warns about vague conditions and directly unreachable actions', () => {
        const source = workflow('    IF THIS IS TRUE:', '        STOP @EXAMPLE', '        DO send SMS');
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

describe('Workflow symbols', () => {
    test('links downstream references to the workflow declared by the header', () => {
        const source = workflow('    NOTE progress on @EXAMPLE', '    STOP @EXAMPLE');

        assert.deepEqual(errorCodes(source), []);
    });

    test('requires an uppercase workflow symbol and rejects unknown references', () => {
        assert.ok(errorCodes('WORKFLOW Example:\n    DO inspect\n').includes('invalid-workflow-name'));
        assert.ok(errorCodes('WORKFLOW @example:\n    DO inspect\n').includes('invalid-workflow-name'));
        assert.ok(errorCodes(workflow('    DO notify @OTHER')).includes('undefined-workflow'));
    });

    test('does not mistake an email address for a workflow reference', () => {
        assert.deepEqual(errorCodes(workflow('    DO email joseph@example.com')), []);
    });
});

describe('Variables', () => {
    test('uses explicit definitions and loop variables in their enclosing scopes', () => {
        const source = workflow(
            '    DEFINE $SOURCE AS the records to inspect',
            '    FOR EACH $RECORD IN $SOURCE:',
            '        DEFINE $STATUS AS $RECORD\'s Status value',
            '        IF $STATUS equals "Waiting":',
            '            DO process $RECORD',
        );

        assert.deepEqual(errorCodes(source), []);
    });

    test('rejects variables used before their definition or outside their scope', () => {
        const source = workflow(
            '    DO send $MESSAGE',
            '    DEFINE $MESSAGE AS the message body',
            '    IF the message is ready:',
            '        DEFINE $RECIPIENT AS the customer phone number',
            '        DO send $MESSAGE to $RECIPIENT',
            '    DO notify $RECIPIENT',
        );
        const undefinedVariables = analyze(source).diagnostics.filter(item => item.code === 'undefined-variable');

        assert.equal(undefinedVariables.length, 2);
        assert.equal(undefinedVariables[0].line, 2);
        assert.equal(undefinedVariables[1].line, 7);
    });

    test('keeps a loop variable inside that loop', () => {
        const source = workflow(
            '    FOR EACH $ITEM IN my list:',
            '        DO process $ITEM',
            '    DO process $ITEM again',
        );
        const undefinedVariables = analyze(source).diagnostics.filter(item => item.code === 'undefined-variable');

        assert.equal(undefinedVariables.length, 1);
        assert.equal(undefinedVariables[0].line, 4);
    });

    test('rejects duplicate definitions and names that are not uppercase', () => {
        const source = workflow(
            '    DEFINE $MESSAGE AS the first message',
            '    DEFINE $MESSAGE AS the replacement message',
            '    DEFINE $recipient AS the phone number',
            '    DO send $MESSAGE',
        );
        const codes = errorCodes(source);

        assert.ok(codes.includes('duplicate-variable'));
        assert.ok(codes.includes('invalid-variable-name'));
    });

    test('warns when a defined variable is never referenced', () => {
        const source = workflow('    DEFINE $MESSAGE AS the message body', '    DO finish');
        const warnings = analyze(source).diagnostics.filter(item => item.severity === 'warning');

        assert.ok(warnings.some(item => item.code === 'unused-variable'));
    });
});

describe('Formatting preserves intent', () => {
    test('normalizes keyword case and indentation without changing prose', () => {
        const source = 'workflow @EXAMPLE:\r\n  define $MESSAGE as "a  b"\r\n  if card exists:\r\n    do send $MESSAGE to https://example.com/#here  \r\n  else:\r\n    note leave Case ALONE\r\n';
        const expected = workflow('    DEFINE $MESSAGE AS "a  b"', '    IF card exists:', '        DO send $MESSAGE to https://example.com/#here', '    ELSE:', '        NOTE leave Case ALONE');
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
