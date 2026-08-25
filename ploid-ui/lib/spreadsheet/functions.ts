export type SavedFunction = {
  id: string;
  name: string;
  description: string;
  kind: "ai" | "formula";
  template: string;
  output: "text" | "number";
  inputs: string[];
};
export const defaultFunctions: SavedFunction[] = [
  {
    id: "company-summary",
    name: "Company Summary",
    description: "Summarizes a company in one sentence",
    kind: "ai",
    template: '=AI("Summarize this company: " & A{row})',
    output: "text",
    inputs: ["Company"],
  },
  {
    id: "industry-classifier",
    name: "Industry Classifier",
    description: "Classifies a company using its website",
    kind: "ai",
    template:
      '=AI("Determine the industry for " & A{row} & " using " & B{row})',
    output: "text",
    inputs: ["Company", "Website"],
  },
  {
    id: "company-site",
    name: "Company + Website",
    description: "Combines company and website",
    kind: "formula",
    template: '=CONCAT(A{row}, " · ", B{row})',
    output: "text",
    inputs: ["Company", "Website"],
  },
];
