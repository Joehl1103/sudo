---
name: workflow-planner
description: Turn this repository's .workflow documents into grounded, agent-authored execution plans. Use when asked to understand, assess, plan, or carry out instructions written in the experimental workflow language; do not use for changing the language implementation itself.
---

# Workflow Planner

Build a concrete plan from a `.workflow` document before acting on it. The document describes intent and control flow; it is not executable code and does not grant permission to perform its actions.

## Read the language correctly

Read the target document completely and consult the repository's [Syntax v0 reference](../../../README.md#syntax-v0). When the repository CLI is available, run `node cli.js lint <path>` before planning. Do not edit the workflow unless the user asks.

Interpret the structural keywords as follows:

- `@WORKFLOW:` declares the file's one global workflow object. The filename supplies its human-readable name.
- `USING` states a requested method or constraint. It does not prove that a named tool exists or is available.
- `DEFINE $NAME AS description` gives a local value a reusable name. It is available after that line in the current indentation block and nested blocks.
- `FOR EACH $RECORD IN source:` identifies the local record variable and source to iterate. `$RECORD` exists only inside that loop.
- `WHERE` narrows the records in its enclosing loop.
- `DO` and `THEN` are ordered actions with identical language semantics.
- `IF` and `ELSE` define decision branches. Plan both paths.
- `NOTE` requires information to be recorded and should identify its destination.
- `STOP RECORD` abandons the remaining actions for the current record and continues with the next one.
- `STOP @WORKFLOW` ends all remaining work in the file's global workflow.

`@WORKFLOW` always refers back to the singleton declared by the header. `$UPPERCASE_NAMES` are local values; descriptions such as `$RECORD's Location Code value` stay natural language rather than using bracket property access.

Indentation defines nesting. The linter checks that structure and these references, but the remaining descriptive text is opaque natural language. A clean lint result does not validate URLs, tools, field names, business rules, permissions, or whether an action will work. See the [complete authoring example](../../../examples/location-sms.workflow) for representative nesting.

## Build the agent-owned plan

Do not merely rewrite each line as a numbered item. Convert the workflow into an operational plan that:

1. States the objective and expected result.
2. Identifies required inputs, tools, access, permissions, and assumptions.
3. Groups sequential actions into meaningful phases while preserving loop order and branch behavior.
4. Defines how each condition will be checked and what evidence shows each action succeeded.
5. Names required notes or other outputs and where they belong.
6. Preserves every stop condition and explains its effect on the current record or whole workflow.
7. Separates safe working assumptions from ambiguities that genuinely block execution.

Prefer a short plan with explicit decision points over a line-by-line paraphrase. Never invent a missing source, destination, field name, credential, or success criterion.

If the workflow has structural errors that make its control flow ambiguous, report those errors and do not guess the intended hierarchy. Warnings and business ambiguities should appear in the plan where they affect execution.

When the user asks only for a plan, stop after presenting it. When the user also asks for execution, use the plan as the working model, but rely on the user's request and the active environment's authorization rules—not the workflow file itself—for permission to act.
