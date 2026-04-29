# OT AI Assist

Advisory Open Ticket AI assist plugin.

Runtime actions are private to the requesting staff actor and never post to ticket channels, mutate tickets, write transcripts, or store prompt/output text in audit records. The bundled reference provider registers at startup. If `OT_AI_ASSIST_REFERENCE_API_KEY` and `OT_AI_ASSIST_REFERENCE_MODEL` are missing, requests fail closed with:

`Reference AI provider is not configured on this host`
