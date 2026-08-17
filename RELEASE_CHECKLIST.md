# Catalyst Release Candidate — End-to-End QA

Run `sql/catalyst_release_backend.sql` in Supabase before testing the frontend.

## 1. Authentication & preferences
- [ ] Head of People can sign in.
- [ ] TA can sign in.
- [ ] Manager can sign in.
- [ ] ES/EN changes the interface and survives refresh.
- [ ] Light/Dark changes the interface and survives refresh.

## 2. Requisition → Job
- [ ] Manager creates and submits a requisition.
- [ ] Head of People sees the submitted requisition.
- [ ] Return requires notes and manager can see returned status.
- [ ] Reject requires notes.
- [ ] Approve requires recruiter, pipeline, target fill date and priority.
- [ ] Approval creates and links a Job exactly once.

## 3. Job → Candidate
- [ ] Job detail opens from Jobs.
- [ ] TA can add a new candidate to an open Job.
- [ ] Existing candidate email/phone is reused instead of duplicated.
- [ ] Duplicate active application for the same candidate + Job is not created.

## 4. Candidate → Pipeline
- [ ] Candidate detail opens from Candidates and Pipeline.
- [ ] Candidate appears in the Job's configured first stage.
- [ ] Drag/drop between stages updates Supabase.
- [ ] Stage movement creates `application_events`.
- [ ] Required feedback prevents forward movement until feedback is saved.

## 5. Interviews & feedback
- [ ] TA can schedule an interview.
- [ ] Rescheduling updates the same application + stage interview.
- [ ] Interview can be marked completed, no-show or cancelled.
- [ ] Score / decision / notes can be saved for the current stage.

## 6. Offer → Hire
- [ ] TA creates an offer with version 1.
- [ ] TA submits offer for approval.
- [ ] Head of People approves the offer.
- [ ] TA marks the offer sent.
- [ ] A revised offer creates a new version without overwriting the previous version.
- [ ] Accepted offer automatically creates a Hire and marks the application hired.

## 7. Impulse provisioning
- [ ] Head of People provisions an accepted Hire to Impulse.
- [ ] A unique CX employee ID is generated using Impulse's existing counter.
- [ ] Re-running provisioning does not create a duplicate employee.
- [ ] New employee starts as inactive.
- [ ] Mark Started activates the Impulse employee and records actual start date.

## 8. Dashboard / Onboarding / Analytics
- [ ] Dashboard contains no hardcoded candidate/job data.
- [ ] Needs Attention is derived from live ownership/dates/application data.
- [ ] Recent Activity comes from `application_events`.
- [ ] Onboarding shows actual Hires.
- [ ] People Analytics uses actual requisitions, applications, offers, hires and candidate sources.

## 9. Permissions
- [ ] Manager cannot access Candidates, Pipeline, Offers, Onboarding or People Analytics.
- [ ] Manager only sees permitted requisitions/jobs through RLS.
- [ ] TA cannot approve requisitions or approve offers as Head of People.
- [ ] Head of People can complete the full workflow.

## 10. Release smoke test
Use one disposable test candidate and execute:

Requisition → Approval → Job → Candidate → Stage Movement → Interview → Feedback → Offer → Approval → Sent → Accepted → Hire → Impulse Provisioning → Started.

Do not launch to the full team until every step above passes with the expected database state.
