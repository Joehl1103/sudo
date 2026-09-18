# Change indentation, remove a colon, or misspell a keyword to try the diagnostics.
WORKFLOW My experiment:
    USING plain language for actions and conditions

    FOR EACH $ITEM IN my list:
        WHERE $ITEM needs attention

        IF $ITEM is ready:
            DO process $ITEM
            THEN record the result
        ELSE:
            NOTE why $ITEM is not ready
            STOP RECORD
