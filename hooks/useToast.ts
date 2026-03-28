"use client";

export type ToastVariant = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface PushToastInput {
  title: string;
  description?: string;
  variant: ToastVariant;
}

const TOAST_EVENT = "qw_toast_push";

export function useToast() {
  return {
    pushToast: (toast: PushToastInput) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: toast }));
    },
    dismissToast: (_id: string) => {
      // managed by provider auto-dismiss and close button
    },
  };
}

export function getToastEventName() {
  return TOAST_EVENT;
}
