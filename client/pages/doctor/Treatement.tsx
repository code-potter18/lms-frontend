import React, { useState } from "react";
import { BellNotificationButton } from "@/components/hms/BellNotificationButton";

type TreatmentType =
  | "Chemotherapy"
  | "Surgery"
  | "Radiation"
  | "Targeted Therapy";

const TreatmentPlan: React.FC = () => {
  const [treatmentIntent, setTreatmentIntent] =
    useState("Curative");

  const [treatmentTypes, setTreatmentTypes] = useState<
    TreatmentType[]
  >(["Chemotherapy"]);

  const [lineOfTherapy, setLineOfTherapy] =
    useState("First Line");

  const [plannedStartDate, setPlannedStartDate] =
    useState("20-06-2026");

  const [protocol, setProtocol] =
    useState("FOLFOX (2 Weekly)");

  const [remarks, setRemarks] = useState(
    "Plan for 12 cycles followed by surgery."
  );

  const [activeStep, setActiveStep] = useState(2);

  const treatmentOptions: TreatmentType[] = [
    "Chemotherapy",
    "Surgery",
    "Radiation",
    "Targeted Therapy",
  ];

  const toggleTreatmentType = (
    type: TreatmentType
  ) => {
    setTreatmentTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type]
    );
  };

  const handleNext = () => {
    const treatmentPlan = {
      treatmentIntent,
      treatmentTypes,
      lineOfTherapy,
      plannedStartDate,
      protocol,
      remarks,
    };

    console.log("Treatment Plan:", treatmentPlan);

    alert("Treatment plan saved successfully.");

    setActiveStep(3);
  };

  const handleBack = () => {
    window.history.back();
  };

  const handleViewProfile = () => {
    console.log("View Full Profile clicked");
  };

  /* =========================================================
     ICONS
  ========================================================= */

  const ArrowLeftIcon = () => (
    <svg
      className="h-5 w-5"
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
      className="mr-2 h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2
        19.79 19.79 0 0 1-8.63-3.07
        19.5 19.5 0 0 1-6-6
        A19.79 19.79 0 0 1 2.12 4.18
        2 2 0 0 1 4.11 2h3
        a2 2 0 0 1 2 1.72
        c.12.9.33 1.78.62 2.63
        a2 2 0 0 1-.45 2.11L8 9.73
        a16 16 0 0 0 6 6l1.27-1.27
        a2 2 0 0 1 2.11-.45
        c.85.29 1.73.5 2.63.62
        A2 2 0 0 1 22 16.92z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const EnvelopeIcon = () => (
    <svg
      className="mr-2 h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
      />
      <path
        d="m3 7 9 6 9-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CalendarIcon = () => (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="2"
      />
      <path
        d="M16 2v4M8 2v4M3 10h18"
        strokeLinecap="round"
      />
    </svg>
  );

  const ChevronDownIcon = () => (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="m6 9 6 6 6-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CheckIcon = () => (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path
        d="m5 12 4 4L19 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const DoubleArrowIcon = () => (
    <svg
      className="mr-2 h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        d="m6 7 5 5-5 5M13 7l5 5-5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  /* =========================================================
     COMPONENT
  ========================================================= */

  return (
    <div className="flex min-h-screen bg-white text-slate-800 antialiased">

      {/* =======================================================
          LEFT SIDEBAR
      ======================================================== */}

      <aside className="flex w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white">

        {/* Patient Profile */}
        <div className="flex flex-col items-center border-b border-slate-200 p-8">

          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCdW6D5nlMmKfJtScuPrdJ-78e0bB5mfUyxq282S5UaLdcBAkmQ7fweUAQfxOph1gHVmEGAp8yBjGeAtFjZ9D9VYsTday9niX72xw_4av3YtIMLe46ozNXl2gERyusKWKYkzvet6CvSZkL9GYf1W56P9H7z3Xg1UzauThU_5KTyV-QRVG0CVCLCOtlbENMP56SmG_K7WwjVFs0ZPWYC0mro5ljV5968TCZ_x3H2G8jiv42saEDoTvxv2ZjtfdMW1edz7w"
            alt="Patient Photo"
            className="mb-4 h-32 w-32 rounded-full border border-slate-100 object-cover object-[50%_10%] shadow-sm"
          />

          <h2 className="mb-1 text-xs font-bold text-slate-900">
            Vijaya Nallusamy
          </h2>

          <p className="mb-3 text-[10px] text-slate-500">
            51 Y / Female
          </p>

          <div className="mb-4 rounded-md bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-600">
            ONC-2026-10025
          </div>

          <p className="text-center text-[10px] font-bold tracking-wide text-blue-700">
            DUCTAL CARCINOMA STAGE II
          </p>
        </div>

        {/* Patient Information */}
        <div className="flex-1 space-y-6 overflow-y-auto p-8">

          {/* Phone */}
          <div>
            <div className="mb-1 flex items-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <PhoneIcon />
              PHONE
            </div>

            <p className="text-[10px] text-slate-900">
              +91 98765 43210
            </p>
          </div>

          {/* Email */}
          <div>
            <div className="mb-1 flex items-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <EnvelopeIcon />
              EMAIL
            </div>

            <p className="text-[10px] text-slate-900">
              vijaya.n@example.com
            </p>
          </div>

          {/* Vitals */}
          <div className="grid grid-cols-2 gap-y-6 pt-2">

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                HEIGHT
              </div>
              <p className="text-[10px] font-semibold text-slate-900">
                154 cm
              </p>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                WEIGHT
              </div>
              <p className="text-[10px] font-semibold text-slate-900">
                52 kg
              </p>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                BSA
              </div>
              <p className="text-[10px] font-semibold text-slate-900">
                1.49 m²
              </p>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                BMI
              </div>
              <p className="text-[10px] font-semibold text-slate-900">
                21.93
              </p>
            </div>

          </div>
        </div>

        {/* Profile Button */}
        <div className="p-6">

          <button
            type="button"
            onClick={handleViewProfile}
            className="w-full rounded-lg border-2 border-blue-600 py-2.5 text-[10px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            View Full Profile
          </button>

        </div>
      </aside>

      {/* =======================================================
          MAIN CONTENT
      ======================================================== */}

      <main className="flex min-w-0 flex-1 flex-col bg-[#fafafa]">

        {/* =====================================================
            TOP NAVIGATION
        ====================================================== */}

        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">

          {/* Left */}
          <div className="flex items-center">

            <button
              type="button"
              onClick={handleBack}
              className="mr-4 text-slate-500 transition-colors hover:text-slate-700 focus:outline-none"
              aria-label="Go back"
            >
              <ArrowLeftIcon />
            </button>

            <h1 className="text-2xl font-bold text-slate-900">
              Patients
            </h1>

          </div>

          {/* Right */}
          <div className="flex items-center space-x-6">

            <BellNotificationButton size="md" />

            <div className="flex items-center space-x-3 border-l border-slate-200 pl-6">

              <span className="font-bold text-slate-800">
                HMS
              </span>

              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-800 text-xs font-bold text-white">
                DR
              </div>

            </div>
          </div>
        </header>

        {/* =====================================================
            SCROLLABLE MAIN AREA
        ====================================================== */}

        <div className="flex-1 overflow-y-auto">

          <div className="mx-auto max-w-[1200px] p-8">

            {/* =================================================
                STEPPER
            ================================================== */}

            <div className="mb-8 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">

              <div className="relative mx-auto flex max-w-4xl items-start justify-between">

                {/* Connecting Line */}
                <div className="absolute left-[16.66%] right-[16.66%] top-3 hidden h-0.5 bg-slate-200 md:block" />

                {/* Step 1 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="relative z-10 flex w-1/3 flex-col items-center"
                >

                  <div
                    className={`mb-3 flex h-6 w-6 items-center justify-center rounded-full text-white ${
                      activeStep >= 1
                        ? "bg-green-500"
                        : "bg-slate-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="text-xs font-bold tracking-wider text-slate-900">
                    DIAGNOSIS
                  </span>

                </button>

                {/* Step 2 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="relative z-10 flex w-1/3 flex-col items-center"
                >

                  <div
                    className={`mb-3 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-md ring-4 ring-white ${
                      activeStep >= 2
                        ? "bg-green-500"
                        : "bg-slate-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="mb-2 text-xs font-bold tracking-wider text-slate-900">
                    TREATMENT PLAN
                  </span>

                  {activeStep === 2 && (
                    <div className="h-1.5 w-48 max-w-full rounded-full bg-green-500" />
                  )}

                </button>

                {/* Step 3 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="relative z-10 flex w-1/3 flex-col items-center"
                >

                  <div
                    className={`mb-3 flex h-6 w-6 items-center justify-center rounded-full text-white ${
                      activeStep >= 3
                        ? "bg-green-500"
                        : "bg-slate-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="text-center text-xs font-bold tracking-wider text-slate-900">
                    CHEMOTHERAPY ORDER
                  </span>

                </button>

              </div>
            </div>

            {/* =================================================
                FORM AREA
            ================================================== */}

            <div className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="space-y-8 p-8">

                {/* ============================================
                    TREATMENT INTENT
                ============================================= */}

                <div>

                  <label
                    htmlFor="treatmentIntent"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Treatment Intent
                  </label>

                  <div className="relative w-full max-w-md">

                    <select
                      id="treatmentIntent"
                      value={treatmentIntent}
                      onChange={(event) =>
                        setTreatmentIntent(event.target.value)
                      }
                      className="block w-full appearance-none rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="Curative">
                        Curative
                      </option>

                      <option value="Palliative">
                        Palliative
                      </option>
                    </select>

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                      <ChevronDownIcon />
                    </div>

                  </div>
                </div>

                {/* ============================================
                    TREATMENT TYPE
                ============================================= */}

                <div>

                  <label className="mb-3 block text-sm font-semibold text-slate-700">
                    Treatment Type
                  </label>

                  <div className="flex flex-wrap gap-6">

                    {treatmentOptions.map((type) => {
                      const checked =
                        treatmentTypes.includes(type);

                      return (
                        <label
                          key={type}
                          className="flex cursor-pointer items-center"
                        >

                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleTreatmentType(type)
                            }
                            className="h-5 w-5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />

                          <span className="ml-2 text-slate-700">
                            {type}
                          </span>

                        </label>
                      );
                    })}

                  </div>
                </div>

                {/* ============================================
                    LINE + START DATE
                ============================================= */}

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">

                  {/* Line of Therapy */}
                  <div>

                    <label
                      htmlFor="lineOfTherapy"
                      className="mb-2 block text-sm font-semibold text-slate-700"
                    >
                      Line of Therapy
                    </label>

                    <div className="relative">

                      <select
                        id="lineOfTherapy"
                        value={lineOfTherapy}
                        onChange={(event) =>
                          setLineOfTherapy(event.target.value)
                        }
                        className="block w-full appearance-none rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="First Line">
                          First Line
                        </option>

                        <option value="Second Line">
                          Second Line
                        </option>
                      </select>

                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        <ChevronDownIcon />
                      </div>

                    </div>
                  </div>

                  {/* Planned Start Date */}
                  <div>

                    <label
                      htmlFor="plannedStartDate"
                      className="mb-2 block text-sm font-semibold text-slate-700"
                    >
                      Planned Start Date
                    </label>

                    <div className="relative">

                      <input
                        id="plannedStartDate"
                        type="text"
                        value={plannedStartDate}
                        onChange={(event) =>
                          setPlannedStartDate(event.target.value)
                        }
                        className="block w-full rounded-lg border border-slate-300 bg-white p-3 pr-12 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />

                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400">
                        <CalendarIcon />
                      </div>

                    </div>
                  </div>
                </div>

                {/* ============================================
                    PROTOCOL
                ============================================= */}

                <div>

                  <div className="mb-2 flex items-center justify-between">

                    <label
                      htmlFor="protocol"
                      className="block text-sm font-semibold text-slate-700"
                    >
                      Protocol
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        console.log("View Protocol clicked")
                      }
                      className="text-sm font-semibold text-blue-700 hover:underline"
                    >
                      View Protocol
                    </button>

                  </div>

                  <div className="relative">

                    <select
                      id="protocol"
                      value={protocol}
                      onChange={(event) =>
                        setProtocol(event.target.value)
                      }
                      className="block w-full appearance-none rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="FOLFOX (2 Weekly)">
                        FOLFOX (2 Weekly)
                      </option>

                      <option value="FOLFIRI (2 Weekly)">
                        FOLFIRI (2 Weekly)
                      </option>

                      <option value="CAPOX (3 Weekly)">
                        CAPOX (3 Weekly)
                      </option>
                    </select>

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                      <ChevronDownIcon />
                    </div>

                  </div>
                </div>

                {/* ============================================
                    REMARKS
                ============================================= */}

                <div>

                  <label
                    htmlFor="remarks"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Remarks
                  </label>

                  <textarea
                    id="remarks"
                    rows={3}
                    value={remarks}
                    onChange={(event) =>
                      setRemarks(event.target.value)
                    }
                    className="block w-full resize-none rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />

                </div>

              </div>

              {/* ================================================
                  FORM FOOTER
              ================================================= */}

              <div className="flex justify-end rounded-b-xl border-t border-slate-200 bg-slate-50 p-6">

                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center rounded-lg bg-[#1d4ed8] px-6 py-2.5 font-semibold text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <DoubleArrowIcon />
                  Next
                </button>

              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default TreatmentPlan;