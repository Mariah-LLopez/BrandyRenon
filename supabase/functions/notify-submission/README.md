# notify-submission

Required Supabase function secrets:

- `RESEND_API_KEY`
- `NOTIFY_FROM_EMAIL` (verified sender)
- `NOTIFY_TO_EMAIL` (set to your notification inbox, for example `your-admin-email@domain.com`)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `NOTIFY_TO_SMS` (set to your destination number, for example `+1234567890`)

Deploy:

```bash
supabase functions deploy notify-submission
```
