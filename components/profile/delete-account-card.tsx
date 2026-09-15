"use client";

import { useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
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
import { cn } from "@/lib/utils";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";

export function DeleteAccountCard() {
  const { signOut } = useClerk();
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
      await signOut({ redirectUrl: "/sign-in" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account deletion failed. Please retry.");
      setPending(false);
    }
  };

  return (
    <Card className={cn("rounded-2xl border-red-500/25", brandGlassCardClass)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-red-300">
          <AlertTriangle className="h-5 w-5" /> Danger zone
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Permanently delete your account, conversations, memories, usage, and subscription access.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
          This cannot be undone. Export conversations you want to keep from each conversation&apos;s
          sidebar menu before continuing.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="shrink-0 rounded-xl">
              <Trash2 /> Delete account
            </Button>
          </DialogTrigger>
          <DialogContent className="border-red-500/25 bg-zinc-950 text-zinc-100">
            <DialogHeader>
              <DialogTitle>Delete your account permanently?</DialogTitle>
              <DialogDescription className="leading-6 text-zinc-400">
                Export first if you need a copy. Active replies must finish before deletion can
                complete. Type{" "}
                <strong className="text-zinc-200">{ACCOUNT_DELETION_CONFIRMATION}</strong> exactly
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
              className="border-red-500/25 bg-black/20"
            />
            {state === "error" ? (
              <p role="alert" className="text-sm text-red-300">
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
