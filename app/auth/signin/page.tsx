/** biome-ignore-all lint/correctness/noChildrenProp: TanStack Form Field uses children render props */
"use client";

import { useForm } from "@tanstack/react-form";
import { Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { GithubIcon, GoogleIcon } from "../icons";

const formSchema = z.object({
	email: z.email("Invalid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

type SocialProvider = "google" | "github";

const inputBase =
	"h-12 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-zinc-100 shadow-inner shadow-black/20 transition-[border-color,box-shadow] placeholder:text-zinc-500 focus-visible:border-orange-400/50 focus-visible:ring-2 focus-visible:ring-orange-500/25 focus-visible:ring-offset-0 focus-visible:outline-none";

export default function LoginForm() {
	const router = useRouter();
	const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(
		null,
	);

	const [isLoading, setIsLoading] = useState<boolean>(false);

	const form = useForm({
		defaultValues: { email: "", password: "" },
		validators: {
			onChange: formSchema,
		},
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{
					email: value.email,
					password: value.password,
					callbackURL: "/",
				},
				{
					onRequest: () => {
						setIsLoading(true);
					},
					onSuccess: () => {
						setIsLoading(false);
						toast.success("Signed in successfully!");
						router.push("/");
					},
					onError: (ctx) => {
						setIsLoading(false);
						toast.error(ctx.error.message || "Registration failed.");
					},
				},
			);
		},
	});

	const handleSocialLogin = async (provider: SocialProvider) => {
		setPendingProvider(provider);

		try {
			await authClient.signIn.social({
				provider: provider,
			});
		} catch (err) {
			setPendingProvider(null);
			console.error(err);
			toast.error("An unexpected error");
		}
	};

	const socialBusy = pendingProvider !== null;

	return (
		<div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-zinc-950 px-4 py-12">
			<div
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-15%,rgba(249,115,22,0.26),transparent_55%)]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_100%_30%,rgba(239,68,68,0.14),transparent_50%)]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_35%_at_0%_85%,rgba(251,146,60,0.1),transparent_45%)]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:48px_48px]"
				aria-hidden
			/>

			<Card className="relative z-10 w-full max-w-[420px] border border-white/10 bg-zinc-900/75 text-zinc-50 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl supports-[backdrop-filter]:bg-zinc-900/55">
				<CardHeader className="space-y-5 px-8 pt-10 pb-2 text-center sm:px-10">
					<div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/25 to-red-600/12 ring-1 ring-white/10">
						<Image
							src={BRAND_LOGO_SRC}
							className="size-9 object-contain"
							width={512}
							height={285}
							alt="AIChatWave"
							priority
							unoptimized
						/>
					</div>
					<div className="space-y-2">
						<div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
							<Sparkles className="size-3 text-orange-300" aria-hidden />
							Welcome back
						</div>
						<CardTitle className="text-balance text-[1.65rem] font-semibold tracking-tight text-white sm:text-[1.75rem]">
							Sign in to AIChatWave
						</CardTitle>
						<CardDescription className="mx-auto max-w-[19rem] text-[15px] leading-relaxed text-zinc-400">
							Smarter replies, uploads, and more — pick up where you left off.
						</CardDescription>
					</div>
				</CardHeader>

				<CardContent className="flex flex-col gap-4 px-8 pb-2 sm:px-10">
					<div className="grid gap-3 sm:grid-cols-2">
						<Button
							variant="outline"
							disabled={socialBusy}
							className="h-12 rounded-xl border-white/12 bg-white/[0.04] text-[14px] font-medium text-zinc-100 shadow-sm transition-colors hover:bg-white/[0.09] hover:text-white disabled:opacity-60"
							onClick={() => {
								handleSocialLogin("google");
							}}
						>
							{pendingProvider === "google" ? (
								<Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
							) : (
								<GoogleIcon className="mr-2 size-4 shrink-0" />
							)}
							Google
						</Button>
						<Button
							variant="outline"
							disabled={socialBusy}
							className="h-12 rounded-xl border-white/12 bg-white/[0.04] text-[14px] font-medium text-zinc-100 shadow-sm transition-colors hover:bg-white/[0.09] hover:text-white disabled:opacity-60"
							onClick={() => {
								handleSocialLogin("github");
							}}
						>
							{pendingProvider === "github" ? (
								<Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
							) : (
								<GithubIcon className="mr-2 size-4 shrink-0" />
							)}
							GitHub
						</Button>
					</div>

					<div className="relative flex items-center py-1">
						<div className="grow border-t border-white/[0.08]" />
						<span className="shrink-0 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
							or email
						</span>
						<div className="grow border-t border-white/[0.08]" />
					</div>

					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
					>
						<FieldGroup className="flex flex-col gap-3">
							<form.Field
								name="email"
								children={(field) => {
									const hasError =
										field.state.meta.isTouched &&
										field.state.meta.errors.length > 0;
									return (
										<div className="flex flex-col gap-1">
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												type="email"
												autoComplete="email"
												placeholder="Email"
												className={cn(
													inputBase,
													hasError &&
														"border-red-400/50 focus-visible:border-red-400/60 focus-visible:ring-red-500/20",
												)}
											/>
											<div className="min-h-5 px-0.5">
												{hasError && (
													<FieldError
														className="text-xs text-red-400 animate-in fade-in slide-in-from-top-1 duration-200"
														errors={field.state.meta.errors}
													/>
												)}
											</div>
										</div>
									);
								}}
							/>

							<form.Field
								name="password"
								children={(field) => {
									const hasError =
										field.state.meta.isTouched &&
										field.state.meta.errors.length > 0;
									return (
										<div className="flex flex-col gap-1">
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												type="password"
												autoComplete="current-password"
												placeholder="Password"
												className={cn(
													inputBase,
													hasError &&
														"border-red-400/50 focus-visible:border-red-400/60 focus-visible:ring-red-500/20",
												)}
											/>
											<div className="min-h-5 px-0.5">
												{hasError && (
													<FieldError
														className="text-xs text-red-400 animate-in fade-in slide-in-from-top-1 duration-200"
														errors={field.state.meta.errors}
													/>
												)}
											</div>
										</div>
									);
								}}
							/>

							<form.Subscribe
								selector={(state) => [
									state.canSubmit,
									state.isSubmitting,
									state.isDirty,
								]}
								children={([canSubmit, isSubmitting, isDirty]) => (
									<Button
										type="submit"
										className="mt-1 h-12 w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-[15px] font-semibold text-white shadow-lg shadow-orange-950/45 transition-[transform,box-shadow] hover:from-orange-400 hover:to-red-500 hover:shadow-red-950/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:from-orange-500 disabled:hover:to-red-600"
										disabled={!canSubmit || !isDirty}
									>
										{isSubmitting || isLoading ? (
											<Loader2 className="size-5 animate-spin" />
										) : (
											"Continue"
										)}
									</Button>
								)}
							/>
						</FieldGroup>
					</form>
				</CardContent>

				<CardFooter className="flex flex-col items-center px-8 pb-10 pt-2 sm:px-10">
					<p className="text-center text-sm text-zinc-500">
						New here?{" "}
						<Link
							href="/auth/signup"
							className="font-medium text-orange-300 underline-offset-4 transition-colors hover:text-orange-200 hover:underline"
						>
							Create an account
						</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
