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

- delgermurun.e@erkhettunsh.com
- lkhagvabazar@erkhettunsh.com
- uyanga@erkhettunsh.com
- ulziitsetseg.kh@erkhettunsh.com
- hr@erkhettunsh.com

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

## Approval workflow

The workflow is chosen from the trip type:

**Workflow A — АТҮТ / Нийтийн тээвэр (no mechanic)**
1. Travelers submit the form.
2. Both approvers approve on `/approve` (in any order).
3. One consolidated email goes to the final recipients (`MAIL_TO`).

**Workflow B — every other transport, and every Тэсэлгээний аялал**
1. A mechanic inspects the vehicle on `/mechanic` → "Шинэ үзлэг хийх"
   (the official Авто машин үзлэгийн хуудас; the Тэсэлгээ sheet for
   blasting trips). A passed inspection gets a 6-digit code, valid 24 hours
   and usable once; a failed one gets no code.
2. Travelers enter that code on their form; the inspected vehicle and
   driver fill in and cannot be changed.
3. Both approvers approve on `/approve`.
4. One consolidated email (trip, travelers, inspection, approvals).

Rules the server enforces: no stage can be skipped; each role has its own
password; an approver decides once; any rejection (with a reason) stops the
request; the email is claimed before sending, so it goes out once, and if
delivery fails, `/approve` offers "Имэйл илгээх" to retry. Approvers get an
alert email with a link when a request reaches them. Every step is kept with
its time and person as the request's history, shown on `/approve`.

Forms saved on `/mechanic` before this workflow are still listed there;
once a mechanic inspects one, it goes to the approvers like the rest.

### Storage

Each request is a folder of write-once JSON files in a private Vercel Blob
store (`wf/r/<id>/inspection.json`, `travel.json`, `decision-<n>.json`,
`sent.json`, plus `wf/codes/<code>.json`). The stage is worked out from
which files exist. Locally, the same files go under `.data/workflow`
(`WORKFLOW_STORE_DIR`). Vercel Blob's free Hobby allowance is about 2,000
writes/lists a month; each trip uses about 4 (А) to 6 (B) writes plus page
loads.

### Environment variables

- `MECHANIC_PASSWORD` — shared password for `/mechanic`.
- `APPROVER_1_NAME`, `APPROVER_1_EMAIL`, `APPROVER_1_PASSWORD` — first
  approver (Uyanga).
- `APPROVER_2_NAME`, `APPROVER_2_EMAIL`, `APPROVER_2_PASSWORD` — second
  approver. Both are required; passwords must differ from each other and
  from the mechanic's. Until both are set, forms cannot be submitted.
- `MAIL_TO` — final recipients (defaults in `api/_form-mail.js`).
- `APP_URL` — optional base URL for links in alert emails.
- `MECHANIC_LINK_SECRET` — still needed for forms saved before this
  workflow.
- `BLOB_STORE_ID` — added by connecting the Blob store.

### Testing locally

Set `MAIL_OUTBOX_DIR` to write emails to a local folder (.eml + .html)
instead of sending them; with `npm run dev`, `/outbox` lists them.
`node scripts/test-workflow.mjs` runs both workflows end to end.

## Files

- `api/_form-mail.js` — validation, email template, delivery
- `api/send.js` — Vercel serverless entry point for the form
- `api/mechanic.js` — Vercel entry point for the mechanic's page
- `api/_link-token.js` — signs and verifies the stored form tokens
- `api/_store.js` — the /mechanic list storage (Vercel Blob or a local file)
- `src/MechanicInbox.jsx` — the /mechanic page (new inspections, codes)
- `src/MechanicForm.jsx` — the inspection sheet (new, and for older forms)
- `src/ApprovalPage.jsx` — the /approve page
- `api/_workflow.js` — both workflows, stages, approvals, the final email
- `api/workflow.js` — Vercel entry point for /api/workflow
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
