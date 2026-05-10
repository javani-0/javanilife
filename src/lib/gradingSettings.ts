export interface FeeRow {
  level: string;
  eligibility: string;
  fee: string;
}

export interface GradingSettings {
  approvalLabel: string;
  collaborationText: string;
  collaborationHighlight: string;
  jgpSectionLabel: string;
  jgpHeading: string;
  jgpRows: FeeRow[];
  jgpNotes: string[];
  jdpSectionLabel: string;
  jdpHeading: string;
  jdpRows: FeeRow[];
  jdpNotes: string[];
}

export const defaultGradingSettings: GradingSettings = {
  approvalLabel: "IAF & ISO Approved",
  collaborationText: "In Collaboration with an authentic IAF, ISO Approved Certificate Providing Center",
  collaborationHighlight: "IAF, ISO Approved",
  jgpSectionLabel: "JAVANI GRADE PROGRAM (JGP)",
  jgpHeading: "Eligibility & Examination Fees",
  jgpRows: [
    { level: "I", eligibility: "5 Years / I Std Pass", fee: "₹ 12K + Tax" },
    { level: "II", eligibility: "6 Years / II Std Pass", fee: "₹ 15K + Tax" },
    { level: "III", eligibility: "7 Years / III Std Pass", fee: "₹ 18K + Tax" },
    { level: "IV", eligibility: "8 Years / IV Std Pass", fee: "₹ 21K + Tax" },
    { level: "V", eligibility: "9 Years / V Std Pass", fee: "₹ 21K + Tax" },
    { level: "VI", eligibility: "10 Years / VI Std Pass", fee: "₹ 24K + Tax" },
    { level: "VII", eligibility: "11 Years / VII Std Pass", fee: "₹ 24K + Tax" },
    { level: "VIII", eligibility: "12 Years / VIII Std Pass", fee: "₹ 27K + Tax" },
    { level: "IX", eligibility: "13 Years / IX Std Pass", fee: "₹ 27K + Tax" },
    { level: "X", eligibility: "14 Years / X Std Pass", fee: "₹ 30K + Tax" },
  ],
  jgpNotes: [
    "Once the examination admission is completed, study materials and an ID card will be provided.",
    "Hall Ticket will be published prior to the examination date.",
    "After completion of the examination, results and Grade Completion Certificates will be issued within 30 days.",
    "Demonstration audios & videos will be provided.",
    "Subject & notations Theory PDFs will be provided.",
    "Exam will be conducted in JAVANI SPIRITUAL HUB, Secunderabad.",
    "Exam will be conducted with live orchestra & according to the Training centre rules & regulations.",
    "Exam demonstration of students will be recorded for in-depth evaluation purposes.",
  ],
  jdpSectionLabel: "JAVANI DIPLOMA PROGRAM (JDP)",
  jdpHeading: "Eligibility & Fee Structure",
  jdpRows: [
    { level: "Semester I", eligibility: "Minimum 10th Std Completion / 4 years' experience in Artform", fee: "₹ 29,200 + Tax" },
    { level: "Semester II", eligibility: "Successful Completion of Semester I", fee: "₹ 29,200 + Tax" },
    { level: "Semester III", eligibility: "Successful Completion of Semester II", fee: "₹ 29,200 + Tax" },
    { level: "Semester IV", eligibility: "Successful Completion of Semester III", fee: "₹ 29,200 + Tax" },
  ],
  jdpNotes: [
    "Once the Diploma admission is completed, study materials and individual Student ID login will be provided.",
    "Examination / Assessment schedule will be published prior to the examination date.",
    "After completion of each semester examination, results and Semester Completion Certificates will be issued within 30 days.",
    "Upon successful completion of all semesters (or four semesters in the case of lateral entry), candidates will be awarded the Diploma Completion Certificate.",
    "Diploma covers (Practical 1 / Practical 2 / Project / Dissertation).",
    "Demonstration audios & videos will be provided.",
    "Subject & notations Theory PDFs will be provided.",
    "Exam will be conducted in JAVANI SPIRITUAL HUB, Secunderabad.",
    "Exam will be conducted with live orchestra & according to the Training centre rules & regulations.",
    "Exam demonstration of students will be recorded for in-depth evaluation purposes.",
  ],
};

const getRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

const getString = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value : fallback);

const normalizeRows = (value: unknown, fallback: FeeRow[]) => {
  if (!Array.isArray(value)) return fallback;

  const rows = value
    .map((item) => {
      const record = getRecord(item);
      const level = getString(record.level, "").trim();
      const eligibility = getString(record.eligibility, "").trim();
      const fee = getString(record.fee, "").trim();
      return level && eligibility && fee ? { level, eligibility, fee } : null;
    })
    .filter((item): item is FeeRow => item !== null);

  return rows.length > 0 ? rows : fallback;
};

const normalizeNotes = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const notes = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return notes.length > 0 ? notes : fallback;
};

export const normalizeGradingSettings = (value: unknown): GradingSettings => {
  const data = getRecord(value);

  return {
    approvalLabel: getString(data.approvalLabel, defaultGradingSettings.approvalLabel),
    collaborationText: getString(data.collaborationText, defaultGradingSettings.collaborationText),
    collaborationHighlight: getString(data.collaborationHighlight, defaultGradingSettings.collaborationHighlight),
    jgpSectionLabel: getString(data.jgpSectionLabel, defaultGradingSettings.jgpSectionLabel),
    jgpHeading: getString(data.jgpHeading, defaultGradingSettings.jgpHeading),
    jgpRows: normalizeRows(data.jgpRows, defaultGradingSettings.jgpRows),
    jgpNotes: normalizeNotes(data.jgpNotes, defaultGradingSettings.jgpNotes),
    jdpSectionLabel: getString(data.jdpSectionLabel, defaultGradingSettings.jdpSectionLabel),
    jdpHeading: getString(data.jdpHeading, defaultGradingSettings.jdpHeading),
    jdpRows: normalizeRows(data.jdpRows, defaultGradingSettings.jdpRows),
    jdpNotes: normalizeNotes(data.jdpNotes, defaultGradingSettings.jdpNotes),
  };
};
