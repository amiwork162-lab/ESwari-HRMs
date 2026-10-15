# ESwari HRMS: Step 2 (real login, employee list, Excel import, invites)

## Before you start
Step 1 done: Supabase project created, `schema.sql` run, first HR admin created.

## 1. Connect the page to Supabase
Open `config.js` and paste your **Project URL** and **anon key** (Project Settings > API). Never paste the service_role key here.

## 2. Deploy on Netlify (needs the function, so not drag-and-drop)
Easiest: put this folder in a GitHub repo, then Netlify > Add new site > Import from Git. Netlify installs the function's package and deploys it.
(Or with the Netlify CLI: `npm i -g netlify-cli`, then `netlify deploy --prod` in this folder.)

## 3. Add three environment variables in Netlify
Site settings > Environment variables:
| Name | Value |
|---|---|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key (secret, server only) |
| `SITE_URL` | your Netlify site address, e.g. `https://eswari.netlify.app` |

Then redeploy.

## 4. Tell Supabase your site address
Authentication > URL Configuration: set **Site URL** to the same `SITE_URL`, and add it under Redirect URLs. Also enable **MFA (TOTP)** under Authentication settings.

## 5. First run
1. Sign in as the HR admin. You are asked to scan a QR code with an authenticator app (one time), then enter the code.
2. **People > Add employee**, or **Import from Excel**: download the template, fill it, upload. Mistakes are listed by Excel row. Nothing is saved until you click Import.
3. Click **Send login invites**. Each employee gets an email, sets a password (10+ characters) and signs in. Managers and employees need no MFA; HR Admin and Finance do.

## Who sees what
Employee: own record only. Manager: self and direct reports (no pay, bank or PAN). HR Admin and Finance: everyone, after MFA. All enforced by the database rules from step 1.

## Known limits (next steps)
- Salary structures, attendance, leave and payroll screens come next; this step covers people and login.
- Invite emails come from Supabase's built-in sender, which is rate-limited. Add your own email service (SMTP) in Supabase before inviting more than a few people.
- Tested with a simulated Supabase. Do a short live check after deploying: sign in as HR, import 2 test rows, invite a test employee, sign in as that employee.
