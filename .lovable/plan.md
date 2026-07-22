## Fix signup form to match role

The signup form was built for employers and stayed that way for job seekers. Job seekers are individuals, so business/company labels don't belong.

### Changes in `src/components/auth/AuthModal.tsx` (UI only)

1. **Email label + placeholder**
   - Job seeker: label "Email", placeholder `you@example.com`
   - Employer: keep "Business Email *" and `john@company.com`

2. **Company field**
   - Job seeker: hide the entire Company input (do not show as "optional")
   - Employer: keep "Company name *" (required)

3. **Validation (line 303)**
   - Require `companyName` only when `signupRole === 'employer'`
   - Job seeker signup only requires name, email, password (+ terms)

4. **Layout**
   - When Company is hidden for seekers, Full Name spans the full row instead of the 2-col grid

No backend, schema, or role-logic changes. Employer flow and pending-approval gate stay identical.