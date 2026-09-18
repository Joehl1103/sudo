const fs = require('node:fs');
const { analyze, format } = require('./language');

// Lint is read-only. Formatting writes only when explicitly requested.
function main(argumentsList) {
    const [command, filename, ...options] = argumentsList;
    const validCommand = command === 'lint' || command === 'format';
    const validFormatOption = command === 'format' && options.length === 1 && options[0] === '--write';
    const validLintOption = command === 'lint' && options.length === 1 && options[0] === '--json';
    const validOptions = options.length === 0 || validFormatOption || validLintOption;
    const writesStdin = filename === '-' && options.includes('--write');
    if (!validCommand || !filename || !validOptions || writesStdin) {
        console.error('Usage: node cli.js lint <file|-> [--json] | format <file|-> [--write]');
        return 2;
    }

    let source;
    try {
        let sourcePath = filename;
        if (filename === '-') {
            sourcePath = 0;
        }
        source = fs.readFileSync(sourcePath, 'utf8');
    } catch (error) {
        console.error(`Cannot read ${filename}: ${error.message}`);
        return 2;
    }

    const result = analyze(source);
    if (command === 'lint') {
        const errors = result.diagnostics.filter(item => item.severity === 'error').length;
        if (options.includes('--json')) {
            console.log(JSON.stringify({ diagnostics: result.diagnostics }));
            if (errors > 0) {
                return 1;
            }
            return 0;
        }
        for (const diagnostic of result.diagnostics) {
            console.log(`${filename}:${diagnostic.line}:${diagnostic.column} ${diagnostic.severity} [${diagnostic.code}] ${diagnostic.message}`);
        }
        const warnings = result.diagnostics.length - errors;
        console.log(`${errors} error(s), ${warnings} warning(s). Structure checked; prose is not evaluated.`);
        if (errors > 0) {
            return 1;
        }
        return 0;
    }

    let formatted;
    try {
        formatted = format(source);
    } catch (error) {
        console.error(error.message);
        return 1;
    }
    if (options.includes('--write')) {
        try {
            fs.writeFileSync(filename, formatted);
            console.error(`Formatted ${filename}`);
        } catch (error) {
            console.error(`Cannot write ${filename}: ${error.message}`);
            return 2;
        }
    } else {
        process.stdout.write(formatted);
    }
    return 0;
}

process.exitCode = main(process.argv.slice(2));
