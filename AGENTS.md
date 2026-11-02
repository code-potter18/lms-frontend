# Fusion Starter

A production-ready full-stack React application template with integrated Express server, featuring React Router 6 SPA mode, TypeScript, Vitest, Zod and modern tooling.

While the starter comes with a express server, only create endpoint when strictly neccesary, for example to encapsulate logic that must leave in the server, such as private keys handling, or certain DB operations, db...

## Tech Stack

- **NPM**: Use npm (`npm install`, commit `package-lock.json`); do not use pnpm or yarn
- **Frontend**: React 18 + React Router 6 (spa) + TypeScript + Vite + TailwindCSS 3
- **Backend**: Express server integrated with Vite dev server
- **Testing**: Vitest
- **UI**: Radix UI + TailwindCSS 3 + Lucide React icons

## Project Structure

```
client/                   # React SPA frontend
├── pages/                # Route components (Index.tsx = home)
├── components/ui/        # Pre-built UI component library
├── App.tsx                # App entry point and with SPA routing setup
└── global.css            # TailwindCSS 3 theming and global styles

server/                   # Express API backend
├── index.ts              # Main server setup (express config + routes)
└── routes/               # API handlers

shared/                   # Types used by both client & server
└── api.ts                # Example of how to share api interfaces
```

## Key Features

## SPA Routing System

The routing system is powered by React Router 6:

- `client/pages/Index.tsx` represents the home page.
- Routes are defined in `client/App.tsx` using the `react-router-dom` import
- Route files are located in the `client/pages/` directory

For example, routes can be defined with:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";

<Routes>
  <Route path="/" element={<Index />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>;
```

### Styling System

- **Primary**: TailwindCSS 3 utility classes
- **Theme and design tokens**: Configure in `client/global.css` 
- **UI components**: Pre-built library in `client/components/ui/`
- **Utility**: `cn()` function combines `clsx` + `tailwind-merge` for conditional classes

```typescript
// cn utility usage
className={cn(
  "base-classes",
  { "conditional-class": condition },
  props.className  // User overrides
)}
```

### Express Server Integration

- **Development**: Single port (8080) for both frontend/backend
- **Hot reload**: Both client and server code
- **API endpoints**: Prefixed with `/api/`

#### Example API Routes
- `GET /api/ping` - Simple ping api
- `GET /api/demo` - Demo endpoint  

### Shared Types
Import consistent types in both client and server:
```typescript
import { DemoResponse } from '@shared/api';
```

Path aliases:
- `@shared/*` - Shared folder
- `@/*` - Client folder

## Development Commands

```bash
npm run dev        # Start dev server (client + server)
npm run build      # Production build
npm run preview    # Preview the production build
npm run typecheck  # TypeScript validation
npm test           # Run Vitest tests
```

## Adding Features

### Add new colors to the theme

Open `client/global.css` and `tailwind.config.ts` and add new tailwind colors.

### New API Route
1. **Optional**: Create a shared interface in `shared/api.ts`:
```typescript
export interface MyRouteResponse {
  message: string;
  // Add other response properties here
}
```

2. Create a new route handler in `server/routes/my-route.ts`:
```typescript
import { RequestHandler } from "express";
import { MyRouteResponse } from "@shared/api"; // Optional: for type safety

export const handleMyRoute: RequestHandler = (req, res) => {
  const response: MyRouteResponse = {
    message: 'Hello from my endpoint!'
  };
  res.json(response);
};
```

3. Register the route in `server/index.ts`:
```typescript
import { handleMyRoute } from "./routes/my-route";

// Add to the createServer function:
app.get("/api/my-endpoint", handleMyRoute);
```

4. Use in React components with type safety:
```typescript
import { MyRouteResponse } from '@shared/api'; // Optional: for type safety

const response = await fetch('/api/my-endpoint');
const data: MyRouteResponse = await response.json();
```

### New Page Route
1. Create component in `client/pages/MyPage.tsx`
2. Add route in `client/App.tsx`:
```typescript
<Route path="/my-page" element={<MyPage />} />
```

## Production Deployment

- **Standard**: `npm run build`
- **Binary**: Self-contained executables (Linux, macOS, Windows)
- **Cloud Deployment**: Use either Netlify or Vercel via their MCP integrations for easy deployment. Both providers work well with this starter template.

## Architecture Notes

- Single-port development with Vite + Express integration
- TypeScript throughout (client, server, shared)
- Full hot reload for rapid development
- Production-ready with multiple deployment options
- Comprehensive UI component library included
- Type-safe API communication via shared interfaces

## Project Layout (HMS-specific)

### Frontend (`HMS_Project/`) — React 18 + TS + Vite + TailwindCSS 3.4 + React Router 7 + TanStack Query 5
- **API layer**: `client/api/` — Axios instance at `axios.ts`, JWT interceptor, base URL from `VITE_BACKEND_URL`
- **Forms**: `client/components/Forms/` — `AddBranch`, `EditBranch`, `Addemployee`, `PatientRegistrationForm`, `EditPatientForm`, `EditDoctorForm`, `AddAppointment`, `AppointmentBooking`, `patientProfile`
- **UI components**: `client/components/ui/` (56 shadcn-style Radix components) + `client/components/hms/` (domain-specific)
- **Key custom components**: `FormDropdown` (searchable), `MultiSelectDropdown`, `AvatarUpload` (base64), `CountryStateCitySelect`, `BranchSelector`, `QuickAddFab`
- **Routing**: Protected routes in `AppLayout` (sidebar: Dashboard, Staff, Doctor, Patients, Appointment, Billing, Protocol)

### Backend (`HMS_Backend/`) — Express 5 + TS + Prisma ORM 7 + PostgreSQL (Supabase)
- **Architecture**: Routes → Controllers → Services → Repositories → Prisma
- **Auth**: JWT (8h expiry), bcrypt, role-based authorization
- **Modules**: auth, branch, employee, patient, appointment, encounter, department, chemotherapy
- **Database**: 34 models, hosted on Supabase
- **Note**: Doctor routes, prescription routes, and doctor-schedule routes are currently disabled/commented out

## Changes Made (Session Log)

### 1. EditBranch Wiring (BranchSelector.tsx)
- Changed edit button from inline dialog to navigation: `navigate("/branches/edit/:id")`
- Removed unused inline edit Dialog (state, handlers, JSX)
- Added `useNavigate` import

### 2. Addemployee.tsx — Specialization from Departments
- Removed hardcoded `specializations` arrays from all `ROLE_CONFIG` entries
- Specialization dropdown now populated from `departments` list (department names)
- When department selected, specialization auto-fills with department name

### 3. Addemployee.tsx — Time Format
- Changed `TIME_OPTIONS` label from `"9:00 AM"` → `"09:00 AM"` (leading zero for hours)

### 4. Addemployee.tsx — Branch Width
- Branch section changed from default grid column to `lg:col-span-2`

### 5. Addemployee.tsx — Photo URL
- `employee_photo_URL: formData.photoUrl || undefined` sent in create payload
- `photo?: string` added to `CreateEmployeePayload` in `employee.api.ts`

### 6. Addemployee.tsx — Dropdown Overflow
- Card wrapper changed from `overflow-hidden` to `overflow-clip` to prevent dropdown clipping

### 7. employee.api.ts — Type Alignment
- Added `"STAFF"` to `CreateEmployeePayload.role_type` union
- Renamed `GetEmployeesParams` fields: `role_type`→`roleType`, `branch_id`→`branchId`, `department_id`→`department` (matching backend camelCase params)

### 8. Addemployee.tsx — Admin Role (Replaces Receptionist)
- `toDisplayRole`: `"RECEPTIONIST"` → `"Admin"`
- `toBackendRole`: `"Admin"` → `"RECEPTIONIST"`
- `ROLE_CONFIG`: Renamed `Receptionist` → `Admin` with designations `["Branch Admin", "Staff Admin", "Receptionist"]`
- Department dropdown shows `[{ label: "All Departments", value: "__ALL__" }]` when Admin is selected
- Submit handles `__ALL__` by falling back to first department ID
- Added `ALL_DEPARTMENTS_VALUE = "__ALL__"` sentinel
### 8. Allow appointment booking on week-offs and leave days (unless CANCEL)
 - Backend (HMS_Backend-main/src/modules/appointment/appointment.service.ts): validateBookingContext now allows off-day/leave bookings when no CANCEL change exists; bookAppointment/updateAppointment skip pickScheduleForTime when isOffDayBooking=true; getAvailableSlots returns is_cancelled flag.
 - Frontend (HMS_Project/client): AddAppointment.tsx shows free-time input on week-off/leave days; doctor dropdown includes LEAVE doctors labeled (On Leave); Edit Appointment.tsx same handling. CANCEL changes remain absolute priority.

### 9. Fix "No active encounter found" on doctor patient-consultation
 - Root cause: encounter lookup queried by branchId/patientId/status; backend branchScope forced every query through the active x-branch-id header/param, so a branch mismatch (or multi-branch doctor with no selection) returned empty/403 on all retries and 403s were swallowed as generic "not found".
 - Backend (HMS_Backend-main): GET /api/encounters now supports an appointmentId filter (types/controller/repository); duplicate route mounts removed from server.ts (/api/appointments, /api/encounters, /api/prescriptions, /api/chemotherapy, /api/lab-order-item, /api/doctors were mounted twice - prescriptions/chemotherapy three times).
 - Frontend: navigation to /doctor/patient-consultation now passes appointmentId in location.state (doctor/Dashboard.tsx row click + Proceed button, doctor/AppointmentPage.tsx handleProceed); Patientconsut.tsx findActiveEncounter tries the exact appointment_id lookup first, fallback retries send requests with new per-request skipBranchScope axios flag (axios.ts interceptor skips x-branch-id) so branchScope auto-scopes single-branch doctors, and real 403 scope errors are surfaced instead of generic message; LabReview/DischargeMedication receive appointmentId prop for their resolve-encounter paths.
 - client/api/encounter.api.ts: GetEncountersParams.employeeId renamed to doctorId (backend-honored param); getAll accepts optional AxiosRequestConfig. Checkout flows passing {appointmentId} to getAll now filter correctly instead of receiving every encounter in scope.
 - Follow-up: multi-branch doctors with no branch selected still got 403 "Please select a branch first" on every scoped query (branchScope runs before filters, POST /encounters has no branchScope which is why check-in worked). Added GET /api/encounters/by-appointment/:appointmentId (authenticate + encounter.read, NO branchScope; service checks caller's ACTIVE user_branch_mapping against the encounter's branch, top-level admins bypass) wired through encounterApi.getByAppointment as findActiveEncounter step 0.
 - Follow-up 2: hardened remaining scoped-path holes in Patientconsut.tsx findActiveEncounter - step 0 now treats a by-appointment 404 as "not created yet" and directly POSTs the encounter then re-verifies via getByAppointment (no scoped list calls); self-heal post-create verification also uses getByAppointment instead of scoped getAll; nav state carries branchId (doctor/Dashboard row-click + Proceed: selectedBranchId || getActiveBranchId() || first active schedule branch; doctor/AppointmentPage handleProceed: getActiveBranchId() || user.branch_id) and fallback queries send it as an explicit param so branchScope validates-and-passes for multi-mapped doctors; "Please select a branch first." errors append "(or pick your branch from the selector in the header)". LabReview/DischargeMedication take branchId prop.

### 10. Fix encounters not creating from doctor dashboard ("Please select a branch first." shown instead of real cause)
 - Root cause 1: POST /encounters (encounter.service.ts createEncounter) hard-threw "Appointment has no associated doctor schedule"/"Doctor schedule is not active"; appointments can lose their original schedule after booking (schedule OVERRIDE/CANCEL closes old schedules via old_schedule_id/closing_schedule_ids). Guards removed; transaction now writes nullable schedule_id: appointment.schedule_id (encounter.schedule_id was already BigInt? in schema.prisma, no migration needed).
 - Root cause 2: Patientconsut.tsx findActiveEncounter swallowed the create error with empty catch blocks, so failed creation fell through to scoped list queries whose 403s surfaced as "Please select a branch first." Now collects createErrors (backend response.data.message, ignoring "already exists") and the final scopeError prefers createErrors[0] over scope fallout; BRANCH_HINT appended only when the message matches /select a branch/i.
 - Root cause 3: Dashboard.tsx handleCheckIn called appointmentApi.updateStatus(IN_CONSULTATION) BEFORE encounterApi.create; on creation failure the appointment stayed stuck in-progress with no encounter. Premature updateStatus removed (createEncounter's transaction already flips status + inserts CHECKIN notification); "Encounter already exists" treated as check-in success. Unused appointmentApi import removed.
 - Dashboard.tsx handleCheckOut switched from scoped encounterApi.getAll({appointmentId}) to branch-independent encounterApi.getByAppointment so checkout cannot 403 multi-branch doctors with no selection.

### 11. Fix "Check-in failed: ...already NOT_CHECKED_IN" on doctor dashboard/Appointments
 - Root cause: appointment-status.job.ts auto-flips SCHEDULED/RESCHEDULED appointments to NOT_CHECKED_IN once the consultation window elapses (startup + every 5 min) to free slots, but the UI deliberately keeps a Check In button for those rows (Dashboard.tsx:964 SCHEDULED||RESCHEDULED||NOT_CHECKED_IN, AppointmentPage.tsx CHECKIN_STATUSES:632) while encounter.service.ts createEncounter treated NOT_CHECKED_IN as TERMINAL and threw "Cannot create an encounter for an appointment that is already NOT_CHECKED_IN" - so every past-slot today appointment failed check-in deterministically.
 - Backend (HMS_Backend-main/src/modules/encounter/encounter.service.ts): terminal-status guard now excludes APPOINTMENT_STATUS.NOT_CHECKED_IN from blockingStatuses enabling late check-in; CANCELLED/NO_SHOW/COMPLETED still blocked; transaction flips status to IN_CONSULTATION.
 - AppointmentPage.tsx handleCheckIn: removed premature appointmentApi.updateStatus(IN_CONSULTATION) before encounterApi.create (same stranded-state bug fixed in Dashboard in #10); "Encounter already exists" treated as success. appointmentApi import kept (still used by reschedule/cancel flows).
 - Follow-up: first real check-in after the guard fix crashed with misleading Prisma "Argument `branch` is missing" - actual cause was encounter_type: null in the create payload (service sent appointment.Patient_type! but Patient_type is String? on appointment_history and the late-checked-in appointment had null; encounter.encounter_type is non-nullable @default("OPD") in schema.prisma). Latent until #11 because such appointments never reached encounter creation before. Fixed with encounter_type: appointment.Patient_type ?? ENCOUNTER_TYPE_DEFAULT (constant was already imported unused; value matches column default). No migration needed.
 - NOTE: backend runs via `npm run dev` = ts-node src/server.ts with NO hot-reload - backend edits require manual restart or they never go live (this bit twice).

### 12. Scheduled.tsx restored from backup.tsx + HMS restyle
 - Restored logic dropped when the redesigned page came in: ScheduleSlotModal mount (Add/Edit/Delete slot flows were dead without it), Pending Transfer dialog (affected appointments + Transfer/Reschedule-queue/Cancel actions + replacement doctor select), Leave Confirm / Leave Success / Leave Conflicts AlertDialogs.
 - Fixed missing Sun icon import (compile error); removed dead custom-calendar leftovers (calendarDays/MONTH_NAMES/buildCalendarDays/previousMonth/nextMonth/toggledDates/parseDate/isSameDay), unused icons and DepartmentPill/StatusBadge imports; removed unused todaySlots/isSlotsLoading fetch effect (appointmentApi import dropped with it).
 - alert() replaced with useToast toasts; error paths pass variant destructive.
 - HMS design pass: Manrope + #F7F9FB bg, cards rounded-xl border #E5E7EB shadow-sm, primary buttons #004785 hover #003A6B active:scale-[0.98], accents #00488D/#D6E3FF, hovers #F2F4F6, segmented Day/Week tab control, grid header de-gradiented, day-column mini buttons invert on hover, slot blocks semantic green/blue/orange with hover lift + press scale, Availability header shows weekChanges spinner, Available/Unavailable pill driven by doctorIsAvailable. Ported dialogs styled to match ConfirmationDialog look.
 - CalendarPicker From/To onSelect guarded with instanceof Date (DateRange union fix).

### 13. Vitals popup scoping + full action-menu wiring (Appointments / Dashboard / patientProfile)
 - AppointmentActionMenu now owns its vitals popover state internally (vitalsOpen/onVitalsOpenChange props deleted); previously ONE shared page-level boolean opened every "In Consultation" row's popover simultaneously, each bound to a different encounter.
 - New onVitalsSaved prop -> VitalsSignsPopover onSaved fires after successful create/update; parents (Appointments/Dashboard/patientProfile) refetch their lists so updated vitals show instantly.
 - VitalsSignsPopover prefill switched from branch-scoped GET /encounters?appointmentId to the mapping-checked GET /encounters/by-appointment/:id (exact single encounter, no 403s when no branch selected).
 - Dashboard cancel fixed: it omitted cancelled_by, which cancelAppointmentValidation hard-requires -> every dashboard cancel returned 400 "Cancelled by is required". Now sends logged-in employee_id like Appointments.tsx.
 - patientProfile menu fully wired (was stubs): real Check In (updateStatus + encounterApi.create + refetch), Check Out (encounterApi.getByAppointment + close + refetch), and persisting Cancel via appointmentApi.cancel + refetch (was local-state-only). ConfirmationDialog loading prop wired. PatientVitalsPanel remounts via version key after saves/cancellations so the side card refreshes immediately.

### 14. Auto-cancel job for elapsed appointment days (backend)
 - New HMS_Backend/HMS_Backend/src/jobs/appointment-status.job.ts: sweeps SCHEDULED/RESCHEDULED appointments whose appointment_date is strictly before today(IST) and flips them to CANCELLED with cancelled_at=now(), cancelled_by="Auto cancelled", cancel_reason="Auto-cancelled: appointment day has passed", notification_status=NOT_REQUIRED - identical write shape to the manual cancel flow so audit consumers cannot distinguish handling.
 - IST day boundary via the same fixed UTC+5:30 offset convention as AddAppointment.tsx; single batched updateMany scoped ONLY to those two statuses (terminal + in-clinical + workflow-flag states are filtered out and can never be touched); re-entrancy guard; startup run self-heals missed days, then every 5 min (interval.unref).
 - Wired in server.ts before app.listen. Backend restart required to activate (ts-node has no hot reload). Frontend needs no changes - CANCELLED already blocks actions, releases Assigned Doctor on Patients, and frees slots.
### 12. Latest vitals on patient-details pages (encounters/latest wiring)
 - Backend already had GET /api/encounters/latest?patientId=&limit= (HMS_Backend-main/src/modules/encounter/encounter.routes.ts:50, NO branchScope; service scopes to caller's ACTIVE user_branch_mapping, top-level admins see all, zero mappings -> empty array). It had zero frontend consumers.
 - client/api/encounter.api.ts: added encounterApi.getLatest(patientId, limit?) wrapper.
 - PatientVitalsPanel.tsx: replaced getAll({patientId,limit:100})+client-side sort with getLatest(patientId,10) (response already newest-first) - fixes multi-branch empty/403 results.
 - patient details.tsx: new shared hook useLatestPatientVitals(patientId) fetches latest encounter + newest chemo-cycle vitals (BSA source) + adverse-event count in one effect; merges per-field encounter-first with chemo fallback. Consumed by HMSPatientPortal header vitals strip (was hardcoded "—") and DischargeDetailsPortal (header strip + Final Vital Signs cards + reaction count), replacing duplicated inline logic.
 - Branch-scope resilience fixes after 403 report on /doctor/patient-details: loadNextAppointment/loadSavedPlan/loadLatestChemoPlan retry /chemotherapy/plans WITHOUT the sticky x-branch-id header (per-request skipBranchScope flag in axios.ts) because the old retry only dropped the branchId PARAM while the interceptor kept sending the header -> identical 403. Hook falls back from getLatest to scoped encounterApi.getAll({patientId}) when empty/failed; silent catches now console.error the backend response message for diagnosability.
 - Follow-up: "Encounter vitals fallback failed: Please select a branch first." after refresh - root cause was a STALE BACKEND PROCESS (started 10:31, /latest route edited 11:43+, ts-node no hot-reload), so the running server still served the old scope-wrapped/shadowed /latest. Backend restarted (kill :5000 owner, detached pnpm dev). Hardening added: hook falls through to scoped fallback also when getLatest returns EMPTY (not just on failure); hook exposes scopeHint when any error matches /select a branch|branch has been assigned/i and both portals render an amber banner nudging the user to pick a branch in the header selector.
 - Follow-up 2: loadNextAppointment STILL 403'd after restart ("Please select a branch first.") - by design: branchScope hard-rejects any multi-mapped user with NO selection, and /doctor/patient-details renders OUTSIDE AppLayout where the only BranchSelector lives, so there was no way to pick a branch on that page. Fix: PatientDetails now wraps HMSPatientPortal in BranchFilterProvider; new inline <select> InlineBranchPicker (uses real selectBranch -> localStorage + x-branch-id sync) embedded in both portals' amber banners; selectedBranchId threaded into useLatestPatientVitals (new scopeKey arg) and the saved-plan/next-appointment/discharge effect deps so every loader auto-refetches on switch; expected scope-blocks in next-appointment log as console.warn instead of error.
 - Follow-up 3: "Next appointment skipped: Please select a branch first." warn appeared even AFTER picking a branch - the skipBranchScope retry ran whenever attempt 1 yielded NO PLAN, including legitimate empty results (patient has no chemo plan), and the header-less retry from a multi-branch account can never pass branchScope. Fixed: retry fires only when attempt 1 actually THREW; empty-success -> quiet setNextAppointment(null); expected scope-blocks are fully silent (banner+picker communicate), genuine failures stay console.error.
 - Follow-up 4: browser still logged red 403s on GET /chemotherapy/plans (attempt pairs from loadSavedPlan/loadNextAppointment/loadLatestChemoPlan) while no branch was picked - network-line logging can't be suppressed client-side, so the endpoint itself had to stop rejecting. Added mapping-scoped GET /api/chemotherapy/plans/latest-for-patient?patient_id= (HMS_Backend-main chemotherapy routes/controller/service/repository, mirrors encounter /latest: authenticate + chemo.plan.read, NO branchScope; top-level admins all branches, others ACTIVE user_branch_mapping, zero mappings -> data:null). All three loaders now funnel through one clean call via rewritten loadLatestChemoPlan; skipBranchScope retry scaffolding removed. Backend restarted to pick it up. scopeHint banner/picker kept for genuinely scoped endpoints (staging-details chain).

### 13. Shared vitals utils + derived-BSA fallback
 - New client/utils/vitals.ts: computeBsa (Mosteller, sqrt(h_cm*w_kg/3600), 2dp) and computeBmi (kg/m^2, 1dp); both null-safe on missing/non-positive inputs.
 - useLatestPatientVitals: bsa now falls back to computeBsa(heightValue, weightValue) when no recorded chemotherapy body_surface_area exists (recorded value wins) - BSA populates in both portals' header strips for encounter-only patients. Stale "BSA chemo-only" comments updated.
 - Patientconsut.tsx buildMeasurements deduped onto computeBsa/computeBmi (identical output formatting preserved).

### 14. Pharmacy Slip popup on Discharge Medication (cycle-day brand/dosage/quantity)
 - Button top-right above the Discharge Medication table opens `PharmacySlipModal` (client/pages/doctor/consultation/PharmacySlipModal.tsx). Rows = the current cycle x / day x Chemotherapy Order (PRIMARY, PREMEDICATION, SUPPORTIVE, POSTMEDICATION) plus the Discharge Medication table rows; DILUTION/ADVICE are excluded. Columns exactly No., Drug Name, Drug Form, Patient Dosage, Brand Name, Dosage, Quantity, Type, with continuous numbering across the base line and its top-up line.
 - Pure logic in client/pages/doctor/consultation/pharmacySlip.ts (+ pharmacySlip.spec.ts, 27 tests): brand options from pharmacy_master matched on the ordered medicine_master.generic_id + dosage_form (fallback generic, then medicine_id), unit-aware dose parsing (mg/g/mcg/ml/IU), and the quantity allocation - selected strength >= patient dose -> 1; otherwise the smallest-overshoot smaller strength tops it up (TC2 30x1, TC3 20x2); a brand with nothing smaller folds into the selected row (TC4 120x2). Quantity counts units of the selected strength, never whole packs; the doctor can override either line and reset to the suggestion.
 - Backend: POST /api/pharmacy/slips/from-order upserts the live DRAFT slip of one explicit cycle day by plan_order_id (ISSUED is rejected as read-only, CANCELLED frees the slot); GET /api/pharmacy/slips/by-order restores it; GET /api/pharmacy/master-items now also accepts generic_ids and is branch-scoped to the active branch plus the shared null-branch catalog. New columns pharmacy_slip_item.dosage_form / patient_dose (prisma/sql/20261031_pharmacy_slip_item_dosage.sql, executed).
 - DischargeMedication rows carry drugForm + genericId so the popup can show the form and list the generic's brands; Summary.tsx's printed slip gained the same Drug Form / Patient Dosage columns.
