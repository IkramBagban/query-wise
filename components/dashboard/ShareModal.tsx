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
        <p className="text-sm text-[#355442]">Anyone with this URL can view this dashboard.</p>
        <div className="rounded-md border border-[#174128]/15 bg-[#f5fcf2] p-3 text-xs text-text-2">{url}</div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="border border-[#174128]/18 bg-white hover:bg-[#ecf9e5]" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="bg-[#2ed52e] !text-white hover:brightness-105" onClick={() => void copy()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy</Button>
        </div>
      </div>
    </Dialog>
  );
}
