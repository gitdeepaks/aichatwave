"use client";

import { useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { accountApi } from "@/lib/api/client";
import { ACCOUNT_DELETION_CONFIRMATION, accountDeletionFormState } from "@/lib/account-deletion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { endLocalSession } from "@/lib/cache/query-persistence";
import { cn } from "@/lib/utils";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";

export function DeleteAccountCard() {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = accountDeletionFormState({ confirmation, pending, error });

  const removeAccount = async () => {
    setPending(true);
    setError(null);
    try {
      await accountApi.remove(confirmation);
      // "Permanently delete your account, conversations, memories…" has to
      // include the copies on this device, or the sidebar of a deleted account
      // is still readable in the next tab until the cache expires.
      await endLocalSession(queryClient);
      await signOut({ redirectUrl: "/sign-in" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account deletion failed. Please retry.");
      setPending(false);
    }
  };

  return (
    <Card className={cn("rounded-2xl border-danger/25", brandGlassCardClass)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-danger-text">
          <AlertTriangle className="h-5 w-5" /> Danger zone
        </CardTitle>
        <CardDescription className="text-fg-muted">
          Permanently delete your account, conversations, memories, usage, and subscription access.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-6 text-fg-muted">
          This cannot be undone. Export conversations you want to keep from each conversation&apos;s
          sidebar menu before continuing.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="shrink-0 rounded-xl">
              <Trash2 /> Delete account
            </Button>
          </DialogTrigger>
          <DialogContent className="border-danger/25 bg-surface-sunken text-fg-strong">
            <DialogHeader>
              <DialogTitle>Delete your account permanently?</DialogTitle>
              <DialogDescription className="leading-6 text-fg-muted">
                Export first if you need a copy. Active replies must finish before deletion can
                complete. Type{" "}
                <strong className="text-fg">{ACCOUNT_DELETION_CONFIRMATION}</strong> exactly
                to confirm.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={confirmation}
              disabled={pending}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setError(null);
              }}
              aria-label="Account deletion confirmation"
              autoComplete="off"
              placeholder={ACCOUNT_DELETION_CONFIRMATION}
              className="border-danger/25 bg-shade/20"
            />
            {state === "error" ? (
              <p role="alert" className="text-sm text-danger-text">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={state !== "ready"}
                onClick={() => void removeAccount()}
              >
                {pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                {pending ? "Deleting account..." : "Permanently delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
