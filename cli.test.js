const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Exercise the real CLI against isolated files, including failed write attempts.
function withFixture(source, action) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-cli-'));
    const filename = path.join(directory, 'example.workflow');
    fs.writeFileSync(filename, source);
    try {
        action(filename);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

function run(...argumentsList) {
    return spawnSync(process.execPath, [path.join(__dirname, 'cli.js'), ...argumentsList], { encoding: 'utf8' });
}

describe('Command line authoring', () => {
    test('reports line numbers and fails lint on invalid structure', () => {
        withFixture('WORKFLOW Example:\n    ELSE:\n        DO inspect\n', filename => {
            const result = run('lint', filename);
            assert.equal(result.status, 1);
            assert.match(result.stdout, /:2:5.*orphan-else/);
        });
    });

    test('formats to stdout by default and writes only with --write', () => {
        const original = 'workflow Example:\n  do inspect\n';
        withFixture(original, filename => {
            const preview = run('format', filename);
            assert.equal(preview.status, 0);
            assert.equal(fs.readFileSync(filename, 'utf8'), original);
            assert.equal(preview.stdout, 'WORKFLOW Example:\n    DO inspect\n');
            assert.equal(run('format', filename, '--write').status, 0);
            assert.equal(fs.readFileSync(filename, 'utf8'), preview.stdout);
        });
    });

    test('does not modify invalid files', () => {
        const original = 'WORKFLOW Example:\n    IF ready:\n';
        withFixture(original, filename => {
            assert.equal(run('format', filename, '--write').status, 1);
            assert.equal(fs.readFileSync(filename, 'utf8'), original);
        });
    });

    test('fails with usage errors for absent files and unknown options', () => {
        assert.equal(run('lint').status, 2);
        assert.equal(run('lint', '/nonexistent/example.workflow').status, 2);
        assert.equal(run('format', 'example.workflow', '--mystery').status, 2);
    });
});
