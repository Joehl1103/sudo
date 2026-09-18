# Change indentation, remove a colon, or misspell a keyword to try the diagnostics.
WORKFLOW My experiment:
    USING plain language for actions and conditions

    FOR EACH item IN my list:
        WHERE the item needs attention

        IF the item is ready:
            DO process the item
            THEN record the result
        ELSE:
            NOTE why the item is not ready
            STOP RECORD
