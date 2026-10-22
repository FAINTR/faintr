# Optional FAINTR support

All website tools remain free. `/supporters/` is generated during every website build.

Set repository variable `FAINTR_SUPPORT_URL` only after the FAINTR Patreon page is published and its copy no longer offers paid website access. Until then the website's Support FAINTR button opens the real supporters page, which explains that Patreon is being prepared instead of sending visitors to an unpublished page.

## Public recognition

The list in `web/supporters.json` begins empty. Do not invent names or import Patreon accounts automatically. Verify a recognition request and record consent privately before adding a chosen display name:

```json
{"supporters":[{"name":"Chosen display name","publicRecognition":true}]}
```

Only names with `publicRecognition: true` are published. Do not add emails, billing details, payment amounts, or other identifying fields. A name can represent financial support or another acknowledged contribution to the project. Honor changes and removals. Keep contributions voluntary; recognition is never required to use a tool.

For Patreon, describe the actual arrangement: no software access purchase, all tools free, optional public recognition. Do not claim a tier has no benefits for tax purposes if recognition is promised as a paid benefit. No tax-deductible charitable contribution or third-party IP clearance is promised.
