import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enrichPerson: vi.fn(async ({ enrichments }: { enrichments: string[] }) => ({
  fields: Object.fromEntries(enrichments.map((field) => [field, { status: "success", value: field === "email" ? "alice@example.com" : field === "phone" ? "+1 415 555 0100" : { headline: "Founder" } }])),
  warnings: [], raw: { data: {} }, requestId: "req_1", creditsCharged: 1,
})) }));

vi.mock("@/lib/ploid/client", () => ({
  enrichPerson: mocks.enrichPerson,
  enrichSocial: vi.fn(),
  isPloidPersonEnrichment: (value: unknown) => ["email", "phone", "profile"].includes(String(value)),
  runPloidAgent: vi.fn(),
}));

import { createFunction, runEnrichment, runFunction } from "./service";
import { createWorkspace, saveWorkspace } from "@/lib/workspace/store";

describe("shared Ploid person Function", () => {
  it("uses exactly one provider request for all selected outputs in a row", async () => {
    mocks.enrichPerson.mockClear();
    const fn = createFunction({
      name: "Person Enrichment",
      inputs: [{ id: "linkedin_url", name: "LinkedIn", dataType: "url" }],
      outputs: ["email", "phone", "profile"].map((id) => ({ id, name: id, dataType: "text" })),
      nodes: [{ id: "node", type: "ploid_enrich", config: { linkedinInput: "linkedin_url", fields: ["email", "phone", "profile"] } }],
    });
    const result = await runFunction(fn.id, { linkedin_url: "https://www.linkedin.com/in/alice" }, { trigger: "manual", bypassCache: true });
    expect(result.status).toBe("complete");
    expect(mocks.enrichPerson).toHaveBeenCalledTimes(1);
    expect(result.outputs).toMatchObject({ email: "alice@example.com", phone: "+1 415 555 0100" });
  });

  it("reruns once when an output enabled later was never requested", async () => {
    mocks.enrichPerson.mockClear();
    const fn = createFunction({
      name: "Person Enrichment",
      inputs: [{ id: "linkedin_url", name: "LinkedIn", dataType: "url" }],
      outputs: ["email", "phone"].map((id) => ({ id, name: id, dataType: "text" })),
      nodes: [{ id: "node_later_output", type: "ploid_enrich", config: { linkedinInput: "linkedin_url", fields: ["email", "phone"] } }],
    });
    const workspace = createWorkspace({ name: "Later output", kind: "people" });
    workspace.table.columns = [
      { id: "linkedin", name: "LinkedIn", dataType: "url" },
      { id: "email", name: "Work Email", dataType: "email", functionBinding: { functionId: fn.id, outputId: "email", inputBindings: { linkedin_url: { type: "column", columnId: "linkedin" } } }, enrichmentBinding: { enrichmentId: "enr_later", functionId: fn.id, outputId: "email" } },
      { id: "phone", name: "Phone", dataType: "text", functionBinding: { functionId: fn.id, outputId: "phone", inputBindings: { linkedin_url: { type: "column", columnId: "linkedin" } } }, enrichmentBinding: { enrichmentId: "enr_later", functionId: fn.id, outputId: "phone" } },
    ];
    workspace.table.rows = [{ id: "row_1", cells: { linkedin: "https://www.linkedin.com/in/alice", email: "alice@example.com", phone: null } }];
    workspace.enrichments = [{
      id: "enr_later", name: "Person Enrichment", kind: "ploid_person", provider: "ploid",
      inputBindings: { linkedin_url: { type: "column", columnId: "linkedin" } },
      configuration: { enrichments: ["email", "phone"] }, steps: [{ id: "step", provider: "ploid", operation: "enrich" }],
      outputs: [
        { id: "email", label: "Work Email", field: "email", columnId: "email", dataType: "email" },
        { id: "phone", label: "Phone", field: "phone", columnId: "phone", dataType: "text" },
      ], runSettings: { autoUpdate: true }, functionId: fn.id,
      rowExecutions: { row_1: { runId: "old", rowId: "row_1", status: "complete", fieldStatuses: { email: "success" }, requestedOutputIds: ["email"], normalizedOutputs: { email: "alice@example.com" } } },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }];
    saveWorkspace(workspace);

    await runEnrichment(workspace.id, "enr_later", { scope: "missing" });
    expect(mocks.enrichPerson).toHaveBeenCalledTimes(1);
    expect(workspace.table.rows[0].cells.phone).toBe("+1 415 555 0100");
    expect(workspace.enrichments[0].rowExecutions?.row_1.requestedOutputIds).toEqual(["email", "phone"]);
  });
});
