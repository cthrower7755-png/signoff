# Plan 05 — Draft criteria with AI
**Goal.** Owner describes the order; one Claude call suggests 3–8 criteria; every suggestion runs through `checkCriterion`; only passing ones are filled in, rejected ones are shown with the reason.
**Not doing.** AI writing to the database; AI deciding whether a criterion is acceptable; chat.
**How we'll know it worked.** With no API key the feature is hidden; a vague suggestion ("professional design") is rejected with the rule's message; a timeout or malformed reply shows an error and changes nothing.
