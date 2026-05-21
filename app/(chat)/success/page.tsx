"use client";

import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";

function SuccessContent() {
	const searchParams = useSearchParams();
	const checkoutId = searchParams.get("checkout_id");

	return (
		<Card className={cn("w-full max-w-110 text-zinc-50", brandGlassCardClass)}>
			<CardHeader className="space-y-5 pt-10 text-center">
				<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/25">
					<CheckCircle2 className="h-8 w-8 text-emerald-400" />
				</div>
				<div className="space-y-2">
					<CardTitle className="text-[32px] font-semibold tracking-tight text-white">
						Payment Successful
					</CardTitle>
					<CardDescription className="mx-auto max-w-80 text-[15px] leading-relaxed text-zinc-400">
						Thank you for upgrading. Your transaction is complete, and your
						account now has access to premium features.
					</CardDescription>
				</div>
			</CardHeader>

			<CardContent className="flex flex-col gap-6 px-10 pb-2">
				{/* Render the Checkout ID if it exists in the URL */}
				{checkoutId && (
					<div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center shadow-inner shadow-black/20">
						<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
							Order Reference
						</span>
						<span className="mt-1 w-full max-w-62.5 truncate font-mono text-sm text-zinc-100">
							{checkoutId}
						</span>
					</div>
				)}

				<Link href="/" className="block w-full">
					<Button className="h-13 w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-[16px] font-semibold text-white shadow-lg shadow-orange-950/40 transition-[transform,box-shadow] hover:from-orange-400 hover:to-red-500 active:scale-[0.98]">
						Return to Chat
						<ArrowRight className="ml-2 size-5" />
					</Button>
				</Link>
			</CardContent>

			<CardFooter className="flex flex-col items-center pb-8 pt-4">
				<div className="text-sm text-zinc-500">
					A receipt has been sent to your email.
				</div>
			</CardFooter>
		</Card>
	);
}

export default function PaymentSuccessPage() {
	return (
		<div className="flex h-dvh items-center justify-center bg-zinc-950 px-4">
			<Suspense
				fallback={
					<Card
						className={cn(
							"flex h-112.5 w-full max-w-110 items-center justify-center",
							brandGlassCardClass,
						)}
					>
						<div className="flex flex-col items-center gap-4">
							<Loader2 className="size-8 animate-spin text-orange-300" />
							<p className="text-sm text-zinc-400">Verifying payment...</p>
						</div>
					</Card>
				}
			>
				<SuccessContent />
			</Suspense>
		</div>
	);
}
