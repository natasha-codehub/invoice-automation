export const approvedVendors = [
  "Microsoft Corporation",
  "Adobe Systems Inc",
  "Salesforce Inc",
  "AWS Inc",
  "Zoom Video Communications",
  "Matheson Tri-Gas Inc",
  "Sharpgas Inc",
  "Acme Supplies Ltd",
  "Oracle Corporation",
  "ServiceNow Inc",
  // Onboarded from the real /input ESPRIGAS supplier batch
  "Vern Lewis Welding Supply",
  "Xpedited Gas",
  "Haun Welding Supply Inc",
];

// Open POs: PO number → { amount, description }
export const openPOs = {
  "PO-2024-001": { amount: 10000, description: "Software licenses Q1" },
  "PO-2024-002": { amount: 5000,  description: "Cloud infrastructure" },
  "PO-2024-003": { amount: 8500,  description: "Industrial gas supply" },
  "PO-2024-004": { amount: 12000, description: "Video conferencing seats" },
  "PO-2024-005": { amount: 3200,  description: "Design software renewal" },
  "PO-2024-006": { amount: 6750,  description: "CRM subscription" },
  // Real /input batch — POs matched to the bundled supplier invoices
  "6528906-00":  { amount: 516.99, description: "Vern Lewis — industrial gas (Peoria)" },
  "40392712":    { amount: 455.00, description: "Xpedited Gas — gas delivery (intentionally 3% under to exercise the tolerance dial)" },
  "PO05032790":  { amount: 559.75, description: "Haun Welding — oxygen USP (Waymart)" },
  "PO-02050543": { amount: 249.31, description: "Haun Welding — mixed gas (Lagrangeville)" },
};
