# ESwari HRMS: Step 4 (payroll run, payslips, opening balances)

## 1. Update the database (once)
Supabase > SQL Editor > run `supabase/step4.sql` (in the eswari-backend folder). It adds the payroll snapshot columns, opening balances, the private payslip storage, and **replaces the sample statutory rules** with the ones below.

## 2. Add environment variables in Netlify, then redeploy
| Name | Value |
|---|---|
| `SUPABASE_ANON_KEY` | the anon key (new for this step) |
| `COMPANY_NAME` | name printed on payslips |
| `RESEND_API_KEY` and `MAIL_FROM` | optional. Needed only to email payslips (resend.com). Without them, payslips are still created and employees download them in the portal. |

The earlier `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SITE_URL` stay as they are.

## 3. How a payroll month works
1. **Payroll > Calculate** (HR). The engine reads salary, attendance, one-time items, tax declarations and rules. New joiners and leavers are prorated.
2. **Review**: totals, a "vs last month" flag for changes over 10%, and a list of things to check (missing bank or PAN, estimated tax, mid-month salary revisions). Employees with no salary structure are listed as left out.
3. **Approve**: must be a different person from the one who calculated (Finance or a second HR user). Inputs for the month freeze.
4. **Lock**, then **Release** (HR). Each employee gets a PDF protected with their PAN as password, stored privately and emailed if email is set up.
5. Employees see **My payslips**. HR and Finance can download any payslip from the released run.

If you go live in the middle of the year, first use **Import from Excel > Opening balances** so TDS is right.

## Rules used (replace via SQL if your CA says otherwise)
- Income tax: slabs unchanged for FY 2026-27. New regime: standard deduction 75,000, rebate up to 12 lakh taxable income (with marginal relief). Old regime: standard deduction 50,000, rebate up to 5 lakh. 4% cess. Surcharge is not included (you get a warning above 50 lakh).
- PF: 12% on wages up to the 15,000 ceiling. Wages = the higher of basic and 50% of gross, following the labour codes' wage definition.
- ESI: 0.75% employee share, when monthly gross is up to 21,000.
- Tamil Nadu professional tax: slabs are on **half-yearly** income (up to 21,000 nil; 135; 315; 690; 1,025; 1,250 above 75,000). The half-year amount is spread monthly (1,250 becomes 208 a month). Some local bodies deduct it only in two months and the slabs can differ, so confirm with your CA.
- TDS: full-year projection, minus tax already deducted, spread over the months left.

## Not included yet
- Bank payment file, Form 16, PF/ESI challans and statutory reports.
- Correction or supplementary payroll after a lock, and full and final settlement.
- Email bounce tracking (a sent email is marked Sent; bounces need a webhook).
- Leave without pay is not linked to leave requests; enter LOP days under Attendance.

## Tests you can run
`node tests/payroll.test.js` checks the pay and tax calculations (24 checks).
