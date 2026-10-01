# Simple Company Travel Form

A React + Vite travel safety form. On submit, the form is emailed to the
company recipients with the uploaded signature embedded in the message.

## Run
```bash
npm install
cp .env.local.example .env.local   # then fill in credentials
npm run dev
```

## Email delivery

Submitting POSTs to `/api/send`, which mails the form to:

- it@gkllc.mn
- admin@gkllc.mn
- share@gkllc.mn

Override the list with `MAIL_TO` (comma-separated) if needed.

The signature image is sent both as an inline image in the email body and as
an attachment (`garyn-useg.*`), so it stays visible even in clients that block
inline images.

### Providers

Configured in `.env.local`:

- **Company SMTP** (default) — `gkllc.mn` mail is hosted by mail.mn, so
  `SMTP_HOST=smtp.mail.mn` on port 587 (STARTTLS). Use `smtp.mail.mn`
  rather than `smtp.gkllc.mn`: they are the same server, but the
  certificate only covers `*.mail.mn`, so the `gkllc.mn` name fails TLS
  hostname verification. Fill in `SMTP_USER` and `SMTP_PASS` with the
  mailbox that sends the form. If port 587 is blocked on the network, use
  `SMTP_PORT=465` with `SMTP_SECURE=true`.
- **Resend** (fallback) — used only when `SMTP_HOST` is empty. Requires the
  `gkllc.mn` domain to be verified in Resend.

Set the same variables in the Vercel project settings for production;
`.env.local` is not deployed.

## Files

- `api/_form-mail.js` — validation, email template, delivery
- `api/send.js` — Vercel serverless entry point
- `vite.config.js` — serves the same handler locally during `npm run dev`

## Google Drive PDF archive (optional)

After sending the email, the server can automatically generate a PDF copy of
the submitted form and upload it into a monthly folder in Google Drive.

Environment variables to enable this feature:


Notes:
Environment variables to enable this feature (OAuth2):

- `GOOGLE_CLIENT_ID` — OAuth client ID from Google Cloud Console.
- `GOOGLE_CLIENT_SECRET` — OAuth client secret from Google Cloud Console.
- `GOOGLE_REFRESH_TOKEN` — long-lived refresh token obtained by authorizing the OAuth client for a Google account that has access to the parent Drive folder.
- `GOOGLE_DRIVE_FOLDER_ID` — the Drive folder ID where year/month folders are created (parent). Defaults to `1eo0sL-_KWR175y9z31cyKQiv_kvgeoKh`.

Notes:
- The OAuth client and refresh token allow the server to obtain access tokens and upload files without service account keys.
- Share the parent Drive folder with the Google account that the refresh token belongs to (Editor access), or use the same account that owns the folder.
- When these variables are set, the server will upload the generated PDF into `Year/MonthName/` (e.g. `2026/September/Travel_Request_...pdf`) using the `Asia/Ulaanbaatar` timezone to determine the year and month.
- If the Drive upload fails the API will return a clear error and a `500` response. Email delivery still occurs, but the client will receive an error response so you can detect upload problems.
