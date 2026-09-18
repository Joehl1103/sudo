# Authoring example only. This language has no runner.
# Draft assumption: STOP means stop the entire workflow on the first failure.
# Failure destination is described as the current spreadsheet row; choose its column before execution.
# Confirm the actual column spelling: the original prompt also used "Locaation Code".
WORKFLOW Check location and lead SMS:
    USING jev as a classifier wherever possible
    USING deterministic scripts for repeatable work; pause to write them before performing that work

    FOR EACH record IN https://docs.google.com/spreadsheets/d/1KheV_zivrV3WtNxF7ELbz2LAs51sOtNfWeDGg_Isd1M/edit?gid=0#gid=0:
        WHERE record["SMS Available"] === "No" AND record["Status"] === "Waiting on OWM"

        DO open https://app.hubspot.com/contacts/41356361/objects/2-53624243/views/all/list
        THEN filter Location Code using record["Location Code"]
        THEN open the matching location preview

        IF the LOCATION SMS card appears AND its enabled icon is visible:
            DO open https://app.hubspot.com/contacts/41356361/objects/0-136/views/72725797/board
            THEN set the Dealer Location property to record["Location Code"]
            THEN refresh
            THEN open the lead sidebar

            IF the Lead SMS card appears:
                DO send an SMS with body equal to the value of record["Location Code"]
            ELSE:
                NOTE in the current spreadsheet row: Lead SMS card is missing
                STOP WORKFLOW
        ELSE:
            NOTE in the current spreadsheet row: LOCATION SMS card is missing or not enabled
            STOP WORKFLOW
