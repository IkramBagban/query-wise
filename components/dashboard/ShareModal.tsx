"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}

export function ShareModal({ open, onOpenChange, url }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        <h2 className="font-syne text-2xl text-text-1">Dashboard shared</h2>
        <p className="text-sm text-text-2">Anyone with this URL can view this dashboard.</p>
        <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-text-2">{url}</div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => void copy()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy</Button>
        </div>
      </div>
    </Dialog>
  );
}
