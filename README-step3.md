# ESwari HRMS: Step 3 (salary, attendance, leave, tax declaration)

No database changes needed. Redeploy the updated `index.html` the same way as step 2.

## New screens
| Who | Tab | What it does |
|---|---|---|
| HR Admin | **Salary** | Set or revise each employee's basic, HRA and allowances, with PF/ESI/PT switches and an effective date. Old revisions stay in History. |
| HR Admin | **Attendance** | Pick a month, enter loss-of-pay days per employee, add bonus, arrears or other one-time items. Approved months are frozen. |
| HR Admin | **Import from Excel** | New toggle: **Salary structures**. Download template, fill (Y/N for PF, ESI, PT), upload, review errors by row, import. |
| Everyone | **My leave** | Apply for leave and see the status of past requests. |
| Manager, HR | **Leave approvals** | Approve or reject requests (managers: their team). Nobody can approve their own leave. |
| Everyone | **Tax declaration** | Choose old or new regime. Old regime also takes 80C, 80D, home loan interest and rent. |

## Quick live check after deploying
1. As HR: Salary > set a salary for a test employee. Attendance > save LOP days for last month.
2. As that employee: apply for leave, and save a tax declaration.
3. As their manager: approve the leave.

## Not yet included
- Leave balances and holiday calendar (leave days are counted as calendar days).
- HR view of employees' tax declarations (the data is saved and HR can already read it in the database).
- The payroll run itself, with preview, approval and payslips: that is step 4.
