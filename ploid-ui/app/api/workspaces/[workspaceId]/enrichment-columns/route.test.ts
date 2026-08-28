import { describe, expect, it } from "vitest";
import { createWorkspace, getWorkspace } from "@/lib/workspace/store";
import { POST } from "./route";
import { PATCH } from "../enrichments/[enrichmentId]/route";

describe("person enrichment creation", () => {
  it("creates one enrichment and Function with two output bindings", async () => {
    const workspace = createWorkspace({ name: "Test", kind: "people" });
    workspace.table.columns = [
      { id: "linkedin", name: "LinkedIn", dataType: "url" },
      { id: "first", name: "First Name", dataType: "text" },
    ];
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ kind: "person", inputColumnId: "linkedin", firstNameColumnId: "first", outputFields: ["email", "phone"] }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ workspaceId: workspace.id }) });
    expect(response.status).toBe(201);
    const created = getWorkspace(workspace.id)!;
    expect(created.enrichments).toHaveLength(1);
    expect(created.enrichments![0].outputs.map((output) => output.id)).toEqual(["email", "phone"]);
    expect(new Set(created.enrichments![0].outputs.map((output) => output.columnId)).size).toBe(2);
    expect(new Set(created.table.columns.filter((column) => column.enrichmentBinding).map((column) => column.functionBinding?.functionId)).size).toBe(1);
  });

  it("materializes a previously retrieved output without a provider rerun", async () => {
    const workspace = createWorkspace({ name: "Stored result", kind: "people" });
    workspace.table.columns = [{ id: "linkedin", name: "LinkedIn", dataType: "url" }];
    workspace.table.rows = [{ id: "row_1", cells: { linkedin: "https://www.linkedin.com/in/alice" } }];
    const createdResponse = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ kind: "person", inputColumnId: "linkedin", outputFields: ["email"] }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ workspaceId: workspace.id }) });
    const created = await createdResponse.json() as { data: { enrichment: { id: string } } };
    const current = getWorkspace(workspace.id)!;
    const enrichment = current.enrichments![0];
    // The original provider request included phone, but only email was visible.
    enrichment.configuration.enrichments = ["email", "phone"];
    enrichment.rowExecutions = {
      row_1: {
        runId: "run_old", rowId: "row_1", status: "complete",
        requestedOutputIds: ["email", "phone"],
        fieldStatuses: { email: "success", phone: "success" },
        normalizedOutputs: { email: "alice@example.com", phone: "+1 415 555 0100" },
      },
    };
    const response = await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ outputs: ["email", "phone"] }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ workspaceId: workspace.id, enrichmentId: created.data.enrichment.id }) });
    expect(response.status).toBe(200);
    const phone = getWorkspace(workspace.id)!.table.columns.find((column) => column.enrichmentBinding?.outputId === "phone")!;
    expect(getWorkspace(workspace.id)!.table.rows[0].cells[phone.id]).toBe("+1 415 555 0100");
  });
});
