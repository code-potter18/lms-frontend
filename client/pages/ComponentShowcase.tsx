import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, X } from "lucide-react";

// Input Components
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import VoiceToText from "@/components/ui/voicetotext";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import TimepickerWheel from "@/components/ui/timepicker-wheel";
import { ComboInput } from "@/pages/doctor/patient-details/ComboInput";
import DateInputField from "@/pages/doctor/consultation/DateInputField";

// Dropdown Components
import { FormDropdown } from "@/components/ui/form-dropdown";
import { Dropdown } from "@/components/ui/dropdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SingleSelectDropdown } from "@/components/ui/single-select-dropdown";
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown";
import { FormProtocolDropdown } from "@/components/ui/form-protocol-dropdown";
import { FormProtocolMultiSelect } from "@/components/ui/form-protocol-multiselect";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import { BranchSelector } from "@/components/hms/BranchSelector";

interface ComponentCardProps {
  name: string;
  path: string;
  modules: ("Admin" | "Doctor" | "Lab")[];
  children: React.ReactNode;
}

function ComponentCard({ name, path, modules, children }: ComponentCardProps) {
  const badgeColor = (m: string) => {
    if (m === "Admin") return "bg-blue-100 text-blue-800 border-blue-200";
    if (m === "Doctor") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    return "bg-purple-100 text-purple-800 border-purple-200";
  };

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <span className="text-xs font-bold text-slate-800">{name}</span>
          <span className="ml-2 block text-[10px] font-mono text-slate-400 truncate">{path}</span>
        </div>
        <div className="flex items-center gap-1">
          {modules.map((m) => (
            <span key={m} className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${badgeColor(m)}`}>
              {m}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function ComponentShowcase() {
  const navigate = useNavigate();

  // Input states
  const [standardText, setStandardText] = useState("");
  const [textareaVal, setTextareaVal] = useState("");
  const [phoneVal, setPhoneVal] = useState("");
  const [otpVal, setOtpVal] = useState("");
  const [voiceVal, setVoiceVal] = useState("");
  const [dateVal, setDateVal] = useState("26-10-2026");
  const [wheelTime, setWheelTime] = useState("09:30 AM");
  const [comboVal, setComboVal] = useState("");
  const [searchVal, setSearchVal] = useState("");

  // Dropdown states
  const [formDropdownVal, setFormDropdownVal] = useState("");
  const [modalDropdownVal, setModalDropdownVal] = useState("");
  const [radixSelectVal, setRadixSelectVal] = useState("");
  const [singleSelectVal, setSingleSelectVal] = useState("");
  const [multiSelectVal, setMultiSelectVal] = useState<string[]>(["City Central Branch"]);
  const [protocolDropdownVal, setProtocolDropdownVal] = useState("");
  const [protocolMultiVal, setProtocolMultiVal] = useState<string[]>([]);
  const [nativeSelectVal, setNativeSelectVal] = useState("ROUTINE");

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-2xs hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Component Showcase & Comparison</h1>
              <p className="text-xs text-slate-500">
                Interactive preview of every distinct input box and dropdown box across Admin, Doctor, and Lab modules.
              </p>
            </div>
          </div>
          <span className="rounded bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
            Temporary Testing Page
          </span>
        </div>

        {/* ================= SECTION 1: DROPDOWN BOXES ================= */}
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            Dropdown Components (Distinct Types)
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ComponentCard name="UserProfileDropdown" path="components/ui/User_profile_dropdown.tsx" modules={["Admin", "Doctor", "Lab"]}>
              <div className="flex items-center gap-2">
                <UserProfileDropdown userName="Dr. Alexander" userSubtext="Admin / Oncologist" onLogout={() => {}} />
                <span className="text-xs text-slate-500">(Click avatar to open menu)</span>
              </div>
            </ComponentCard>

            <ComponentCard name="BranchSelector" path="components/hms/BranchSelector.tsx" modules={["Admin", "Doctor"]}>
              <BranchSelector />
            </ComponentCard>

            <ComponentCard name="Select (Radix UI)" path="components/ui/select.tsx" modules={["Admin", "Doctor"]}>
              <Select value={radixSelectVal} onValueChange={setRadixSelectVal}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose Department..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cardio">Cardiology</SelectItem>
                  <SelectItem value="onco">Medical Oncology</SelectItem>
                  <SelectItem value="general">General Medicine</SelectItem>
                </SelectContent>
              </Select>
            </ComponentCard>

            <ComponentCard name="DropdownMenu (Action Menu)" path="components/ui/dropdown-menu.tsx" modules={["Admin", "Doctor"]}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Open Action Menu ▾
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>View Record</DropdownMenuItem>
                  <DropdownMenuItem>Edit Details</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600">Cancel / Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ComponentCard>

            <ComponentCard name="FormDropdown (Searchable Input)" path="components/ui/form-dropdown.tsx" modules={["Admin"]}>
              <FormDropdown
                placeholder="Select or search role..."
                value={formDropdownVal}
                onValueChange={setFormDropdownVal}
                options={["SUPER_ADMIN", "DOCTOR", "NURSE", "PHARMACIST", "RECEPTIONIST"]}
              />
            </ComponentCard>

            <ComponentCard name="Dropdown (Modal Safe Inline)" path="components/ui/dropdown.tsx" modules={["Admin"]}>
              <Dropdown
                placeholder="Select Ward Type..."
                value={modalDropdownVal}
                onChange={setModalDropdownVal}
                options={[
                  { value: "icu", label: "ICU Ward" },
                  { value: "general", label: "General Ward" },
                  { value: "private", label: "Private Deluxe" },
                ]}
              />
            </ComponentCard>

            <ComponentCard name="SingleSelectDropdown (Search + Create)" path="components/ui/single-select-dropdown.tsx" modules={["Admin", "Doctor"]}>
              <SingleSelectDropdown
                value={singleSelectVal}
                onValueChange={setSingleSelectVal}
                placeholder="Search or add medication..."
                options={["Paracetamol 500mg", "Amoxicillin 250mg", "Cisplatin 50mg"]}
                onCreateOption={(typed) => setSingleSelectVal(typed)}
                createLabel="Add new drug"
              />
            </ComponentCard>

            <ComponentCard name="MultiSelectDropdown (Tags & Chips)" path="components/ui/multi-select-dropdown.tsx" modules={["Admin", "Doctor"]}>
              <MultiSelectDropdown
                value={multiSelectVal}
                onValueChange={setMultiSelectVal}
                placeholder="Select branches..."
                options={["City Central Branch", "Westside Clinic", "East Suburb Hospital"]}
              />
            </ComponentCard>

            <ComponentCard name="FormProtocolDropdown" path="components/ui/form-protocol-dropdown.tsx" modules={["Admin"]}>
              <FormProtocolDropdown
                placeholder="Select protocol regimen..."
                value={protocolDropdownVal}
                onValueChange={setProtocolDropdownVal}
                options={["FOLFOX-6", "AC-T Regimen", "CHOP Protocol"]}
              />
            </ComponentCard>

            <ComponentCard name="FormProtocolMultiSelect" path="components/ui/form-protocol-multiselect.tsx" modules={["Admin"]}>
              <FormProtocolMultiSelect
                placeholder="Select test days..."
                values={protocolMultiVal}
                onValuesChange={setProtocolMultiVal}
                options={[
                  { label: "Cycle Day 1", value: "D1" },
                  { label: "Cycle Day 8", value: "D8" },
                  { label: "Cycle Day 15", value: "D15" },
                ]}
              />
            </ComponentCard>

            <ComponentCard name="Native HTML <select>" path="Standard HTML" modules={["Admin", "Doctor", "Lab"]}>
              <select
                value={nativeSelectVal}
                onChange={(e) => setNativeSelectVal(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="ROUTINE">Routine Priority</option>
                <option value="URGENT">Urgent Priority</option>
                <option value="STAT">STAT Priority</option>
              </select>
            </ComponentCard>
          </div>
        </div>

        {/* ================= SECTION 2: INPUT BOXES ================= */}
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            Input Components (Distinct Types)
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ComponentCard name="Input (Base Shadcn)" path="components/ui/input.tsx" modules={["Admin", "Doctor", "Lab"]}>
              <Input
                type="text"
                placeholder="Enter standard text..."
                value={standardText}
                onChange={(e) => setStandardText(e.target.value)}
              />
            </ComponentCard>

            <ComponentCard name="Table Pill Search Input" path="PendingBookings.tsx / LabOrders.tsx" modules={["Admin", "Lab"]}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search table records..."
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-slate-100 py-1.5 pl-8 pr-8 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
                {searchVal && (
                  <button onClick={() => setSearchVal("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </ComponentCard>

            <ComponentCard name="PhoneInput (Country Flag & Dial Code)" path="components/ui/phone-input.tsx" modules={["Admin"]}>
              <PhoneInput
                value={phoneVal}
                onChange={setPhoneVal}
                defaultCountry="in"
                placeholder="Mobile number..."
              />
            </ComponentCard>

            <ComponentCard name="DateInputField (Masked + Calendar)" path="pages/doctor/consultation/DateInputField.tsx" modules={["Doctor"]}>
              <DateInputField id="showcase-date" value={dateVal} onChange={setDateVal} allowPast />
            </ComponentCard>

            <ComponentCard name="ComboInput (Editable Suggestion)" path="pages/doctor/patient-details/ComboInput.tsx" modules={["Doctor"]}>
              <ComboInput
                value={comboVal}
                onChange={setComboVal}
                placeholder="Type or pick symptom..."
                options={["Fever", "Nausea", "Headache", "Fatigue", "Others"]}
              />
            </ComponentCard>

            <ComponentCard name="VoiceToText (Speech-to-Text Input)" path="components/ui/voicetotext.tsx" modules={["Doctor"]}>
              <VoiceToText value={voiceVal} onChange={setVoiceVal} placeholder="Click mic to speak notes..." />
            </ComponentCard>

            <ComponentCard name="TimepickerWheel" path="components/ui/timepicker-wheel.tsx" modules={["Admin"]}>
              <TimepickerWheel value={wheelTime} onChange={setWheelTime} />
            </ComponentCard>

            <ComponentCard name="InputOTP (Segmented Digits)" path="components/ui/input-otp.tsx" modules={["Admin"]}>
              <InputOTP maxLength={6} value={otpVal} onChange={setOtpVal}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </ComponentCard>

            <ComponentCard name="Textarea (Multi-line)" path="components/ui/textarea.tsx" modules={["Admin", "Doctor", "Lab"]}>
              <Textarea
                rows={2}
                placeholder="Enter remarks or clinical notes..."
                value={textareaVal}
                onChange={(e) => setTextareaVal(e.target.value)}
              />
            </ComponentCard>
          </div>
        </div>
      </div>
    </div>
  );
}

