"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  LoaderCircle,
  PanelRightClose,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceMessage } from "@/lib/workspace/types";
import { useSessionState } from "@/hooks/use-session-state";

export function AgentPanel({
  workspaceId,
  messages,
  activity,
  onMessages,
  onClose,
}: {
  workspaceId: string;
  messages: WorkspaceMessage[];
  activity?: string;
  onMessages: (messages: WorkspaceMessage[]) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useSessionState(
    `ploid:workspace:${workspaceId}:agent-draft`,
    "",
  );
  const [running, setRunning] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activity]);
  const send = async () => {
    const content = prompt.trim();
    if (!content || running) return;
    const optimistic: WorkspaceMessage = {
      id: `local_${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    onMessages([...messages, optimistic]);
    setPrompt("");
    setRunning(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: content }),
      });
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Agent request failed");
      onMessages([
        ...messages,
        optimistic,
        {
          id: `reply_${Date.now()}`,
          role: "assistant",
          content: payload.message ?? "Research complete.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      onMessages([
        ...messages,
        optimistic,
        {
          id: `error_${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error ? error.message : "Agent request failed",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  };
  return (
    <aside className="flex min-w-[340px] flex-[0_0_380px] flex-col border-l bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-3.5" />
          </span>
          Ploid Agent
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary">Workspace aware</Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Collapse Ploid Agent"
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "ml-8" : "mr-5"}
            >
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                {message.role === "user" ? "You" : "Ploid"}
              </p>
              <div
                className={
                  message.role === "user"
                    ? "rounded-lg bg-muted px-3 py-2 text-sm"
                    : "rounded-lg border bg-background px-3 py-2 text-sm leading-6"
                }
              >
                {message.content}
              </div>
            </div>
          ))}
          {(running || activity) && (
            <div className="mr-5 rounded-lg border bg-background p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <LoaderCircle className="size-3 animate-spin text-primary" />
                {activity ?? "Researching your workspace"}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>
      <Separator />
      <div className="p-3">
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Ask Ploid to research or update this table…"
          className="min-h-24 resize-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Bot className="size-3" /> Table context included
          </span>
          <Button
            size="sm"
            onClick={() => void send()}
            disabled={running || !prompt.trim()}
          >
            <Send className="size-3.5" />
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}
