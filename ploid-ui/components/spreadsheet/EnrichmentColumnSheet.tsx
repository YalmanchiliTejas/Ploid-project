"use client";

import { useMemo, useState } from "react";
import {
  AtSign,
  Check,
  CircleDot,
  LoaderCircle,
  Phone,
  Play,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { WorkspaceTable } from "@/lib/workspace/types";

export type EnrichmentAction =
  | "work_email"
  | "phone"
  | "person"
  | "social"
  | "linkedin"
  | "github"
  | "x"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "reddit"
  | "facebook";

const socialActions = new Set<EnrichmentAction>([
  "social",
  "linkedin",
  "github",
  "x",
  "instagram",
  "tiktok",
  "youtube",
  "reddit",
  "facebook",
]);
const titles: Record<EnrichmentAction, string> = {
  work_email: "Find Work Email",
  phone: "Find Phone",
  person: "Enrich Person",
  social: "Enrich Social Profile",
  linkedin: "LinkedIn Profile",
  github: "GitHub Profile",
  x: "X Profile",
  instagram: "Instagram Profile",
  tiktok: "TikTok Profile",
  youtube: "YouTube Profile",
  reddit: "Reddit Profile",
  facebook: "Facebook Profile",
};

export function EnrichmentColumnSheet({
  open,
  onOpenChange,
  action,
  workspaceId,
  table,
  initialInputColumnId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: EnrichmentAction;
  workspaceId: string;
  table: WorkspaceTable;
  initialInputColumnId?: string;
  onSaved: (columnId?: string, autoRun?: boolean) => Promise<void> | void;
}) {
  const isSocial = socialActions.has(action);
  const defaultPlatform: string =
    action === "social" ? "linkedin" : isSocial ? action : "linkedin";
  const [inputColumnId, setInputColumnId] = useState(initialInputColumnId ?? "");
  const [firstNameColumnId, setFirstNameColumnId] = useState("");
  const [lastNameColumnId, setLastNameColumnId] = useState("");
  const [platform, setPlatform] = useState(defaultPlatform);
  const [socialFieldsText, setSocialFieldsText] = useState("");
  const [personFields, setPersonFields] = useState<Array<"profile" | "email" | "phone">>(
    action === "work_email"
      ? ["email"]
      : action === "phone"
        ? ["phone"]
        : action === "person"
          ? ["profile"]
          : [],
  );
  const [name, setName] = useState("");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string>();
  const [testSummary, setTestSummary] = useState<{
    enriched: number;
    notFound: number;
    failed: number;
    providerRequests?: number;
    outputs?: Record<string, { found: number; notFound: number; failed: number }>;
  }>();
  const inputColumns = useMemo(
    () =>
      table.columns.filter(
        (column) =>
          isSocial ||
          column.dataType === "url" ||
          /linkedin/i.test(column.name),
      ),
    [isSocial, table.columns],
  );

  const submit = async (test = false) => {
    if (!inputColumnId) {
      setError(
        isSocial
          ? "Choose an identifier column"
          : "Choose a LinkedIn URL column",
      );
      return;
    }
    if (!isSocial && !personFields.length) {
      setError("Choose at least one enrichment output");
      return;
    }
    setError(undefined);
    if (test) setTesting(true);
    else setSaving(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/enrichment-columns${test ? "/test" : ""}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: isSocial ? "social" : "person",
            inputColumnId,
            firstNameColumnId,
            lastNameColumnId,
            platform,
            socialFields: socialFieldsText.split(",").map((field) => field.trim()).filter(Boolean),
            outputFields: personFields,
            name,
            autoUpdate,
          }),
        },
      );
      const payload = (await response.json()) as {
        data?: {
          enriched: number;
          notFound: number;
          failed: number;
          providerRequests?: number;
          outputs?: Record<string, { found: number; notFound: number; failed: number }>;
          column?: { id: string };
        };
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to configure enrichment");
      if (test && payload.data) setTestSummary(payload.data);
      if (!test) {
        await onSaved(payload.data?.column?.id, autoUpdate);
        onOpenChange(false);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to configure enrichment",
      );
    } finally {
      if (test) setTesting(false);
      else setSaving(false);
    }
  };
  const Icon =
    action === "work_email"
      ? AtSign
      : action === "phone"
        ? Phone
        : isSocial
          ? CircleDot
          : UserRound;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-[460px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Icon className="size-4 text-primary" />
            {titles[action]}
          </SheetTitle>
          <SheetDescription>
            Configure stable table inputs, test a small sample, then run through
            Function Runner.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {isSocial && (
            <div className="grid gap-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "linkedin",
                    "github",
                    "x",
                    "instagram",
                    "tiktok",
                    "youtube",
                    "reddit",
                    "facebook",
                  ].map((value) => (
                    <SelectItem value={value} key={value}>
                      {value === "x"
                        ? "X"
                        : value[0].toUpperCase() + value.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label>{isSocial ? "Identifier" : "LinkedIn URL"}</Label>
            <Select value={inputColumnId} onValueChange={setInputColumnId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isSocial
                      ? "Choose a profile URL or handle column"
                      : "Choose a LinkedIn URL column"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {inputColumns.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Stored as a stable column ID; renaming or moving the column will
              not break it.
            </p>
          </div>
          {!isSocial && (
            <>
            <div className="grid gap-3">
              <Label>Optional identity inputs</Label>
              {[["First name", firstNameColumnId, setFirstNameColumnId], ["Last name", lastNameColumnId, setLastNameColumnId]].map(([label, value, onChange]) => (
                <div className="grid gap-1" key={label as string}>
                  <Label className="text-xs font-normal text-muted-foreground">{label as string}</Label>
                  <Select value={(value as string) || "none"} onValueChange={(next) => (onChange as (value: string) => void)(next === "none" ? "" : next)}>
                    <SelectTrigger><SelectValue placeholder="Not mapped" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Not mapped</SelectItem>{table.columns.map((column) => <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              <Label>Outputs</Label>
              <div className="grid gap-2 rounded-md border p-3">
                {(
                  [
                    ["email", "Work Email"],
                    ["phone", "Phone"],
                    ["profile", "Profile"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={personFields.includes(field)}
                      onCheckedChange={(checked) =>
                        setPersonFields((current) =>
                          checked
                            ? [...new Set([...current, field])]
                            : current.filter((value) => value !== field),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected outputs share one Ploid request per row.
              </p>
            </div>
            </>
          )}
          {isSocial && (
            <div className="grid gap-2">
              <Label>Profile fields</Label>
              <Input
                value={socialFieldsText}
                onChange={(event) => setSocialFieldsText(event.target.value)}
                placeholder="Comma-separated documented fields, e.g. username, bio"
              />
              <p className="text-xs text-muted-foreground">
                Ploid’s OpenAPI intentionally leaves social profile keys
                platform-dependent. Select known fields; raw profile JSON is
                retained only in run metadata and is never a table column.
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Column name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={titles[action]}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="enrichment-auto">Auto-update</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Run only when table auto-run is enabled.
              </p>
            </div>
            <Switch
              id="enrichment-auto"
              checked={autoUpdate}
              onCheckedChange={setAutoUpdate}
            />
          </div>
          {testSummary && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Test result · up to 10 rows</p>
              <p className="mt-1 text-muted-foreground">
                <span className="text-foreground">
                  {testSummary.enriched} enriched
                </span>{" "}
                · {testSummary.notFound} not found · {testSummary.failed} failed
              </p>
              {testSummary.providerRequests !== undefined && <p className="mt-1 text-xs text-muted-foreground">Provider requests: {testSummary.providerRequests}</p>}
              {testSummary.outputs && <div className="mt-2 grid gap-1 text-xs">{Object.entries(testSummary.outputs).map(([field, summary]) => <p key={field}><span className="font-medium">{field}</span> · {summary.found} found · {summary.notFound} not found{summary.failed ? ` · ${summary.failed} failed` : ""}</p>)}</div>}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <SheetFooter className="border-t px-5 py-4">
          <Button
            variant="outline"
            onClick={() => void submit(true)}
            disabled={testing}
          >
            {testing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Test 10 rows
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
