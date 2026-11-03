import React, { useState } from "react";
import { BellNotificationButton } from "@/components/hms/BellNotificationButton";

type Medication = {
  id: number;
  drugName: string;
  dosage: string;
  frequency: string;
  instruction: string;
  duration: string;
};

const PatientDischargeMedication: React.FC = () => {
  const [medications, setMedications] = useState<Medication[]>([
    {
      id: 1,
      drugName: "Capecitabine",
      dosage: "500 mg",
      frequency: "2-0-2",
      instruction: "After Food",
      duration: "14 Days",
    },
    {
      id: 2,
      drugName: "Domstal",
      dosage: "10 mg",
      frequency: "1-1-1",
      instruction: "Before Food",
      duration: "14 Days",
    },
    {
      id: 3,
      drugName: "Loperamide",
      dosage: "2 mg",
      frequency: "SOS",
      instruction: "After Loose Motion",
      duration: "5 Days",
    },
    {
      id: 4,
      drugName: "Pantoprazole",
      dosage: "40 mg",
      frequency: "1-0-1",
      instruction: "Before Food",
      duration: "14 Days",
    },
  ]);

  const [activeStep, setActiveStep] = useState(1);

  const handleAddDrug = () => {
    const newMedication: Medication = {
      id: Date.now(),
      drugName: "New Drug",
      dosage: "0 mg",
      frequency: "1-0-1",
      instruction: "After Food",
      duration: "7 Days",
    };

    setMedications((current) => [...current, newMedication]);
  };

  const handleNext = () => {
    if (activeStep < 3) {
      setActiveStep((current) => current + 1);
    }
  };

  const handleBack = () => {
    window.history.back();
  };

  const handleViewProfile = () => {
    console.log("View Full Profile");
  };

  /* ================= ICONS ================= */

  const ArrowLeftIcon = () => (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M19 12H5M12 19l-7-7 7-7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const PhoneIcon = () => (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.12.9.33 1.78.62 2.63a2 2 0 01-.45 2.11L8 9.73a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0122 16.92z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const MailIcon = () => (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
      />
      <path
        d="M3 7l9 6 9-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CheckIcon = () => (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path
        d="M5 12l4 4L19 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const DoubleArrowIcon = () => (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M6 7l5 5-5 5M13 7l5 5-5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-gray-800 antialiased">
      {/* =========================================================
          SIDEBAR
      ========================================================== */}
      <aside className="relative z-20 flex min-h-screen w-80 shrink-0 flex-col border-r border-gray-200 bg-white">
        {/* Profile Summary */}
        <div className="flex flex-col items-center border-b border-gray-200 p-8">
          <div className="relative mb-6 h-32 w-32 overflow-hidden rounded-full ring-4 ring-[#eab308] shadow-sm">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCnsdAYC4K7vv6d8dEOYDc2tUF4lEiQxVv5rMG9UTzBJQv4yIcMv_4mbdll__QCclcJuf6NeqfLMuP3yVcRd73LeRuA6aV50wx-yzVKgsWW3A30ft0JHXjZG7oKynjg4uxep0YUPqWnJlJBowieFaiClZsF236pjJKmz6f-0Va0Nf2gPPr6Lk4IzQzNeU3O8f_59fTnrcnNhSKrpy-WRQ5R0HRanbu6B0Pi--KmCbyeTDK48fnhrtGA"
              alt="Vijaya Nallusamy"
              className="h-full w-full object-cover"
            />
          </div>

          <h2 className="mb-2 text-xs font-bold text-gray-900">
            Vijaya Nallusamy
          </h2>

          <p className="mb-4 text-[10px] text-gray-500">
            51 Y / Female
          </p>

          <span className="mb-6 rounded-full bg-gray-100 px-4 py-1.5 text-[10px] font-semibold text-gray-600">
            ONC-2026-10025
          </span>

          <p className="text-center text-[10px] font-bold tracking-wide text-blue-700">
            DUCTAL CARCINOMA STAGE II
          </p>
        </div>

        {/* Contact */}
        <div className="space-y-6 border-b border-gray-200 p-8">
          <div className="flex items-start gap-4">
            <PhoneIcon />

            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Phone
              </p>

              <p className="text-[10px] font-medium text-gray-700">
                +91 98765 43210
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <MailIcon />

            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Email
              </p>

              <p className="text-[10px] font-medium text-gray-700">
                vijaya.n@example.com
              </p>
            </div>
          </div>
        </div>

        {/* Vitals */}
        <div className="flex-grow space-y-8 p-8">
          <div className="grid grid-cols-2 gap-x-4 gap-y-6">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Height
              </p>

              <p className="text-[10px] font-bold text-gray-900">
                154 cm
              </p>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Weight
              </p>

              <p className="text-[10px] font-bold text-gray-900">
                52 kg
              </p>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                BSA
              </p>

              <p className="text-[10px] font-bold text-gray-900">
                1.49 m²
              </p>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                BMI
              </p>

              <p className="text-[10px] font-bold text-gray-900">
                21.93
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleViewProfile}
            className="mt-8 w-full rounded-md border border-blue-600 px-4 py-2.5 text-[10px] font-semibold text-blue-600 transition-colors duration-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            View Full Profile
          </button>
        </div>
      </aside>

      {/* =========================================================
          MAIN CONTENT
      ========================================================== */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col bg-gray-50">
        {/* =======================================================
            TOP HEADER
        ======================================================== */}
        <header className="relative z-20 flex h-20 shrink-0 items-center justify-between bg-white px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              className="-ml-2 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
            >
              <ArrowLeftIcon />
            </button>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Patients
            </h1>
          </div>

          <div className="flex items-center gap-6">
            {/* Notification */}
            <BellNotificationButton size="md" />

            {/* User */}
            <div className="flex items-center gap-4 border-l border-gray-200 pl-6">
              <span className="text-sm font-bold tracking-wide text-gray-700">
                HMS
              </span>

              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-900 text-sm font-bold text-white">
                DR
              </div>
            </div>
          </div>
        </header>

        {/* Background under stepper */}
        <div className="absolute left-0 right-0 top-20 z-0 h-40 border-b border-gray-200 bg-white" />

        {/* =======================================================
            CONTENT
        ======================================================== */}
        <div className="relative z-10 flex-1 overflow-y-auto p-8 pt-0">
          {/* =====================================================
              STEPPER
          ====================================================== */}
          <div className="mx-auto mb-4 max-w-[1200px] bg-white px-4 pb-4 pt-10">
            <div className="relative flex items-center justify-between pb-6">
              {/* Track */}
              <div className="absolute bottom-[2px] left-[10%] right-[10%] h-[2px] rounded-full bg-gray-100" />

              {/* Step 1 */}
              <div className="relative z-10 flex w-1/3 flex-col items-center">
                <div
                  className={`mb-3 flex h-7 w-7 items-center justify-center rounded-full text-white ${
                    activeStep >= 1
                      ? "bg-[#22c55e]"
                      : "bg-gray-400"
                  }`}
                >
                  <CheckIcon />
                </div>

                <span
                  className={`text-center text-[10px] font-bold uppercase tracking-widest ${
                    activeStep === 1
                      ? "text-gray-900"
                      : "text-gray-600"
                  }`}
                >
                  Discharge Medication
                </span>

                {activeStep === 1 && (
                  <div className="absolute -bottom-[26px] left-[10%] right-0 z-20 h-1 rounded-full bg-[#22c55e]" />
                )}
              </div>

              {/* Step 2 */}
              <div className="relative z-10 flex w-1/3 flex-col items-center">
                <div
                  className={`mb-3 flex h-7 w-7 items-center justify-center rounded-full text-white ${
                    activeStep >= 2
                      ? "bg-[#22c55e]"
                      : "bg-gray-400"
                  }`}
                >
                  <CheckIcon />
                </div>

                <span
                  className={`text-center text-[10px] font-bold uppercase tracking-widest ${
                    activeStep === 2
                      ? "text-gray-900"
                      : "text-gray-600"
                  }`}
                >
                  Follow Up
                </span>

                {activeStep === 2 && (
                  <div className="absolute -bottom-[26px] left-0 right-0 z-20 h-1 rounded-full bg-[#22c55e]" />
                )}
              </div>

              {/* Step 3 */}
              <div className="relative z-10 flex w-1/3 flex-col items-center">
                <div
                  className={`mb-3 flex h-7 w-7 items-center justify-center rounded-full text-white ${
                    activeStep >= 3
                      ? "bg-[#22c55e]"
                      : "bg-gray-400"
                  }`}
                >
                  <CheckIcon />
                </div>

                <span
                  className={`text-center text-[10px] font-bold uppercase tracking-widest ${
                    activeStep === 3
                      ? "text-gray-900"
                      : "text-gray-600"
                  }`}
                >
                  Summary
                </span>

                {activeStep === 3 && (
                  <div className="absolute -bottom-[26px] left-0 right-[10%] z-20 h-1 rounded-full bg-[#22c55e]" />
                )}
              </div>
            </div>
          </div>

          {/* =====================================================
              MEDICATION CARD
          ====================================================== */}
          <div className="relative z-10 mx-auto mb-8 max-w-[1200px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="w-1/4 px-8 py-5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                      Drug Name
                    </th>

                    <th className="w-1/6 px-8 py-5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                      Dosage
                    </th>

                    <th className="w-1/6 px-8 py-5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                      Frequency
                    </th>

                    <th className="w-1/4 px-8 py-5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                      Instruction
                    </th>

                    <th className="w-1/6 px-8 py-5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                      Duration
                    </th>
                  </tr>
                </thead>

                <tbody className="text-sm text-gray-500">
                  {medications.map((medication) => (
                    <tr
                      key={medication.id}
                      className="border-b border-gray-100 transition-colors hover:bg-gray-50 last:border-gray-200"
                    >
                      <td className="px-8 py-6 text-gray-800">
                        {medication.drugName}
                      </td>

                      <td className="px-8 py-6">
                        {medication.dosage}
                      </td>

                      <td className="px-8 py-6">
                        {medication.frequency}
                      </td>

                      <td className="px-8 py-6">
                        {medication.instruction}
                      </td>

                      <td className="px-8 py-6">
                        {medication.duration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Drug */}
            <div className="flex justify-end p-6">
              <button
                type="button"
                onClick={handleAddDrug}
                className="rounded border border-blue-600 px-6 py-2 text-sm font-semibold text-blue-600 transition-colors duration-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Add Drug
              </button>
            </div>
          </div>

          {/* =====================================================
              FOOTER ACTION
          ====================================================== */}
          <div className="relative z-10 mx-auto mb-8 flex max-w-[1200px] justify-end">
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 rounded-md bg-[#1d4ed8] px-8 py-3 font-bold text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <DoubleArrowIcon />
              Next
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PatientDischargeMedication;