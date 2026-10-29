import { useEffect, useState, useRef, useMemo, ChangeEvent, FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, Loader2, Mail, MessageCircle, Plus, Send, UserRound, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FormDropdown } from "@/components/ui/form-dropdown";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { PhoneInput } from "@/components/ui/phone-input";
import { State as CSState, City } from "country-state-city";
import type { IState } from "country-state-city";
import { branchApi, Branch } from "@/api/branch.api";
import { patientApi } from "@/api/patient.api";
import { referralApi } from "@/api/referral.api";
import type { ReferralRecordDetails } from "@/api/referral.api";
import { validateRequiredFields, type RequiredField } from "@/lib/validation";
import {
  formatInputAlpha,
  formatInputDigits,
  formatInputAddress,
  formatInputNoSpaces,
  formatInputAlnum,
} from "@/utils/formatters";

// Helper function to convert date to HTML input[type="date"] format (YYYY-MM-DD)
const toDateInputValue = (date: string | Date | undefined | null): string => {
  if (!date) return "";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
};

const calculateAgeFromDob = (dobStr: string): string => {
  if (!dobStr) return "";
  const birthDate = new Date(dobStr);
  if (isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let calculatedAge = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    calculatedAge--;
  }
  return calculatedAge >= 0 ? String(calculatedAge) : "0";
};

const getDobFromAge = (ageVal: string | number): string => {
  if (ageVal === "" || ageVal === null || ageVal === undefined) return "";
  const parsedAge = parseInt(String(ageVal), 10);
  if (isNaN(parsedAge) || parsedAge < 0) return "";
  const today = new Date();
  const targetDate = new Date(today.getFullYear() - parsedAge, today.getMonth(), today.getDate());
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Field names mirror the `patient_bio_data` table columns so every input
// here has a real column to be saved into once the patients API exists.
interface FormData {
  branch_id: string;
  patient_first_name: string;
  patient_middle_name: string;
  patient_last_name: string;
  patient_gender: string;
  patient_dob: string;
  patient_blood_group: string;
  patient_type: string;
  patient_type_other: string;
  // Referral details
  referral_type: string;
  referred_by: string;
  referral_contact: string;
  referral_notes: string;
  referral_address: string;
  referral_mail: string;
  referral_branch_name: string;
  patient_primary_mobile: string;
  patient_alternate_mobile: string;
  patient_email: string;
  patient_marital_status: string;
  patient_nationality: string;
  patient_state: string;
  patient_district: string;
  patient_area: string;
  patient_pincode: string;
  patient_current_address: string;
  patient_permanent_address: string;
  patient_permanent_area: string;
  patient_permanent_state: string;
  patient_permanent_district: string;
  patient_permanent_pincode: string;
  patient_username: string;
  patient_password: string;
  patient_emergency_mobile: string;
  patient_emergency_name: string;
  patient_emergency_relation: string;
  patient_photo_url: string | null;
  // Insurance
  insurance_patient: string;
  insurance_provider: string;
  insurance_plan: string;
  policy_number: string;
  policy_holder_name: string;
  policy_holder_relation: string;
  validity_date: string;
  // // Diagnosis
  // diagnosed: string;
  // department: string;
  // primary_doctor: string;
  // diagnosis_notes: string;
}

const PATIENT_TYPE_OPTIONS = ["Self", "Referral"];

const DEFAULT_REFERRAL_TYPES = [
  "Hospital",
  "Clinic",
  "Doctor",
  "Patient",
  "Self",
];
const OTHER_REFERRAL_TYPE_VALUE = "Others";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Referral branch name is only relevant for these referral types.
const BRANCH_REFERRAL_TYPES = ["Hospital", "Clinic"];
const needsReferralBranchName = (referralType: string): boolean =>
  BRANCH_REFERRAL_TYPES.includes((referralType || "").trim());

const LOCAL_STORAGE_CUSTOM_REFERRAL_TYPES_KEY = "hms_custom_referral_types";

const getSavedCustomReferralTypes = (): string[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_REFERRAL_TYPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveCustomReferralTypeToStorage = (type: string) => {
  try {
    const current = getSavedCustomReferralTypes();
    const updated = Array.from(new Set([...current, type]));
    localStorage.setItem(LOCAL_STORAGE_CUSTOM_REFERRAL_TYPES_KEY, JSON.stringify(updated));
  } catch {}
};

// Referral fields are only meaningful when Patient type === "Referral".
// Otherwise they are sent as explicit `null` so the backend clears them.
const isReferralPatient = (formData: FormData): boolean =>
  formData.patient_type === "Referral";

const referralValue = (formData: FormData, key: keyof FormData): string | null =>
  isReferralPatient(formData) && !!formData[key] ? String(formData[key]).trim() : null;

const emptyFormData: FormData = {
  branch_id: "",
  patient_first_name: "",
  patient_middle_name: "",
  patient_last_name: "",
  patient_gender: "",
  patient_dob: "",
  patient_blood_group: "",
  patient_type: "",
  patient_type_other: "",
  referral_type: "",
  referred_by: "",
  referral_contact: "",
  referral_notes: "",
  referral_address: "",
  referral_mail: "",
  referral_branch_name: "",
  patient_primary_mobile: "",
  patient_alternate_mobile: "",
  patient_email: "",
  patient_marital_status: "",
  patient_nationality: "",
  patient_state: "",
  patient_district: "",
  patient_area: "",
  patient_pincode: "",
  patient_current_address: "",
  patient_permanent_address: "",
  patient_permanent_area: "",
  patient_permanent_state: "",
  patient_permanent_district: "",
  patient_permanent_pincode: "",
  patient_username: "",
  patient_password: "",
  patient_emergency_mobile: "",
  patient_emergency_name: "",
  patient_emergency_relation: "",
  patient_photo_url: null,
  insurance_patient: "no",
  insurance_provider: "",
  insurance_plan: "",
  policy_number: "",
  policy_holder_name: "",
  policy_holder_relation: "",
  validity_date: "",
  // diagnosed: "no",
  // department: "",
  // primary_doctor: "",
  // diagnosis_notes: "",
};

// ─── Shared style tokens — matches Addemployee.tsx conventions ───────────────

const inputCls =
  "w-full h-10 px-4 bg-white border border-gray-200 rounded-xl text-[13.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/15 focus:border-blue-500 transition-all duration-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";

const labelCls = "block text-[12.5px] font-semibold text-gray-700 mb-1.5";

const Req = () => <span className="text-red-600 ml-0.5">*</span>;
const Opt = () => (
  <span className="text-gray-400 text-[11px] font-normal ml-1">(optional)</span>
);

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="text-[14px] font-bold text-gray-900 pb-2 mb-1 border-b-2 border-blue-50">
        {title}
      </h2>
      <p className="text-[12px] text-gray-400 mb-4">{sub}</p>
      {children}
    </section>
  );
}

// ─── Referral suggestion input ────────────────────────────────────────────────
// Wraps a free-text input (or textarea / custom input such as PhoneInput) with
// the suggestion dropdown used by the referral fields: options are the values
// previously saved for the selected referral type. Each instance owns its own
// dropdown state (portal menu, position, outside-click, scroll/resize), so the
// exact same UX applies to Referred by, Referrer contact, Hospital name,
// Referral address, Referral mail and Referral notes.
interface ReferralSuggestInputProps {
  /** Field label rendered above the control (with required/optional marker). */
  label: string;
  required?: boolean;
  optional?: boolean;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called after a value is picked from the dropdown (post onChange). */
  onSelect?: (value: string) => void;
  options: string[];
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  /** Plain text or email input (default) — ignored when multiline/renderInput. */
  inputType?: "text" | "email";
  /** Render a <textarea> instead (referral notes). */
  multiline?: boolean;
  rows?: number;
  /** Extra classes for the input/textarea itself. */
  inputClassName?: string;
  /** Extra classes for the outer field wrapper (grid span, etc.). */
  className?: string;
  /** Small second line shown for each option; null = single-line option. */
  optionSubtitle?: (option: string) => string | null;
  /** Chevron button tooltip. */
  selectTitle?: string;
  /** Custom control renderer (e.g. PhoneInput) receiving dropdown wiring. */
  renderInput?: (props: {
    name?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled: boolean;
    onFocus: () => void;
    onClick: () => void;
  }) => React.ReactNode;
}

function ReferralSuggestInput({
  label,
  required = false,
  optional = false,
  name,
  value,
  onChange,
  onSelect,
  options,
  loading = false,
  placeholder,
  disabled = false,
  maxLength,
  inputType = "text",
  multiline = false,
  rows = 2,
  inputClassName,
  className,
  optionSubtitle,
  selectTitle,
  renderInput,
}: ReferralSuggestInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [open, setOpen] = useState(false);

  const updateCoords = () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  };

  const showDropdown = () => {
    updateCoords();
    setOpen(true);
  };

  // Keep the portal menu positioned on scroll and resize
  useEffect(() => {
    if (!open) return;
    const handleReposition = () => updateCoords();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  // Close the dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (option: string) => {
    onChange(option);
    onSelect?.(option);
    setOpen(false);
  };

  const openOnFocus = () => {
    if (options.length > 0) showDropdown();
  };

  const toggleFromButton = () => {
    updateCoords();
    setOpen((p) => !p);
  };

  const renderOption = (option: string) => {
    const isSelected = value.trim().toLowerCase() === option.trim().toLowerCase();
    const subtitle = optionSubtitle?.(option) ?? null;
    return (
      <div
        key={option}
        onMouseDown={(e) => {
          e.preventDefault();
          handleSelect(option);
        }}
        className={cn(
          "px-3.5 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between transition-colors",
          isSelected && "bg-blue-50/70 font-medium text-blue-700",
        )}
      >
        <div className="flex flex-col">
          <span className="text-[13px] text-gray-900 font-medium">{option}</span>
          {subtitle && <span className="text-[11px] text-gray-400">{subtitle}</span>}
        </div>
        {isSelected && <Check className="h-4 w-4 text-blue-600 ml-2 shrink-0" />}
      </div>
    );
  };

  const control = renderInput ? (
    renderInput({
      name,
      value,
      onChange,
      placeholder: placeholder ?? "",
      disabled,
      onFocus: openOnFocus,
      onClick: openOnFocus,
    })
  ) : multiline ? (
    <textarea
      name={name}
      rows={rows}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(inputCls, options.length > 0 && "pr-14", inputClassName)}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        if (options.length > 0) showDropdown();
      }}
      onFocus={openOnFocus}
      onClick={openOnFocus}
      disabled={disabled}
    />
  ) : (
    <input
      type={inputType}
      name={name}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(inputCls, options.length > 0 && "pr-14", inputClassName)}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        if (options.length > 0) showDropdown();
      }}
      onFocus={openOnFocus}
      onClick={openOnFocus}
      disabled={disabled}
      autoComplete="off"
    />
  );

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <div className="flex items-center justify-between mb-1.5">
        <label className={labelCls}>
          {label}
          {required && <Req />}
          {optional && <Opt />}
        </label>
        {options.length > 0 && (
          <span className="text-[11px] text-blue-600 font-medium">
            {options.length} available
          </span>
        )}
      </div>
      <div className="relative">
        {control}
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        ) : options.length > 0 ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={toggleFromButton}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none flex items-center gap-1 bg-white rounded-md shadow-sm border border-gray-100 px-1.5"
            title={selectTitle ?? "Select existing value"}
          >
            <span className="text-[10px] font-semibold text-blue-600">{options.length}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        ) : null}
      </div>

      {open && options.length > 0 && coords
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                width: coords.width,
                zIndex: 9999,
              }}
              className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 text-gray-900 shadow-[0_12px_32px_rgba(0,0,0,0.15)] origin-top"
            >
              {options.map(renderOption)}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default function PatientRegistrationForm({
  editMode = false,
  patientId,
}: {
  editMode?: boolean;
  patientId?: string;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState<FormData>(emptyFormData);
  const [sameAsCurrent, setSameAsCurrent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(editMode);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [insuranceFiles, setInsuranceFiles] = useState<File[]>([]);
  const [indianStates, setIndianStates] = useState<IState[]>([]);
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);
  const [permanentDistrictOptions, setPermanentDistrictOptions] = useState<string[]>([]);
  // Re-typed password — must match before submit is allowed. Username has
  // no confirm field; it's a single required field (matches Addemployee.tsx).
  // Not used in edit mode — the edit view has no login fields.
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Post-save popup: send confirmation mail + WhatsApp (opened together)
  const [showNotifyPopup, setShowNotifyPopup] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notifySubject, setNotifySubject] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifySent, setNotifySent] = useState({ mail: false, whatsapp: false });
  const [originalFormData, setOriginalFormData] = useState<FormData | null>(null);
  const [age, setAge] = useState<string>("");
  const [referralOtherInput, setReferralOtherInput] = useState<string>("");
  const [referralTypes, setReferralTypes] = useState<string[]>(() =>
    Array.from(new Set([...DEFAULT_REFERRAL_TYPES, ...getSavedCustomReferralTypes()]))
  );
  const [referredByOptions, setReferredByOptions] = useState<string[]>([]);
  const [referralContactOptions, setReferralContactOptions] = useState<string[]>([]);
  const [referralBranchNameOptions, setReferralBranchNameOptions] = useState<string[]>([]);
  const [referralAddressOptions, setReferralAddressOptions] = useState<string[]>([]);
  const [referralMailOptions, setReferralMailOptions] = useState<string[]>([]);
  const [referralNotesOptions, setReferralNotesOptions] = useState<string[]>([]);
  const [nameToContacts, setNameToContacts] = useState<Record<string, string[]>>({});
  const [contactToNames, setContactToNames] = useState<Record<string, string[]>>({});
  // Full saved record per referrer (by name / by contact) for auto-filling the
  // referral detail fields the same way the contact auto-fills today.
  const [nameToDetails, setNameToDetails] = useState<Record<string, ReferralRecordDetails>>({});
  const [contactToDetails, setContactToDetails] = useState<Record<string, ReferralRecordDetails>>({});
  // Global (all referral types) sync maps fetched once — used ONLY as a
  // fallback for the name ↔ contact auto-fill and the linked detail-field
  // auto-fill, so clicking or typing a known referrer/contact fills its pair
  // and its saved hospital name/address/mail/notes for every referral type.
  // The dropdown option lists themselves stay per-type.
  const [globalNameToContacts, setGlobalNameToContacts] = useState<Record<string, string[]>>({});
  const [globalContactToNames, setGlobalContactToNames] = useState<Record<string, string[]>>({});
  const [globalNameToDetails, setGlobalNameToDetails] = useState<Record<string, ReferralRecordDetails>>({});
  const [globalContactToDetails, setGlobalContactToDetails] = useState<Record<string, ReferralRecordDetails>>({});
  const [loadingReferralOptions, setLoadingReferralOptions] = useState(false);
  const [referralMailTo, setReferralMailTo] = useState("");
  const [referralMailSubject, setReferralMailSubject] = useState("");
  const [referralMailBody, setReferralMailBody] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const mailBodyRef = useRef<HTMLTextAreaElement>(null);

  // Undo/redo history for mail body
  const [mailBodyHistory, setMailBodyHistory] = useState<string[]>([""]);
  const [mailBodyHistoryIndex, setMailBodyHistoryIndex] = useState(0);

  const pushMailBodyHistory = (newBody: string) => {
    setMailBodyHistory((prev) => {
      const next = prev.slice(0, mailBodyHistoryIndex + 1);
      next.push(newBody);
      return next.slice(-50); // limit history
    });
    setMailBodyHistoryIndex((i) => Math.min(i + 1, 49));
  };

  const wrapText = (prefix: string, suffix: string) => {
    const textarea = mailBodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = referralMailBody;
    const selected = text.slice(start, end);
    const newText = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    setReferralMailBody(newText);
    pushMailBodyHistory(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const undoText = () => {
    if (mailBodyHistoryIndex > 0) {
      const newIndex = mailBodyHistoryIndex - 1;
      setMailBodyHistoryIndex(newIndex);
      setReferralMailBody(mailBodyHistory[newIndex]);
    }
  };

  const redoText = () => {
    if (mailBodyHistoryIndex < mailBodyHistory.length - 1) {
      const newIndex = mailBodyHistoryIndex + 1;
      setMailBodyHistoryIndex(newIndex);
      setReferralMailBody(mailBodyHistory[newIndex]);
    }
  };

  const handleDobChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newDob = e.target.value;
    setField("patient_dob", newDob);
    setAge(calculateAgeFromDob(newDob));
  };

  const handleAgeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newAge = e.target.value;
    if (newAge !== "" && !/^\d{1,3}$/.test(newAge)) return;
    setAge(newAge);
    if (newAge === "") {
      setField("patient_dob", "");
    } else {
      const computedDob = getDobFromAge(newAge);
      setField("patient_dob", computedDob);
    }
  };


  const addInsuranceFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type === "application/pdf"
    );
    setInsuranceFiles((prev) => {
      const combined = [...prev, ...arr];
      return combined.slice(0, 5);
    });
  };

  const removeInsuranceFile = (index: number) => {
    setInsuranceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Fetch the real branch list on mount for the Branch dropdown.
  useEffect(() => {
    branchApi
      .getAll()
      .then((res) => {
        if (res.data?.data) setBranches(res.data.data);
        else if (Array.isArray(res.data)) setBranches(res.data as unknown as Branch[]);
      })
      .catch(() => {});
  }, []);


  useEffect(() => {
    setIndianStates(CSState.getStatesOfCountry("IN"));
  }, []);

  // Edit mode: load the existing patient into the form so it can be updated
  // through the same structure as registration.
  useEffect(() => {
    if (!editMode || !patientId) return;
    patientApi
      .getById(patientId)
      .then((res) => {
        const patient = res.data.data;
        if (patient) {
          const loadedFormData: FormData = {
            branch_id: patient.branch_id || "",
            patient_first_name: patient.patient_first_name || "",
            patient_middle_name: patient.patient_middle_name || "",
            patient_last_name: patient.patient_last_name || "",
            patient_gender: patient.patient_gender || "",
            patient_dob: toDateInputValue((patient as any).patient_dob) || "",
            patient_blood_group: patient.patient_blood_group || "",
            patient_type: patient.patient_type || "",
            patient_type_other: "",
            referral_type: (() => {
              const rType = patient.patient_type === "Referral" ? (patient.referral_type || "") : "";
              if (rType) {
                setReferralTypes((prev) => Array.from(new Set([...prev, rType])));
              }
              return rType;
            })(),
            referred_by: patient.patient_type === "Referral" ? (patient.referred_by || "") : "",
            referral_contact: patient.patient_type === "Referral" ? (patient.referral_contact || "") : "",
            referral_notes: patient.patient_type === "Referral" ? (patient.referral_notes || "") : "",
            referral_address:
              patient.patient_type === "Referral" ? (patient.referral_address || "") : "",
            referral_mail:
              patient.patient_type === "Referral" ? (patient.referral_mail || "") : "",
            referral_branch_name:
              patient.patient_type === "Referral" ? (patient.referral_branch_name || "") : "",
            patient_primary_mobile: patient.patient_primary_mobile || "",
            patient_alternate_mobile: patient.patient_alternate_mobile || "",
            patient_email: patient.patient_email || "",
            patient_marital_status: patient.patient_marital_status || "",
            patient_nationality: patient.patient_nationality || "",
            patient_state: patient.patient_state || "",
            patient_district: patient.patient_district || "",
            patient_area: patient.patient_area || "",
            patient_pincode: patient.patient_pincode ? String(patient.patient_pincode) : "",
            patient_current_address: (patient as any).current_address || "",
            patient_permanent_address: (patient as any).permanent_address || "",
            patient_permanent_area: "",
            patient_permanent_state: "",
            patient_permanent_district: "",
            patient_permanent_pincode: "",
            patient_username: "",
            patient_password: "",
            patient_emergency_mobile: (patient as any).emergency_mobile || "",
            patient_emergency_name: (patient as any).emergency_name || "",
            patient_emergency_relation: (patient as any).emergency_relation || "",
            patient_photo_url: patient.patient_photo_url || null,
            insurance_patient: patient.patient_type === "Insurance" ? "yes" : "no",
            insurance_provider: "",
            insurance_plan: "",
            policy_number: "",
            policy_holder_name: "",
            policy_holder_relation: "",
            validity_date: "",
          };
          setFormData(loadedFormData);
          setOriginalFormData(loadedFormData);
          setAge(calculateAgeFromDob(loadedFormData.patient_dob));
          if ((patient as any).current_address && !(patient as any).permanent_address) {
            setSameAsCurrent(true);
          }
        }
      })
      .catch((error: any) => {
        toast({
          title: "Failed to load patient",
          description: error.response?.data?.message ?? error.message ?? "Something went wrong.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [editMode, patientId, toast]);

  useEffect(() => {
    if (formData.patient_state) {
      const s = indianStates.find((s) => s.name === formData.patient_state);
      if (s)
        setDistrictOptions(
          City.getCitiesOfState("IN", s.isoCode)
            .map((c) => c.name)
            .sort(),
        );
    } else {
      setDistrictOptions([]);
    }
  }, [formData.patient_state, indianStates]);

  useEffect(() => {
    if (formData.patient_permanent_state) {
      const s = indianStates.find((s) => s.name === formData.patient_permanent_state);
      if (s)
        setPermanentDistrictOptions(
          City.getCitiesOfState("IN", s.isoCode)
            .map((c) => c.name)
            .sort(),
        );
    } else {
      setPermanentDistrictOptions([]);
    }
  }, [formData.patient_permanent_state, indianStates]);


  const setField = (key: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const isReferralOther =
    formData.referral_type === OTHER_REFERRAL_TYPE_VALUE ||
    formData.referral_type === "Other";

  const effectiveReferralType = isReferralOther
    ? referralOtherInput.trim()
    : formData.referral_type.trim();

  // Fetch distinct referral types from backend on mount
  useEffect(() => {
    referralApi
      .getTypes()
      .then((types) => {
        if (Array.isArray(types) && types.length > 0) {
          setReferralTypes((prev) =>
            Array.from(new Set([...DEFAULT_REFERRAL_TYPES, ...getSavedCustomReferralTypes(), ...prev, ...types]))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Fetch the global sync maps once (empty type = all referral types) so
  // auto-fill works even for referral types with no saved patients.
  useEffect(() => {
    referralApi
      .getOptions("")
      .then((data) => {
        setGlobalNameToContacts(data.nameToContacts || {});
        setGlobalContactToNames(data.contactToNames || {});
        setGlobalNameToDetails(data.nameToDetails || {});
        setGlobalContactToDetails(data.contactToDetails || {});
      })
      .catch(() => {});
  }, []);

  // Fetch options (existing referrers, contacts and referral details) when
  // referral_type changes. "Self" referrals have no external referrer, so no
  // suggestion options are fetched or shown for that type.
  useEffect(() => {
    const isSelfReferral = effectiveReferralType.trim().toLowerCase() === "self";
    if (formData.patient_type !== "Referral" || !effectiveReferralType || isSelfReferral) {
      setReferredByOptions([]);
      setReferralContactOptions([]);
      setReferralBranchNameOptions([]);
      setReferralAddressOptions([]);
      setReferralMailOptions([]);
      setReferralNotesOptions([]);
      setNameToContacts({});
      setContactToNames({});
      setNameToDetails({});
      setContactToDetails({});
      return;
    }

    setLoadingReferralOptions(true);
    referralApi
      .getOptions(effectiveReferralType)
      .then((data) => {
        setReferredByOptions(data.referred_by || []);
        setReferralContactOptions(data.referral_contact || []);
        setReferralBranchNameOptions(data.referral_branch_name || []);
        setReferralAddressOptions(data.referral_address || []);
        setReferralMailOptions(data.referral_mail || []);
        setReferralNotesOptions(data.referral_notes || []);
        setNameToContacts(data.nameToContacts || {});
        setContactToNames(data.contactToNames || {});
        setNameToDetails(data.nameToDetails || {});
        setContactToDetails(data.contactToDetails || {});
      })
      .catch(() => {
        setReferredByOptions([]);
        setReferralContactOptions([]);
        setReferralBranchNameOptions([]);
        setReferralAddressOptions([]);
        setReferralMailOptions([]);
        setReferralNotesOptions([]);
        setNameToContacts({});
        setContactToNames({});
        setNameToDetails({});
        setContactToDetails({});
      })
      .finally(() => {
        setLoadingReferralOptions(false);
      });
  }, [formData.patient_type, effectiveReferralType]);

  const referralDropdownOptions = useMemo(() => {
    const cleanList = referralTypes.filter(
      (t) =>
        t.toLowerCase() !== "other" &&
        t.toLowerCase() !== "others"
    );
    return [...cleanList, OTHER_REFERRAL_TYPE_VALUE];
  }, [referralTypes]);

  // Auto-fill the "To" field from referral_mail when it changes (until user edits it)
  const [referralMailToTouched, setReferralMailToTouched] = useState(false);
  useEffect(() => {
    if (!referralMailToTouched) setReferralMailTo(formData.referral_mail);
  }, [formData.referral_mail, referralMailToTouched]);

  // Auto-fill lookup: the selected referral type's own map first, then the
  // global map — so clicking a name/contact always fills its pair, regardless
  // of which referral type the data was originally saved under.
  const lookupContacts = (name: string): string[] | undefined =>
    nameToContacts[name] ?? globalNameToContacts[name];
  const lookupNames = (contact: string): string[] | undefined =>
    contactToNames[contact] ?? globalContactToNames[contact];
  const lookupNameDetails = (name: string): ReferralRecordDetails | undefined =>
    nameToDetails[name] ?? globalNameToDetails[name];
  const lookupContactDetails = (contact: string): ReferralRecordDetails | undefined =>
    contactToDetails[contact] ?? globalContactToDetails[contact];

  // Applies a referrer's saved record to the referral detail fields using the
  // exact same rules as the name<->contact sync: a dropdown click REPLACES
  // every field with that referrer's record (fields he has no saved data for
  // are cleared, so a previous referrer's values never linger), while
  // exact-match typing only fills fields that are still empty. The
  // hospital-name field is only written when it is visible for the current
  // referral type (Hospital/Clinic).
  const applyReferralDetails = (
    details: ReferralRecordDetails | undefined,
    mode: "replace" | "fillEmpty",
  ) => {
    if (!details) return;
    setFormData((prev) => {
      const next = { ...prev };
      const fields: (keyof FormData)[] = [
        "referral_branch_name",
        "referral_address",
        "referral_mail",
        "referral_notes",
      ];
      for (const key of fields) {
        if (key === "referral_branch_name" && !needsReferralBranchName(prev.referral_type)) continue;
        const val = String((details as any)[key] ?? "").trim();
        if (mode === "replace") {
          (next as any)[key] = val;
        } else if (val && !String(prev[key] ?? "").trim()) {
          (next as any)[key] = val;
        }
      }
      return next;
    });
  };

  const handleSelectReferredBy = (name: string) => {
    setField("referred_by", name);
    // The selected referrer's contact replaces the field (cleared when he has
    // no saved contact) so only this referrer's data shows.
    const contacts = lookupContacts(name);
    setField("referral_contact", contacts && contacts.length > 0 ? contacts[0] : "");
    // Hub auto-fill: hospital name, address, mail, notes from this referrer
    applyReferralDetails(lookupNameDetails(name), "replace");
  };

  const handleSelectContact = (contact: string) => {
    setField("referral_contact", contact);
    const names = lookupNames(contact);
    setField("referred_by", names && names.length > 0 ? names[0] : "");
    applyReferralDetails(lookupContactDetails(contact), "replace");
  };

  // Fields that live-mirror into their Permanent Address counterpart while
  // "Same as Current Address" is ticked — matches Addemployee.tsx, where only
  // plain text/number inputs mirror continuously; State/District (FormDropdown)
  // are copied once, at the moment the checkbox is ticked, not on every change.
  const CURRENT_TO_PERMANENT_KEY: Partial<Record<keyof FormData, keyof FormData>> = {
    patient_current_address: "patient_permanent_address",
    patient_area: "patient_permanent_area",
    patient_pincode: "patient_permanent_pincode",
  };

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    key: keyof FormData,
  ) => {
    let value = e.target.value;

    switch (key) {
      case "patient_first_name":
      case "patient_middle_name":
      case "patient_last_name":
      case "patient_emergency_name":
      case "policy_holder_name":
        value = formatInputAlpha(value, 50);
        break;
      case "patient_area":
      case "patient_permanent_area":
      case "patient_nationality":
      case "patient_emergency_relation":
        value = formatInputAlpha(value, 60);
        break;
      case "patient_pincode":
      case "patient_permanent_pincode":
        value = formatInputDigits(value, 10);
        break;
      case "patient_current_address":
      case "patient_permanent_address":
        value = formatInputAddress(value);
        break;
      case "patient_email":
      case "patient_username":
        value = formatInputNoSpaces(value);
        break;
      case "insurance_provider":
      case "insurance_plan":
      case "policy_number":
        value = formatInputAlnum(value);
        break;
      default:
        break;
    }

    setFormData((prev) => {
      const next = { ...prev, [key]: value };

      if (sameAsCurrent) {
        const permKey = CURRENT_TO_PERMANENT_KEY[key];
        if (permKey) (next as any)[permKey] = value;
      }

      return next;
    });
  };

  const handleSameAsCurrentToggle = (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSameAsCurrent(checked);
    if (checked) {
      setFormData((prev) => ({
        ...prev,
        patient_permanent_address: prev.patient_current_address,
        patient_permanent_area: prev.patient_area,
        patient_permanent_state: prev.patient_state,
        patient_permanent_district: prev.patient_district,
        patient_permanent_pincode: prev.patient_pincode,
      }));
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const required: RequiredField<keyof FormData>[] = [
      { key: "patient_first_name", label: "First name" },
      { key: "patient_last_name", label: "Last name" },
      { key: "patient_gender", label: "Gender" },
      { key: "patient_dob", label: "Date of birth" },
      { key: "patient_blood_group", label: "Blood group" },
      { key: "patient_nationality", label: "Nationality" },
      { key: "patient_marital_status", label: "Marital status" },
      { key: "patient_type", label: "Patient type" },
      { key: "patient_current_address", label: "Current address" },
      { key: "patient_area", label: "Area" },
      { key: "patient_state", label: "State" },
      { key: "patient_district", label: "District" },
      { key: "patient_pincode", label: "Pincode" },
      // Permanent-address fields are intentionally not on the form (the
      // section is commented out) — do not require what cannot be filled in.
      { key: "patient_primary_mobile", label: "Primary mobile" },
      { key: "patient_emergency_name", label: "Emergency contact name" },
      { key: "patient_emergency_relation", label: "Emergency contact relation" },
      { key: "patient_emergency_mobile", label: "Emergency mobile" },
      { key: "branch_id", label: "Branch" },
    ];
    if (!validateRequiredFields(required, formData, toast)) return;

    // Referral details validation when Patient type is "Referral".
    if (formData.patient_type === "Referral") {
      const isOther =
        formData.referral_type === OTHER_REFERRAL_TYPE_VALUE ||
        formData.referral_type === "Other";
      if (!formData.referral_type || !formData.referral_type.trim()) {
        toast({
          title: "Missing required field",
          description: "Referral type is required.",
          variant: "destructive",
        });
        return;
      }
      if (isOther && !referralOtherInput.trim()) {
        toast({
          title: "Missing required field",
          description: 'Please specify the referral type for "Others".',
          variant: "destructive",
        });
        return;
      }
      if (needsReferralBranchName(formData.referral_type) && !formData.referral_branch_name?.trim()) {
        toast({
          title: "Missing required field",
          description: "Referral branch name is required for Hospital/Clinic referrals.",
          variant: "destructive",
        });
        return;
      }
      if (!formData.referred_by?.trim()) {
        toast({
          title: "Missing required field",
          description: "Please enter or select the referrer in 'Referred by'.",
          variant: "destructive",
        });
        return;
      }
      if (!formData.referral_address?.trim()) {
        toast({
          title: "Missing required field",
          description: "Referral address is required.",
          variant: "destructive",
        });
        return;
      }
      if (formData.referral_mail?.trim() && !EMAIL_REGEX.test(formData.referral_mail.trim())) {
        toast({
          title: "Invalid email address",
          description: "Please enter a valid referral mail.",
          variant: "destructive",
        });
        return;
      }
      if (formData.referral_contact?.trim()) {
        const clean = formData.referral_contact.replace(/\D/g, "");
        if (formData.referral_contact.startsWith("+91") || clean.startsWith("91")) {
          const localPart = clean.startsWith("91") ? clean.slice(2) : clean;
          if (localPart.length > 0 && localPart.length !== 10) {
            toast({
              title: "Invalid phone number",
              description: "For India (+91), the referrer contact must be exactly 10 digits.",
              variant: "destructive",
            });
            return;
          }
        }
      }
    }

    if (!editMode && !confirmPassword.trim()) {
      toast({
        title: "Missing required field",
        description: "Please confirm your Password.",
        variant: "destructive",
      });
      return;
    }

    if (!editMode && formData.patient_password !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Password and Confirm Password do not match.",
        variant: "destructive",
      });
      return;
    }

    if (formData.patient_type === "Insurance") {
      const insuranceRequired: { key: keyof typeof formData; label: string }[] = [
        { key: "insurance_provider", label: "Insurance provider" },
        { key: "insurance_plan", label: "Insurance plan" },
        { key: "policy_number", label: "Policy number" },
        { key: "policy_holder_name", label: "Policy holder name" },
        { key: "policy_holder_relation", label: "Relation" },
        { key: "validity_date", label: "Validity date" },
      ];
      if (!validateRequiredFields(insuranceRequired, formData, toast)) return;
      if (insuranceFiles.length === 0) {
        toast({ title: "Missing required field", description: "Please upload at least one insurance document.", variant: "destructive" });
        return;
      }
    }

    // if (formData.diagnosed === "yes") {
    //   if (!formData.department.trim() || !formData.primary_doctor.trim()) {
    //     toast({ title: "Missing required field", description: "Department and Primary doctor are required when Diagnosed is Yes.", variant: "destructive" });
    //     return;
    //   }
    // }

    setShowSubmitConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);

    const isOther =
      formData.referral_type === OTHER_REFERRAL_TYPE_VALUE ||
      formData.referral_type === "Other";
    const effectiveReferralType =
      isOther && referralOtherInput.trim()
        ? referralOtherInput.trim()
        : formData.referral_type.trim();

    try {
      if (editMode && patientId) {
        const response = await patientApi.update(patientId, {
          branch_id: formData.branch_id,
          first_name: formData.patient_first_name,
          middle_name: formData.patient_middle_name || undefined,
          last_name: formData.patient_last_name || undefined,
          gender: formData.patient_gender || undefined,
          dob: formData.patient_dob || undefined,
          blood_group: formData.patient_blood_group || undefined,
          mobile: formData.patient_primary_mobile,
          alternate_mobile: formData.patient_alternate_mobile || undefined,
          email: formData.patient_email || undefined,
          marital_status: formData.patient_marital_status || undefined,
          nationality: formData.patient_nationality || undefined,
          patient_type: formData.patient_type || undefined,
          patient_state: formData.patient_state || undefined,
          patient_district: formData.patient_district || undefined,
          patient_area: formData.patient_area || undefined,
          patient_pincode: formData.patient_pincode ? Number(formData.patient_pincode) : undefined,
          current_address: formData.patient_current_address || undefined,
          emergency_name: formData.patient_emergency_name || undefined,
          emergency_relation: formData.patient_emergency_relation || undefined,
          emergency_mobile: formData.patient_emergency_mobile || undefined,
          photo: formData.patient_photo_url || undefined,
          referral_type: referralValue({ ...formData, referral_type: effectiveReferralType }, "referral_type"),
          referred_by: referralValue(formData, "referred_by"),
          referral_contact: referralValue(formData, "referral_contact"),
          referral_notes: referralValue(formData, "referral_notes"),
          referral_address: referralValue(formData, "referral_address"),
          referral_mail: referralValue(formData, "referral_mail"),
          referral_branch_name: needsReferralBranchName(formData.referral_type)
            ? referralValue(formData, "referral_branch_name")
            : null,
        });

        if (!response.data.success) {
          throw new Error(response.data.message);
        }

        if (isOther && referralOtherInput.trim()) {
          const customType = referralOtherInput.trim();
          saveCustomReferralTypeToStorage(customType);
          setReferralTypes((prev) => Array.from(new Set([...prev, customType])));
        }

        toast({
          title: "Patient updated",
          description: `${formData.patient_first_name} ${formData.patient_last_name} was updated successfully.`,
        });

        navigate(-1);
        return;
      }

      // Add mode: no backend call happens here. The patient is registered
      // ONLY after a mail or WhatsApp message has been opened from the popup
      // (see createPatientAfterNotify) — otherwise nothing is created.
      const savedPatientName = `${formData.patient_first_name} ${formData.patient_last_name}`.trim();
      const savedBranchName =
        branches.find((b) => String(b.branch_id) === String(formData.branch_id))?.branch_name || "";
      setNotifyEmail(formData.patient_email || "");
      setNotifyPhone(formData.patient_primary_mobile || "");
      setNotifySubject(`Patient registration confirmation - ${savedPatientName}`);
      setNotifyMessage(
        `Dear ${savedPatientName},\n\n` +
          `Your patient registration is complete.\n\n` +
          `Name: ${savedPatientName}\n` +
          (formData.patient_dob ? `Date of birth: ${formData.patient_dob}\n` : "") +
          (formData.patient_gender ? `Gender: ${formData.patient_gender}\n` : "") +
          (formData.patient_blood_group ? `Blood group: ${formData.patient_blood_group}\n` : "") +
          `Mobile: ${formData.patient_primary_mobile}\n` +
          (savedBranchName ? `Branch: ${savedBranchName}\n` : "") +
          `\nThank you.`
      );
      setNotifySent({ mail: false, whatsapp: false });
      setShowNotifyPopup(true);
    } catch (error: any) {
      toast({
        title: "Failed to add patient",
        description:
          error.response?.data?.message ?? error.message ?? "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
      setShowSubmitConfirm(false);
    }
  };

  // Registers the new patient. Called ONLY from the notify popup once a mail
  // or WhatsApp message has been opened — no message, no patient record.
  const createPatientAfterNotify = async (): Promise<boolean> => {
    if (submitting) return false;
    setSubmitting(true);

    const isOther =
      formData.referral_type === OTHER_REFERRAL_TYPE_VALUE ||
      formData.referral_type === "Other";
    const effectiveReferralType =
      isOther && referralOtherInput.trim()
        ? referralOtherInput.trim()
        : formData.referral_type.trim();

    // Address and emergency-contact fields map onto the patient_bio_data
    // columns Patient_address / Patient_Emergency_contact_name /
    // Emergency_contact_relation / Patient_emergency_mobile in the backend
    // service. created_by is required by the backend validation even though
    // the controller actually derives it from the logged-in user's auth token.
    try {
      const response = await patientApi.create({
        username: formData.patient_username,
        password: formData.patient_password,
        branch_id: formData.branch_id,
        first_name: formData.patient_first_name,
        middle_name: formData.patient_middle_name || undefined,
        last_name: formData.patient_last_name || undefined,
        gender: formData.patient_gender || undefined,
        dob: formData.patient_dob || undefined,
        blood_group: formData.patient_blood_group || undefined,
        mobile: formData.patient_primary_mobile,
        alternate_mobile: formData.patient_alternate_mobile || undefined,
        email: formData.patient_email || undefined,
        marital_status: formData.patient_marital_status || undefined,
        nationality: formData.patient_nationality || undefined,
        patient_type: formData.patient_type || undefined,
        patient_state: formData.patient_state || undefined,
        patient_district: formData.patient_district || undefined,
        patient_area: formData.patient_area || undefined,
        patient_pincode: formData.patient_pincode ? Number(formData.patient_pincode) : undefined,
        current_address: formData.patient_current_address || undefined,
        emergency_name: formData.patient_emergency_name || undefined,
        emergency_relation: formData.patient_emergency_relation || undefined,
        emergency_mobile: formData.patient_emergency_mobile || undefined,
        photo: formData.patient_photo_url || undefined,
        referral_type: referralValue({ ...formData, referral_type: effectiveReferralType }, "referral_type"),
        referred_by: referralValue(formData, "referred_by"),
        referral_contact: referralValue(formData, "referral_contact"),
        referral_notes: referralValue(formData, "referral_notes"),
        referral_address: referralValue(formData, "referral_address"),
        referral_mail: referralValue(formData, "referral_mail"),
        referral_branch_name: needsReferralBranchName(formData.referral_type)
          ? referralValue(formData, "referral_branch_name")
          : null,
        created_by: "SYSTEM",
      });

      if (!response.data.success) {
        throw new Error(response.data.message);
      }

      if (isOther && referralOtherInput.trim()) {
        const customType = referralOtherInput.trim();
        saveCustomReferralTypeToStorage(customType);
        setReferralTypes((prev) => Array.from(new Set([...prev, customType])));
      }

      toast({
        title: "Patient added",
        description: `${formData.patient_first_name} ${formData.patient_last_name} was added successfully.`,
      });

      setShowNotifyPopup(false);
      navigate(-1);
      return true;
    } catch (error: any) {
      toast({
        title: "Failed to add patient",
        description:
          error.response?.data?.message ?? error.message ?? "Something went wrong.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // ── Post-save notification helpers (mail + WhatsApp) ──────────────────────
  const digitsForWhatsApp = (value: string) => {
    const digits = (value || "").replace(/\D/g, "");
    // Bare 10-digit Indian mobiles need the country code for wa.me links
    return digits.length === 10 ? `91${digits}` : digits;
  };

  const buildMailtoUrl = () =>
    `mailto:${(notifyEmail || "").trim()}?subject=${encodeURIComponent(
      notifySubject || ""
    )}&body=${encodeURIComponent(notifyMessage || "")}`;

  const buildWhatsAppUrl = () =>
    `https://wa.me/${digitsForWhatsApp(notifyPhone)}?text=${encodeURIComponent(notifyMessage || "")}`;

  const sendMailOnly = () => {
    if (!notifyEmail.trim()) {
      toast({
        title: "Email required",
        description: "Enter the patient's email address to send the mail.",
        variant: "destructive",
      });
      return;
    }
    window.location.href = buildMailtoUrl();
    setNotifySent((s) => ({ ...s, mail: true }));
    toast({
      title: "Mail opened",
      description: "Your default mail app opened with the message ready — press send there.",
    });
    // Message handed to the mail client → the patient may now be registered
    createPatientAfterNotify();
  };

  const sendWhatsAppOnly = () => {
    if (!digitsForWhatsApp(notifyPhone)) {
      toast({
        title: "Mobile number required",
        description: "Enter the patient's mobile number to send a WhatsApp message.",
        variant: "destructive",
      });
      return;
    }
    const opened = window.open(buildWhatsAppUrl(), "_blank", "noopener,noreferrer");
    if (!opened) {
      toast({
        title: "Pop-up blocked",
        description: "Allow pop-ups for this site, then use Send WhatsApp again.",
        variant: "destructive",
      });
      return;
    }
    setNotifySent((s) => ({ ...s, whatsapp: true }));
    toast({
      title: "WhatsApp opened",
      description: "The message is ready in WhatsApp — press send there.",
    });
    // WhatsApp opened with the message → the patient may now be registered
    createPatientAfterNotify();
  };

  // Opens the mail client and WhatsApp together, in one single click
  const sendMailAndWhatsApp = () => {
    const hasMail = !!notifyEmail.trim();
    const hasWhatsapp = !!digitsForWhatsApp(notifyPhone);

    if (!hasMail && !hasWhatsapp) {
      toast({
        title: "Nothing to send",
        description: "Enter the patient's email address and mobile number first.",
        variant: "destructive",
      });
      return;
    }

    let openedAny = false;

    if (hasWhatsapp) {
      const opened = window.open(buildWhatsAppUrl(), "_blank", "noopener,noreferrer");
      if (opened) {
        setNotifySent((s) => ({ ...s, whatsapp: true }));
        openedAny = true;
      } else
        toast({
          title: "Pop-up blocked",
          description: "Allow pop-ups for this site to open WhatsApp automatically.",
          variant: "destructive",
        });
    } else {
      toast({
        title: "WhatsApp skipped",
        description: "No mobile number entered — only the mail will be opened.",
      });
    }

    if (hasMail) {
      window.location.href = buildMailtoUrl();
      setNotifySent((s) => ({ ...s, mail: true }));
      openedAny = true;
    } else {
      toast({
        title: "Mail skipped",
        description: "No email address entered — only WhatsApp will be opened.",
      });
    }

    // At least one message went out → the patient may now be registered
    if (openedAny) createPatientAfterNotify();
  };

  const closeNotifyPopup = () => {
    if (submitting) return;
    setShowNotifyPopup(false);
    toast({
      title: "Patient not created",
      description:
        "No message was sent, so no patient was registered. Save again and send a mail or WhatsApp message to complete the registration.",
    });
  };

  const handleReset = () => {
    setShowResetConfirm(true);
  };

  const handleConfirmReset = () => {
    setShowResetConfirm(false);
    const resetData = editMode && originalFormData ? originalFormData : emptyFormData;
    setFormData(resetData);
    setAge(calculateAgeFromDob(resetData.patient_dob));
    setSameAsCurrent(false);
    setConfirmPassword("");
    setInsuranceFiles([]);
  };

  const isDirty = editMode
    ? !!originalFormData &&
      (JSON.stringify(formData) !== JSON.stringify(originalFormData) || insuranceFiles.length > 0)
    : JSON.stringify(formData) !== JSON.stringify(emptyFormData) || insuranceFiles.length > 0;

  const handleBack = () => {
    if (isDirty) {
      setShowLeaveConfirm(true);
      return;
    }
    navigate(-1);
  };


  if (loading && editMode) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <div className="w-full max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-8 py-5 border-b border-gray-100">
          <button
            type="button"
            onClick={handleBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-50 transition-colors text-gray-500"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <UserRound className="w-5 h-5" />
          </div>
          <h4 className="hms-heading text-gray-900 tracking-tight">
            {editMode ? "Edit Patient" : "Add Patient"}
          </h4>
        </div>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} className="px-8 pt-7 pb-8">

          {/* Photo */}
          <div className="flex items-start gap-10 pb-6 border-b border-gray-100 mb-7">
            <AvatarUpload
              value={formData.patient_photo_url}
              onChange={(url) => setField("patient_photo_url", url ?? "")}
              label="Patient photo"
              hint="Click or drag an image to upload"
              size={96}
            />
          </div>

          {/* ── Personal details ── */}
          <Section
            title="Personal details"
            sub="Personal details used to identify the patient."
          >
            <div className="grid grid-cols-3 gap-x-5 gap-y-[18px]">
              <div>
                <label className={labelCls}>First name <Req /></label>
                <input
                  type="text"
                  placeholder="e.g. Aisha"
                  className={inputCls}
                  value={formData.patient_first_name}
                  onChange={(e) => handleInputChange(e, "patient_first_name")}
                  disabled={submitting}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Middle name</label>
                <input
                  type="text"
                  className={inputCls}
                  value={formData.patient_middle_name}
                  onChange={(e) => handleInputChange(e, "patient_middle_name")}
                  disabled={submitting}
                />
              </div>
              <div>
                <label className={labelCls}>Last name <Req /></label>
                <input
                  type="text"
                  placeholder="e.g. Rahman"
                  className={inputCls}
                  value={formData.patient_last_name}
                  onChange={(e) => handleInputChange(e, "patient_last_name")}
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <label className={labelCls}>Gender <Req /></label>
                <FormDropdown
                  className={inputCls}
                  options={["Female", "Male", "Other"]}
                  value={formData.patient_gender}
                  onValueChange={(val) => setField("patient_gender", val)}
                  placeholder="Select"
                  disabled={submitting}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <label className={labelCls}>Date of birth <Req /></label>
                  <input
                    type="date"
                    max={new Date().toISOString().split("T")[0]}
                    className={inputCls + " text-gray-500"}
                    value={formData.patient_dob}
                    onChange={handleDobChange}
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="w-24 shrink-0">
                  <label className={labelCls}>Age</label>
                  <input
                    type="number"
                    min={0}
                    max={150}
                    placeholder="Age"
                    className={inputCls}
                    value={age}
                    onChange={handleAgeChange}
                    disabled={submitting}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Blood group </label>
                <FormDropdown
                  className={inputCls}
                  options={["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"]}
                  value={formData.patient_blood_group}
                  onValueChange={(val) => setField("patient_blood_group", val)}
                  placeholder="Select"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className={labelCls}>Nationality <Req /></label>
                <input
                  type="text"
                  placeholder="e.g. Indian"
                  className={inputCls}
                  value={formData.patient_nationality}
                  onChange={(e) => handleInputChange(e, "patient_nationality")}
                  disabled={submitting}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Marital status <Req /></label>
                <FormDropdown
                  className={inputCls}
                  options={["Single", "Married", "Divorced"]}
                  value={formData.patient_marital_status}
                  onValueChange={(val) => setField("patient_marital_status", val)}
                  placeholder="Select"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className={labelCls}>Patient Joining type <Req /></label>
                <FormDropdown
                  className={inputCls}
                  options={PATIENT_TYPE_OPTIONS}
                  value={formData.patient_type}
                  onValueChange={(val) => {
                      if (val !== "Referral") {
                        setReferralOtherInput("");
                        setReferralMailTo("");
                        setReferralMailSubject("");
                        setReferralMailBody("");
                        setReferralMailToTouched(false);
                      }
                      if (val !== "Insurance") setInsuranceFiles([]);
                      setFormData((p) => ({
                      ...p,
                      patient_type: val,
                      patient_type_other: "",
                      // Clear referral details whenever the patient type is not "Referral"
                      referral_type: val === "Referral" ? p.referral_type : "",
                      referred_by: val === "Referral" ? p.referred_by : "",
                      referral_contact: val === "Referral" ? p.referral_contact : "",
                      referral_notes: val === "Referral" ? p.referral_notes : "",
                      referral_address: val === "Referral" ? p.referral_address : "",
                      referral_mail: val === "Referral" ? p.referral_mail : "",
                      referral_branch_name: val === "Referral" ? p.referral_branch_name : "",
                      // Insurance details active only when patient_type is "Insurance"
                      insurance_patient: val === "Insurance" ? "yes" : "no",
                      insurance_provider: val === "Insurance" ? p.insurance_provider : "",
                      insurance_plan: val === "Insurance" ? p.insurance_plan : "",
                      policy_number: val === "Insurance" ? p.policy_number : "",
                      policy_holder_name: val === "Insurance" ? p.policy_holder_name : "",
                      policy_holder_relation: val === "Insurance" ? p.policy_holder_relation : "",
                      validity_date: val === "Insurance" ? p.validity_date : "",
                    }));
                  }}
                  placeholder="Select patient type"
                  disabled={submitting}
                />
              </div>
            </div>
          </Section>

          {/* ── Referral details (only when Patient type is "Referral") ── */}
          <AnimatePresence>
            {formData.patient_type === "Referral" && (
              <motion.div
                key="referralDetails"
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="relative z-20"
              >
                <Section
                  title="Referral details"
                  sub="Details of the source that referred this patient."
                >
                  <div className="grid grid-cols-3 gap-x-5 gap-y-[18px]">
                    <div>
                      <label className={labelCls}>
                        Referral type <Req />
                      </label>
                      <FormDropdown
                        className={inputCls}
                        options={referralDropdownOptions}
                        value={formData.referral_type}
                        onValueChange={(val) => {
                          if (val !== formData.referral_type) {
                            // Referral type changed → clear every referral
                            // detail so nothing from the previous type shows.
                            setFormData((prev) => ({
                              ...prev,
                              referral_type: val,
                              referred_by: "",
                              referral_contact: "",
                              referral_branch_name: "",
                              referral_address: "",
                              referral_mail: "",
                              referral_notes: "",
                            }));
                            setReferralMailTo("");
                            setReferralMailSubject("");
                            setReferralMailBody("");
                            setReferralMailToTouched(false);
                          } else {
                            setField("referral_type", val);
                            if (!needsReferralBranchName(val)) {
                              setField("referral_branch_name", "");
                            }
                          }
                          if (val !== OTHER_REFERRAL_TYPE_VALUE && val !== "Other") {
                            setReferralOtherInput("");
                          }
                        }}
                        placeholder="Select referral type"
                        disabled={submitting}
                      />
                    </div>

                    <ReferralSuggestInput
                      label="Referred by"
                      required
                      name="referred_by"
                      value={formData.referred_by}
                      onChange={(val) => {
                        setField("referred_by", val);
                        const matchedContact = lookupContacts(val.trim())?.[0];
                        if (!formData.referral_contact && matchedContact) {
                          setField("referral_contact", matchedContact);
                        }
                        // Exact-match typing fills empty detail fields only
                        applyReferralDetails(lookupNameDetails(val.trim()), "fillEmpty");
                      }}
                      onSelect={handleSelectReferredBy}
                      options={referredByOptions}
                      loading={loadingReferralOptions}
                      placeholder={
                        loadingReferralOptions
                          ? "Loading options..."
                          : referredByOptions.length > 0
                          ? "Type or select referrer"
                          : "e.g. Dr. Ramesh Kumar, City Clinic"
                      }
                      maxLength={100}
                      disabled={submitting}
                      optionSubtitle={(opt) => {
                        const contact = lookupContacts(opt)?.[0];
                        return contact ? `Contact: ${contact}` : "No contact saved";
                      }}
                      selectTitle="Select existing referrer"
                    />

                    <ReferralSuggestInput
                      label="Referrer contact"
                      optional
                      name="referral_contact"
                      value={formData.referral_contact}
                      onChange={(value) => {
                        setField("referral_contact", value);
                        const matchedName = lookupNames(value.trim())?.[0];
                        if (!formData.referred_by && matchedName) {
                          setField("referred_by", matchedName);
                        }
                        // Exact-match typing fills empty detail fields only
                        applyReferralDetails(lookupContactDetails(value.trim()), "fillEmpty");
                      }}
                      onSelect={handleSelectContact}
                      options={referralContactOptions}
                      loading={loadingReferralOptions}
                      placeholder="Enter contact number"
                      disabled={submitting}
                      optionSubtitle={(contact) => {
                        const name = lookupNames(contact)?.[0];
                        return name ? `Referred by: ${name}` : "Referrer name not linked";
                      }}
                      selectTitle="Select existing contact"
                      renderInput={(p) => (
                        <PhoneInput
                          name={p.name}
                          value={p.value}
                          onChange={p.onChange}
                          onFocus={p.onFocus}
                          onClick={p.onClick}
                          placeholder={p.placeholder}
                          disabled={p.disabled}
                          defaultCountry="in"
                        />
                      )}
                    />

                    {isReferralOther && (
                      <div>
                        <label className={labelCls}>
                          Specify referral type <Req />
                        </label>
                        <input
                          type="text"
                          placeholder="Enter referral type"
                          maxLength={50}
                          className={inputCls}
                          value={referralOtherInput}
                          onChange={(e) => {
                            setReferralOtherInput(e.target.value);
                          }}
                          disabled={submitting}
                        />
                      </div>
                    )}

                    {needsReferralBranchName(formData.referral_type) && (
                      <ReferralSuggestInput
                        label="Referral Hospital name"
                        required
                        className="col-span-3"
                        name="referral_branch_name"
                        value={formData.referral_branch_name}
                        onChange={(val) => setField("referral_branch_name", val)}
                        options={referralBranchNameOptions}
                        loading={loadingReferralOptions}
                        placeholder="Enter or select referral branch name"
                        maxLength={150}
                        disabled={submitting}
                        selectTitle="Select existing hospital name"
                      />
                    )}

                    <ReferralSuggestInput
                      label="Referral address"
                      required
                      className="col-span-2"
                      name="referral_address"
                      value={formData.referral_address}
                      onChange={(val) => setField("referral_address", val)}
                      options={referralAddressOptions}
                      loading={loadingReferralOptions}
                      placeholder="Enter or select referral address"
                      maxLength={255}
                      disabled={submitting}
                      selectTitle="Select existing address"
                    />

                    <ReferralSuggestInput
                      label="Referral mail"
                      optional
                      name="referral_mail"
                      value={formData.referral_mail}
                      onChange={(val) => setField("referral_mail", val)}
                      options={referralMailOptions}
                      loading={loadingReferralOptions}
                      placeholder="e.g. referrer@example.com"
                      inputType="email"
                      maxLength={100}
                      disabled={submitting}
                      selectTitle="Select existing mail"
                    />

                    <ReferralSuggestInput
                      label="Referral notes"
                      optional
                      className="col-span-3"
                      name="referral_notes"
                      value={formData.referral_notes}
                      onChange={(val) => setField("referral_notes", val)}
                      options={referralNotesOptions}
                      loading={loadingReferralOptions}
                      placeholder="Additional info (address, department, special instructions)"
                      multiline
                      rows={2}
                      maxLength={2000}
                      disabled={submitting}
                      selectTitle="Select existing note"
                    />

                  </div>
                </Section>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Insurance details (only when Patient type is "Insurance") ── */}
          <AnimatePresence>
            {formData.patient_type === "Insurance" && (
              <motion.div
                key="insuranceDetails"
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="relative z-20"
              >
                <Section
                  title="Insurance details"
                  sub="Add insurance information if the patient is covered."
                >
                  <div className="grid grid-cols-3 gap-x-5 gap-y-[18px]">
                    <div>
                      <label className={labelCls}>Insurance provider <Req /></label>
                      <input
                        type="text"
                        placeholder="Enter provider name"
                        className={inputCls}
                        value={formData.insurance_provider}
                        onChange={(e) => setField("insurance_provider", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Insurance plan <Req /></label>
                      <input
                        type="text"
                        placeholder="Enter plan name"
                        className={inputCls}
                        value={formData.insurance_plan}
                        onChange={(e) => setField("insurance_plan", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Policy number <Req /></label>
                      <input
                        type="text"
                        placeholder="Enter policy number"
                        className={inputCls}
                        value={formData.policy_number}
                        onChange={(e) => setField("policy_number", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Policy holder name <Req /></label>
                      <input
                        type="text"
                        placeholder="Enter holder name"
                        className={inputCls}
                        value={formData.policy_holder_name}
                        onChange={(e) => setField("policy_holder_name", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Relation <Req /></label>
                      <FormDropdown
                        className={inputCls}
                        options={["Self", "Spouse", "Parent", "Child", "Sibling", "Other"]}
                        value={formData.policy_holder_relation}
                        onValueChange={(val) => setField("policy_holder_relation", val)}
                        placeholder="Select relation"
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Validity date <Req /></label>
                      <input
                        type="date"
                        min={new Date().toISOString().split("T")[0]}
                        className={inputCls + " text-gray-500"}
                        value={formData.validity_date}
                        onChange={(e) => setField("validity_date", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="col-span-3">
                      <label className={labelCls}>
                        Insurance documents {insuranceFiles.length === 0 && <Req />}
                      </label>
                      <div
                        className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-gradient-to-b from-white to-gray-50/60 hover:border-blue-500 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer relative"
                        tabIndex={0}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("!border-blue-500", "!bg-blue-50/30"); }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove("!border-blue-500", "!bg-blue-50/30"); }}
                        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("!border-blue-500", "!bg-blue-50/30"); addInsuranceFiles(e.dataTransfer.files); }}
                        onClick={(e) => {
                          if (!(e.target as HTMLElement).closest(".file-remove-btn")) {
                            document.getElementById("insurance-file-input")?.click();
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.getElementById("insurance-file-input")?.click(); } }}
                      >
                        <input
                          id="insurance-file-input"
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          className="hidden"
                          onChange={(e) => { if (e.target.files) addInsuranceFiles(e.target.files); }}
                        />
                        {insuranceFiles.length === 0 ? (
                          <div className="flex flex-col items-center gap-2">
                            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                            <span className="text-[13px] text-gray-500">Drop insurance documents here</span>
                            <span className="text-[11px] text-gray-400">Images, PDF • Max 5 files</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-3">
                            {insuranceFiles.map((file, i) => (
                              <div key={i} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm animate-[slideUp_0.2s_ease]">
                                {file.type.startsWith("image/") ? (
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt=""
                                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                  </div>
                                )}
                                <div className="text-left min-w-0 max-w-[180px]">
                                  <p className="text-xs font-medium truncate">{file.name}</p>
                                  <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button
                                  type="button"
                                  className="file-remove-btn p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                                  onClick={() => removeInsuranceFile(i)}
                                  aria-label={`Remove ${file.name}`}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => document.getElementById("insurance-file-input")?.click()}
                              className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:text-blue-600 hover:border-blue-400 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                              Add more
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Section>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Address and location ── */}
          <Section
            title="Address and location"
            sub="State, district and residential details."
          >
            <div className="grid grid-cols-3 gap-x-5 gap-y-[18px]">

              <div className="col-span-1">
                <label className={labelCls}>Current address <Req /></label>
                <input
                  type="text"
                  placeholder="Enter building no and street name"
                  maxLength={255}
                  className={inputCls}
                  value={formData.patient_current_address}
                  onChange={(e) => handleInputChange(e, "patient_current_address")}
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <label className={labelCls}>Area <Req /></label>
                <input
                  name="patient_area"
                  placeholder="Enter area"
                  maxLength={50}
                  className={inputCls}
                  value={formData.patient_area}
                  onChange={(e) => handleInputChange(e, "patient_area")}
                  disabled={submitting}
                />
              </div>

              <div>
                <label className={labelCls}>State <Req /></label>
                <FormDropdown
                  className={inputCls}
                  options={indianStates.map((s) => s.name)}
                  value={formData.patient_state}
                  onValueChange={(v) =>
                    setFormData((p) => ({ ...p, patient_state: v, patient_district: "" }))
                  }
                  placeholder="Select state"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className={labelCls}>District <Req /></label>
                <FormDropdown
                  className={inputCls}
                  options={districtOptions}
                  value={formData.patient_district}
                  onValueChange={(v) => setField("patient_district", v)}
                  placeholder={formData.patient_state ? "Select district" : "Select state first"}
                  disabled={submitting || !formData.patient_state}
                />
              </div>

              <div>
                <label className={labelCls}>Pincode <Req /></label>
                <input
                  name="patient_pincode"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Enter pincode"
                  maxLength={10}
                  className={inputCls}
                  value={formData.patient_pincode}
                  onChange={(e) => handleInputChange(e, "patient_pincode")}
                  disabled={submitting}
                />
              </div>


              {/* ── Permanent Address section — commented out (kept for future use) ──
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sameAsCurrent"
                  checked={sameAsCurrent}
                  onChange={handleSameAsCurrentToggle}
                  disabled={submitting}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="sameAsCurrent"
                  className="text-[13px] text-gray-700 cursor-pointer select-none"
                >
                  Same as Current Address
                </label>
              </div>

              <div className="col-span-1">
                <label className={labelCls}>Permanent address <Req /></label>
                <input
                  type="text"
                  placeholder="Enter building no and street name"
                  maxLength={255}
                  className={inputCls}
                  value={formData.patient_permanent_address}
                  onChange={(e) => handleInputChange(e, "patient_permanent_address")}
                  disabled={submitting || sameAsCurrent}
                  required
                />
              </div>

              <div>
                <label className={labelCls}>Permanent area <Req /></label>
                <input
                  type="text"
                  placeholder="Enter area"
                  maxLength={50}
                  className={inputCls}
                  value={formData.patient_permanent_area}
                  onChange={(e) => handleInputChange(e, "patient_permanent_area")}
                  disabled={submitting || sameAsCurrent}
                />
              </div>

              <div>
                <label className={labelCls}>Permanent state <Req /></label>
                <FormDropdown
                  className={inputCls}
                  options={indianStates.map((s) => s.name)}
                  value={formData.patient_permanent_state}
                  onValueChange={(v) =>
                    setFormData((p) => ({
                      ...p,
                      patient_permanent_state: v,
                      patient_permanent_district: "",
                    }))
                  }
                  placeholder="Select state"
                  disabled={submitting || sameAsCurrent}
                />
              </div>
              <div>
                <label className={labelCls}>Permanent district <Req /></label>
                <FormDropdown
                  className={inputCls}
                  options={permanentDistrictOptions}
                  value={formData.patient_permanent_district}
                  onValueChange={(v) => setField("patient_permanent_district", v)}
                  placeholder={
                    formData.patient_permanent_state ? "Select district" : "Select state first"
                  }
                  disabled={submitting || sameAsCurrent || !formData.patient_permanent_state}
                />
              </div>

              <div>
                <label className={labelCls}>Permanent pincode <Req /></label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Enter pincode"
                  maxLength={10}
                  className={inputCls}
                  value={formData.patient_permanent_pincode}
                  onChange={(e) => handleInputChange(e, "patient_permanent_pincode")}
                  disabled={submitting || sameAsCurrent}
                />
              </div>
              ────────────────────────────────────────────────────────────── */}
            </div>
          </Section>

          {/* ── Contact information ── */}
          <Section
            title="Contact information"
            sub="How to reach the patient and in an emergency."
          >
            <div className="grid grid-cols-3 gap-x-5 gap-y-[18px]">
              <div>
                <label className={labelCls}>Primary mobile <Req /></label>
                <PhoneInput
                  value={formData.patient_primary_mobile}
                  onChange={(value) => handleInputChange({ target: { name: "patient_primary_mobile", value } } as any, "patient_primary_mobile")}
                  placeholder="+91 98765 43210"
                  disabled={submitting}
                  defaultCountry="in"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Alternate mobile <Opt />
                </label>
                <PhoneInput
                  value={formData.patient_alternate_mobile}
                  onChange={(value) => handleInputChange({ target: { name: "patient_alternate_mobile", value } } as any, "patient_alternate_mobile")}
                  placeholder="+91 98765 43210"
                  disabled={submitting}
                  defaultCountry="in"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Email <Opt />
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  className={inputCls}
                  value={formData.patient_email}
                  onChange={(e) => handleInputChange(e, "patient_email")}
                  disabled={submitting}
                />
              </div>

              <div>
                <label className={labelCls}>Emergency contact name <Req /></label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  className={inputCls}
                  value={formData.patient_emergency_name}
                  onChange={(e) => handleInputChange(e, "patient_emergency_name")}
                  disabled={submitting}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Relation <Req /></label>
                <input
                  type="text"
                  placeholder="e.g. Spouse, Parent, Sibling"
                  className={inputCls}
                  value={formData.patient_emergency_relation}
                  onChange={(e) => handleInputChange(e, "patient_emergency_relation")}
                  disabled={submitting}
                  required
                />
              </div>
                <div>
                <label className={labelCls}>Emergency mobile <Req /></label>
                <PhoneInput
                  value={formData.patient_emergency_mobile}
                  onChange={(value) => handleInputChange({ target: { name: "patient_emergency_mobile", value } } as any, "patient_emergency_mobile")}
                  placeholder="+91 98765 43210"
                  disabled={submitting}
                  defaultCountry="in"
                />
              </div>
            </div>
          </Section>

          {/* ── Branch selection ── */}
          <Section
            title="Branch selection"
            sub="Which branch this patient is registering at."
          >
            <div className="grid grid-cols-3 gap-x-5 gap-y-[18px]">
              <div>
                <label className={labelCls}>
                  Branch <Req />
                </label>
                <FormDropdown
                  className={inputCls}
                  options={branches.map((b) => ({
                    label: `${b.branch_id}${b.branch_name ? ` - ${b.branch_name}` : ""}`,
                    value: b.branch_id,
                  }))}
                  value={formData.branch_id}
                  onValueChange={(val) => setField("branch_id", val)}
                  placeholder={branches.length ? "Select branch" : "No branches available"}
                  disabled={submitting || branches.length === 0}
                />
              </div>
            </div>
          </Section>


          {/* DIAGNOSIS DETAILS — hidden until DB columns exist
          <Section title="Diagnosis details" sub="...">
            ...
          </Section>
          */}

          {/* ── Account credentials ── */}
          {/* Not shown in edit mode — username/password are set at registration
              and are not editable here (matches Addemployee.tsx's split between
              the add-only login fields and the shared editable fields). */}
          {!editMode && (
          <Section
            title="Account credentials"
            sub="Login details for portal access."
          >
            <div className="grid grid-cols-3 gap-x-5 gap-y-[18px]">
              <div>
                <label className={labelCls}>Username <Req /></label>
                {/* Block browser autofill of the previously saved login — this
                    is a create-credential form and must start empty. Chrome
                    ignores autoComplete="off" for login-shaped fields, so the
                    field also mounts readOnly (password managers skip readonly
                    inputs) and unlocks on first focus, which always fires
                    before the first keystroke. Create-mode-only: the whole
                    section is hidden in edit mode. */}
                <input
                  type="text"
                  placeholder="Enter username"
                  maxLength={50}
                  className={inputCls}
                  value={formData.patient_username}
                  onChange={(e) => handleInputChange(e, "patient_username")}
                  disabled={submitting}
                  required
                  autoComplete="off"
                  readOnly
                  onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
                />
              </div>
              <div>
                <label className={labelCls}>Password <Req /></label>
                <input
                  type="password"
                  placeholder="Enter password"
                  className={inputCls}
                  value={formData.patient_password}
                  onChange={(e) => handleInputChange(e, "patient_password")}
                  disabled={submitting}
                  required
                  // "new-password" tells the browser this is a create-new-
                  // credential field, so the saved login password is not filled.
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className={labelCls}>Confirm password <Req /></label>
                <input
                  type="password"
                  placeholder="Re-enter password"
                  className={inputCls}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>
          </Section>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-end gap-3.5 pt-5 mt-1.5 border-t border-gray-100">
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting}
              className="h-[42px] px-6 text-[13.5px] font-semibold text-gray-700 border border-gray-300 rounded-xl bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-[42px] px-6 text-[13.5px] font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {editMode ? "Saving…" : "Adding…"}
                </>
              ) : editMode ? (
                <>
                  <Check className="w-4 h-4" />
                  Save changes
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Save patient
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <ConfirmationDialog
        open={showSubmitConfirm}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSubmitConfirm(false)}
        type={editMode ? "warning" : "question"}
        title={editMode ? "Save changes?" : "Add patient?"}
        description={
          editMode
            ? "Are you sure you want to save the changes to this patient?"
            : "Are you sure you want to register this new patient?"
        }
        confirmText={editMode ? "Save changes" : "Save patient"}
        cancelText="Cancel"
        loading={submitting}
      />

      <ConfirmationDialog
        open={showResetConfirm}
        type="info"
        title="Reset Form?"
        description={
          editMode
            ? "All fields will be reset to their original values."
            : "All entered values will be cleared."
        }
        confirmText="Reset"
        cancelText="Cancel"
        onConfirm={handleConfirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />

      <ConfirmationDialog
        open={showLeaveConfirm}
        type="info"
        title="Leave this page?"
        description="You have unsaved changes. If you leave now, your changes will be lost."
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={() => {
          setShowLeaveConfirm(false);
          navigate(-1);
        }}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      {/* ── Post-save popup: send confirmation mail + WhatsApp together ── */}
      <DialogPrimitive.Root
        open={showNotifyPopup}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeNotifyPopup();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 hms-modal-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-6 sm:p-10 pointer-events-none">
            <div className="relative w-full max-w-2xl rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-2xl animate-[p360-pop_0.25s_ease-out] pointer-events-auto">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <Check className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1 pr-6">
                  <DialogPrimitive.Title className="text-base font-semibold text-gray-900">
                    Send confirmation to register the patient
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="text-[13px] leading-relaxed text-gray-500">
                    {`${formData.patient_first_name} ${formData.patient_last_name}`.trim()} is not
                    registered yet — the patient record is created only after a mail or WhatsApp
                    message is sent below.
                  </DialogPrimitive.Description>
                </div>
                <button
                  type="button"
                  onClick={closeNotifyPopup}
                  aria-label="Close"
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {/* ── Mail ── */}
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span className="text-[13px] font-semibold text-gray-900">Email</span>
                    {notifySent.mail && (
                      <span className="ml-auto text-[11px] font-medium text-green-600">Opened</span>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <label className="mb-1 block text-[12px] font-medium text-gray-600">To</label>
                      <input
                        type="email"
                        value={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.value)}
                        placeholder="patient@example.com"
                        maxLength={100}
                        autoComplete="off"
                        className="h-[38px] w-full rounded-lg border border-gray-300 px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] font-medium text-gray-600">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={notifySubject}
                        onChange={(e) => setNotifySubject(e.target.value)}
                        placeholder="Enter mail subject"
                        maxLength={200}
                        autoComplete="off"
                        className="h-[38px] w-full rounded-lg border border-gray-300 px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>
                </div>

                {/* ── WhatsApp ── */}
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                    <MessageCircle className="h-4 w-4 text-green-600" />
                    <span className="text-[13px] font-semibold text-gray-900">WhatsApp</span>
                    {notifySent.whatsapp && (
                      <span className="ml-auto text-[11px] font-medium text-green-600">Opened</span>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <label className="mb-1 block text-[12px] font-medium text-gray-600">
                        Send to (mobile)
                      </label>
                      <input
                        type="tel"
                        value={notifyPhone}
                        onChange={(e) => setNotifyPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        maxLength={20}
                        autoComplete="off"
                        className="h-[38px] w-full rounded-lg border border-gray-300 px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                      />
                      <p className="mt-1 text-[11px] leading-tight text-gray-400">
                        Plain 10-digit numbers are sent as +91.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Shared message (mail body + WhatsApp text) ── */}
              <div className="mt-3">
                <label className="mb-1 block text-[12px] font-medium text-gray-600">
                  Message (used as the mail body and the WhatsApp text)
                </label>
                <textarea
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] leading-relaxed text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* ── Actions ── */}
              <div className="mt-4 flex flex-col-reverse gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeNotifyPopup}
                  disabled={submitting}
                  className="h-[40px] rounded-xl border border-gray-300 bg-white px-5 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={sendMailOnly}
                  disabled={submitting}
                  className="h-[40px] rounded-xl border border-blue-200 bg-white px-5 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" />
                  Send mail
                </button>
                <button
                  type="button"
                  onClick={sendWhatsAppOnly}
                  disabled={submitting}
                  className="h-[40px] rounded-xl border border-green-200 bg-white px-5 text-[13px] font-semibold text-green-700 transition-colors hover:bg-green-50 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send WhatsApp
                </button>
                <button
                  type="button"
                  onClick={sendMailAndWhatsApp}
                  disabled={submitting}
                  className="h-[40px] rounded-xl bg-blue-600 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Registering…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send mail & WhatsApp
                    </>
                  )}
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

