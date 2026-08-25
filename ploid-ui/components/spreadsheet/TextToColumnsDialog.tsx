"use client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useSessionState } from "@/hooks/use-session-state";
export function TextToColumnsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [delimiter, setDelimiter] = useSessionState(
    "ploid:text-to-columns:delimiter",
    "comma",
  );
  const [customDelimiter, setCustomDelimiter] = useSessionState(
    "ploid:text-to-columns:custom-delimiter",
    "",
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Text to columns</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Label>Delimiter</Label>
          <RadioGroup
            value={delimiter}
            onValueChange={setDelimiter}
            className="grid gap-2"
          >
            {["comma", "space", "tab", "custom"].map((item) => (
              <div className="flex items-center gap-2" key={item}>
                <RadioGroupItem value={item} id={item} />
                <Label htmlFor={item} className="capitalize">
                  {item}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {delimiter === "custom" && (
            <Input
              value={customDelimiter}
              onChange={(event) => setCustomDelimiter(event.target.value)}
              placeholder="Custom delimiter"
            />
          )}
          <Separator />
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="mb-2 font-medium">Preview</p>
            <div className="grid grid-cols-3 gap-2 text-muted-foreground">
              <span>John</span>
              <span>Smith</span>
              <span>OpenAI</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>Split</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
