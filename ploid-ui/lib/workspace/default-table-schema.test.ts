import { describe, expect, it } from "vitest";
import { defaultTableColumns } from "./default-table-schema";

describe("defaultTableColumns", () => {
  it("uses only the fixed people fields", () => {
    expect(defaultTableColumns("people").map((column) => column.name)).toEqual([
      "Name",
      "Contact",
      "LinkedIn",
    ]);
  });

  it("uses only the fixed company fields", () => {
    expect(defaultTableColumns("companies").map((column) => column.name)).toEqual([
      "Name",
      "Domain",
      "Industry",
      "Product or Service",
    ]);
  });

  it("uses a compact fixed market schema", () => {
    expect(defaultTableColumns("markets").map((column) => column.name)).toEqual([
      "Market",
      "Segment",
      "Description",
    ]);
  });
});
