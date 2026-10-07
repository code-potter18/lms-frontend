import { useEffect, useState, useRef, useMemo, ChangeEvent, FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, Loader2, Plus, UserRound } from "lucide-react";
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
  const [originalFormData, setOriginalFormData] = useState<FormData | null>(null);
  const [age, setAge] = useState<string>("");
  const [referralOtherInput, setReferralOtherInput] = useState<string>("");
  const [referralTypes, setReferralTypes] = useState<string[]>(() =>
    Array.from(new Set([...DEFAULT_REFERRAL_TYPES, ...getSavedCustomReferralTypes()]))
  );
  const [referredByOptions, setReferredByOptions] = useState<string[]>([]);
  const [referralContactOptions, setReferralContactOptions] = useState<string[]>([]);
  const [nameToContacts, setNameToContacts] = useState<Record<string, string[]>>({});
  const [contactToNames, setContactToNames] = useState<Record<string, string[]>>({});
  const [showReferredByDropdown, setShowReferredByDropdown] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [loadingReferralOptions, setLoadingReferralOptions] = useState(false);

  const referredByContainerRef = useRef<HTMLDivElement>(null);
  const contactContainerRef = useRef<HTMLDivElement>(null);
  const referredByMenuRef = useRef<HTMLDivElement>(null);
  const contactMenuRef = useRef<HTMLDivElement>(null);

  const [referredByCoords, setReferredByCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [contactCoords, setContactCoords] = useState<{ top: number; left: number; width: number } | null>(null);

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

  const updateReferredByCoords = () => {
    const el = referredByContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setReferredByCoords({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  const updateContactCoords = () => {
    const el = contactContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setContactCoords({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  // Keep portal dropdowns positioned on scroll and resize
  useEffect(() => {
    if (!showReferredByDropdown && !showContactDropdown) return;
    const handleReposition = () => {
      if (showReferredByDropdown) updateReferredByCoords();
      if (showContactDropdown) updateContactCoords();
    };
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [showReferredByDropdown, showContactDropdown]);

  // Close custom suggestion dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        referredByContainerRef.current &&
        !referredByContainerRef.current.contains(target) &&
        !referredByMenuRef.current?.contains(target)
      ) {
        setShowReferredByDropdown(false);
      }
      if (
        contactContainerRef.current &&
        !contactContainerRef.current.contains(target) &&
        !contactMenuRef.current?.contains(target)
      ) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  // Fetch options (existing referrers and contacts) when referral_type changes
  useEffect(() => {
    if (formData.patient_type !== "Referral" || !effectiveReferralType) {
      setReferredByOptions([]);
      setReferralContactOptions([]);
      setNameToContacts({});
      setContactToNames({});
      return;
    }

    setLoadingReferralOptions(true);
    referralApi
      .getOptions(effectiveReferralType)
      .then((data) => {
        setReferredByOptions(data.referred_by || []);
        setReferralContactOptions(data.referral_contact || []);
        setNameToContacts(data.nameToContacts || {});
        setContactToNames(data.contactToNames || {});
      })
      .catch(() => {
        setReferredByOptions([]);
        setReferralContactOptions([]);
        setNameToContacts({});
        setContactToNames({});
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

  const handleSelectReferredBy = (name: string) => {
    setField("referred_by", name);
    setShowReferredByDropdown(false);
    // Bidirectional sync: auto-fill contact if available
    const contacts = nameToContacts[name];
    if (contacts && contacts.length > 0) {
      setField("referral_contact", contacts[0]);
    }
  };

  const handleSelectContact = (contact: string) => {
    setField("referral_contact", contact);
    setShowContactDropdown(false);
    // Bidirectional sync: auto-fill referred_by if available
    const names = contactToNames[contact];
    if (names && names.length > 0) {
      setField("referred_by", names[0]);
    }
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

      // Address and emergency-contact fields map onto the patient_bio_data
      // columns Patient_address / Patient_Emergency_contact_name /
      // Emergency_contact_relation / Patient_emergency_mobile in the backend
      // service. created_by is required by the backend validation even though
      // the controller actually derives it from the logged-in user's auth token.
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

      navigate(-1);
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
                    if (val !== "Referral") setReferralOtherInput("");
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
                          setField("referral_type", val);
                          if (!needsReferralBranchName(val)) {
                            setField("referral_branch_name", "");
                          }
                          if (val !== OTHER_REFERRAL_TYPE_VALUE && val !== "Other") {
                            setReferralOtherInput("");
                          }
                        }}
                        placeholder="Select referral type"
                        disabled={submitting}
                      />
                    </div>

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
                      <div className="col-span-2">
                        <label className={labelCls}>
                          Referral Hospital name <Req />
                        </label>
                        <input
                          type="text"
                          name="referral_branch_name"
                          placeholder="Enter referral branch name"
                          maxLength={150}
                          className={inputCls}
                          value={formData.referral_branch_name}
                          onChange={(e) => setField("referral_branch_name", e.target.value)}
                          disabled={submitting}
                        />
                      </div>
                    )}

                    <div className="relative" ref={referredByContainerRef}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className={labelCls}>
                          Referred by <Req />
                        </label>
                        {referredByOptions.length > 0 && (
                          <span className="text-[11px] text-blue-600 font-medium">
                            {referredByOptions.length} available
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          name="referred_by"
                          placeholder={
                            loadingReferralOptions
                              ? "Loading options..."
                              : referredByOptions.length > 0
                              ? "Type or select referrer"
                              : "e.g. Dr. Ramesh Kumar, City Clinic"
                          }
                          maxLength={100}
                          className={cn(inputCls, referredByOptions.length > 0 && "pr-14")}
                          value={formData.referred_by}
                          onFocus={() => {
                            if (referredByOptions.length > 0) {
                              updateReferredByCoords();
                              setShowReferredByDropdown(true);
                            }
                          }}
                          onClick={() => {
                            if (referredByOptions.length > 0) {
                              updateReferredByCoords();
                              setShowReferredByDropdown(true);
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setField("referred_by", val);
                            if (referredByOptions.length > 0) {
                              updateReferredByCoords();
                              setShowReferredByDropdown(true);
                            }
                            const matchedContact = nameToContacts[val.trim()]?.[0];
                            if (!formData.referral_contact && matchedContact) {
                              setField("referral_contact", matchedContact);
                            }
                          }}
                          disabled={submitting}
                          autoComplete="off"
                        />
                        {loadingReferralOptions ? (
                          <Loader2 className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                        ) : referredByOptions.length > 0 ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => {
                              updateReferredByCoords();
                              setShowReferredByDropdown((p) => !p);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none flex items-center gap-1 bg-white rounded-md shadow-sm border border-gray-100 px-1.5"
                            title="Select existing referrer"
                          >
                            <span className="text-[10px] font-semibold text-blue-600">
                              {referredByOptions.length}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                showReferredByDropdown && "rotate-180",
                              )}
                            />
                          </button>
                        ) : null}
                      </div>

                      {showReferredByDropdown && referredByOptions.length > 0 && referredByCoords
                        ? createPortal(
                            <div
                              ref={referredByMenuRef}
                              style={{
                                position: "fixed",
                                top: referredByCoords.top,
                                left: referredByCoords.left,
                                width: referredByCoords.width,
                                zIndex: 9999,
                              }}
                              className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 text-gray-900 shadow-[0_12px_32px_rgba(0,0,0,0.15)] origin-top"
                            >
                              {referredByOptions.map((opt) => {
                                const isSelected =
                                  formData.referred_by.trim().toLowerCase() === opt.trim().toLowerCase();
                                const contact = nameToContacts[opt]?.[0];
                                return (
                                  <div
                                    key={opt}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectReferredBy(opt);
                                    }}
                                    className={cn(
                                      "px-3.5 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between transition-colors",
                                      isSelected && "bg-blue-50/70 font-medium text-blue-700",
                                    )}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-[13px] text-gray-900 font-medium">{opt}</span>
                                      <span className="text-[11px] text-gray-400">
                                        {contact ? `Contact: ${contact}` : "No contact saved"}
                                      </span>
                                    </div>
                                    {isSelected && <Check className="h-4 w-4 text-blue-600 ml-2 shrink-0" />}
                                  </div>
                                );
                              })}
                            </div>,
                            document.body,
                          )
                        : null}
                    </div>

                    <div className="relative" ref={contactContainerRef}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className={labelCls}>
                          Referrer contact <Opt />
                        </label>
                        {referralContactOptions.length > 0 && (
                          <span className="text-[11px] text-blue-600 font-medium">
                            {referralContactOptions.length} available
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <PhoneInput
                          name="referral_contact"
                          value={formData.referral_contact}
                          onChange={(value) => {
                            setField("referral_contact", value);
                            const cleanVal = value.trim();
                            const matchedName = contactToNames[cleanVal]?.[0];
                            if (!formData.referred_by && matchedName) {
                              setField("referred_by", matchedName);
                            }
                          }}
                          placeholder="Enter contact number"
                          disabled={submitting}
                          defaultCountry="in"
                        />
                        {referralContactOptions.length > 0 && (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => {
                              updateContactCoords();
                              setShowContactDropdown((p) => !p);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none flex items-center gap-1 bg-white rounded-md shadow-sm border border-gray-100 px-1.5"
                            title="Select existing contact"
                          >
                            <span className="text-[10px] font-semibold text-blue-600">
                              {referralContactOptions.length}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                showContactDropdown && "rotate-180",
                              )}
                            />
                          </button>
                        )}
                      </div>

                      {showContactDropdown && referralContactOptions.length > 0 && contactCoords
                        ? createPortal(
                            <div
                              ref={contactMenuRef}
                              style={{
                                position: "fixed",
                                top: contactCoords.top,
                                left: contactCoords.left,
                                width: contactCoords.width,
                                zIndex: 9999,
                              }}
                              className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 text-gray-900 shadow-[0_12px_32px_rgba(0,0,0,0.15)] origin-top"
                            >
                              {referralContactOptions.map((contact) => {
                                const isSelected = formData.referral_contact.trim() === contact.trim();
                                const name = contactToNames[contact]?.[0];
                                return (
                                  <div
                                    key={contact}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectContact(contact);
                                    }}
                                    className={cn(
                                      "px-3.5 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between transition-colors",
                                      isSelected && "bg-blue-50/70 font-medium text-blue-700",
                                    )}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-[13px] text-gray-900 font-medium">{contact}</span>
                                      <span className="text-[11px] text-gray-400">
                                        {name ? `Referred by: ${name}` : "Referrer name not linked"}
                                      </span>
                                    </div>
                                    {isSelected && <Check className="h-4 w-4 text-blue-600 ml-2 shrink-0" />}
                                  </div>
                                );
                              })}
                            </div>,
                            document.body,
                          )
                        : null}
                    </div>

                    <div className="col-span-2">
                      <label className={labelCls}>
                        Referral address <Req />
                      </label>
                      <input
                        type="text"
                        name="referral_address"
                        placeholder="Enter referral address"
                        maxLength={255}
                        className={inputCls}
                        value={formData.referral_address}
                        onChange={(e) => setField("referral_address", e.target.value)}
                        disabled={submitting}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>
                        Referral mail <Opt />
                      </label>
                      <input
                        type="email"
                        name="referral_mail"
                        placeholder="e.g. referrer@example.com"
                        maxLength={100}
                        className={inputCls}
                        value={formData.referral_mail}
                        onChange={(e) => setField("referral_mail", e.target.value)}
                        disabled={submitting}
                      />
                    </div>

                    <div className="col-span-3">
                      <label className={labelCls}>
                        Referral notes <Opt />
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Additional info (address, department, special instructions)"
                        maxLength={2000}
                        className={inputCls}
                        value={formData.referral_notes}
                        onChange={(e) => setField("referral_notes", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
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
    </div>
  );
}
