const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillDirectory = path.join(__dirname, '.agents', 'skills', 'workflow-planner');

function readSkillFile(relativePath) {
    return fs.readFileSync(path.join(skillDirectory, relativePath), 'utf8');
}

describe('Repository workflow skill', () => {
    test('ships the discoverable skill and its invocation metadata', () => {
        const instructions = readSkillFile('SKILL.md');
        const metadata = readSkillFile(path.join('agents', 'openai.yaml'));

        assert.match(instructions, /^---\nname: workflow-planner\n/m);
        assert.match(instructions, /\ndescription: .+\n---\n/);
        assert.match(metadata, /default_prompt: "Use \$workflow-planner /);
    });

    test('keeps every local documentation link in the skill valid', () => {
        const instructionsPath = path.join(skillDirectory, 'SKILL.md');
        const instructions = fs.readFileSync(instructionsPath, 'utf8');
        const localLinks = [...instructions.matchAll(/\[[^\]]+\]\((?!https?:)([^)#]+)(?:#[^)]+)?\)/g)];

        assert.ok(localLinks.length > 0, 'The skill should ground itself in repository documentation.');

        for (const [, localTarget] of localLinks) {
            const resolvedTarget = path.resolve(path.dirname(instructionsPath), localTarget);

            assert.ok(fs.existsSync(resolvedTarget), `Missing linked skill resource: ${localTarget}`);
        }
    });

    test('teaches the current global workflow and local variable syntax', () => {
        const instructions = readSkillFile('SKILL.md');

        assert.match(instructions, /`@WORKFLOW:` declares/);
        assert.match(instructions, /`DEFINE \$NAME AS description`/);
        assert.match(instructions, /`FOR EACH \$RECORD IN source:`/);
        assert.match(instructions, /`STOP @WORKFLOW`/);
        assert.doesNotMatch(instructions, /`STOP WORKFLOW`/);
        assert.doesNotMatch(instructions, /WORKFLOW @UPPERCASE_NAME/);
    });
});
