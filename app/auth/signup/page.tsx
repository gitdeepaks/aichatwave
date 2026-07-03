/** biome-ignore-all lint/correctness/noChildrenProp: TanStack Form Field uses children render props */
"use client";

import { useForm } from "@tanstack/react-form";
import { ArrowRight, Loader2, LockKeyhole, Mail, Sparkles, UserRound, Zap } from "lucide-react";
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

const signupSchema = z.object({
	username: z.string().min(3, "Username must be at least 3 characters"),
	email: z.email("Invalid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

type SocialProvider = "google" | "github";

const inputBase =
	"h-12 rounded-2xl border border-white/10 bg-white/[0.055] pl-11 pr-4 text-[15px] text-zinc-100 shadow-inner shadow-black/20 transition-[border-color,box-shadow,background-color] placeholder:text-zinc-500 focus-visible:border-orange-300/55 focus-visible:bg-zinc-900/80 focus-visible:ring-2 focus-visible:ring-orange-500/20 focus-visible:ring-offset-0 focus-visible:outline-none";

export default function SignupForm() {
	const router = useRouter();
	const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(
		null,
	);

	const [isLoading, setIsLoading] = useState<boolean>(false);

	const form = useForm({
		defaultValues: {
			username: "",
			email: "",
			password: "",
		},
		validators: {
			onChange: signupSchema,
		},
		onSubmit: async ({ value }) => {
			await authClient.signUp.email(
				{
					name: value.username,
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
						toast.success("Account created successfully!");
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
		<div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,#31200f_0%,#09090b_42%,#050505_100%)] px-4 py-8 sm:py-12">
			<div
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_48%_-16%,rgba(249,115,22,0.34),transparent_58%)]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_48%_40%_at_102%_28%,rgba(220,38,38,0.18),transparent_56%)]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_52%_36%_at_-8%_88%,rgba(251,191,36,0.13),transparent_52%)]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:64px_64px]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.035)_34%,transparent_56%)]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_56%,rgba(0,0,0,0.58)_100%)]"
				aria-hidden
			/>

			<Card className="relative z-10 w-full max-w-[450px] overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/45 text-zinc-50 shadow-[0_28px_120px_-52px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl supports-[backdrop-filter]:bg-zinc-950/38">
				<div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/45 to-transparent" aria-hidden />
				<CardHeader className="space-y-6 px-6 pt-8 pb-2 text-center sm:px-10 sm:pt-10">
					<div className="mx-auto flex size-16 items-center justify-center rounded-[1.35rem] border border-white/10 bg-gradient-to-br from-orange-300/20 via-white/[0.06] to-red-500/10 shadow-[0_18px_50px_-30px_rgba(251,146,60,0.75)]">
						<Image
							src={BRAND_LOGO_SRC}
							className="size-10 object-contain"
							width={512}
							height={285}
							alt="AIChatWave"
							priority
							unoptimized
						/>
					</div>
					<div className="space-y-3">
						<div className="inline-flex items-center gap-2 rounded-full border border-orange-200/20 bg-orange-300/[0.08] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-100/85 shadow-[0_12px_36px_-22px_rgba(251,146,60,0.9)]">
							<Sparkles className="size-3 text-orange-300" aria-hidden />
							Get started
						</div>
						<CardTitle className="text-balance text-3xl font-semibold tracking-[-0.045em] text-white sm:text-[2.35rem]">
							Start with a sharper AI workspace.
						</CardTitle>
						<CardDescription className="mx-auto max-w-[22rem] text-[15px] leading-7 text-zinc-400">
							Create your command center for code, research, planning, and product decisions.
						</CardDescription>
					</div>
				</CardHeader>

				<CardContent className="flex flex-col gap-4 px-6 pb-2 sm:px-10">
					<div className="grid gap-3 sm:grid-cols-2">
						<Button
							variant="outline"
							disabled={socialBusy}
							className="h-12 rounded-2xl border-white/10 bg-white/[0.045] text-[14px] font-medium text-zinc-100 shadow-[0_14px_34px_-26px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-orange-200/25 hover:bg-white/[0.08] hover:text-white disabled:translate-y-0 disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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
							className="h-12 rounded-2xl border-white/10 bg-white/[0.045] text-[14px] font-medium text-zinc-100 shadow-[0_14px_34px_-26px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-orange-200/25 hover:bg-white/[0.08] hover:text-white disabled:translate-y-0 disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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
						<span className="shrink-0 px-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
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
						<FieldGroup className="flex flex-col gap-2.5">
							<form.Field
								name="username"
								children={(field) => {
									const hasError =
										field.state.meta.isTouched &&
										field.state.meta.errors.length > 0;
									return (
										<div className="flex flex-col gap-1.5">
											<label htmlFor={field.name} className="px-1 text-xs font-medium text-zinc-400">
												Username
											</label>
											<div className="relative">
												<UserRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												autoComplete="username"
												placeholder="Your name"
												className={cn(
													inputBase,
													hasError &&
														"border-red-400/50 focus-visible:border-red-400/60 focus-visible:ring-red-500/20",
												)}
											/>
											</div>
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
								name="email"
								children={(field) => {
									const hasError =
										field.state.meta.isTouched &&
										field.state.meta.errors.length > 0;
									return (
										<div className="flex flex-col gap-1.5">
											<label htmlFor={field.name} className="px-1 text-xs font-medium text-zinc-400">
												Email address
											</label>
											<div className="relative">
												<Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
											<Input
												id={field.name}
												name={field.name}
												type="email"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												autoComplete="email"
												placeholder="you@company.com"
												className={cn(
													inputBase,
													hasError &&
														"border-red-400/50 focus-visible:border-red-400/60 focus-visible:ring-red-500/20",
												)}
											/>
											</div>
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
										<div className="flex flex-col gap-1.5">
											<label htmlFor={field.name} className="px-1 text-xs font-medium text-zinc-400">
												Password
											</label>
											<div className="relative">
												<LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
											<Input
												id={field.name}
												name={field.name}
												type="password"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												autoComplete="new-password"
												placeholder="At least 8 characters"
												className={cn(
													inputBase,
													hasError &&
														"border-red-400/50 focus-visible:border-red-400/60 focus-visible:ring-red-500/20",
												)}
											/>
											</div>
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
										className="mt-1 h-12 w-full rounded-2xl bg-gradient-to-r from-orange-300 via-orange-400 to-red-500 text-[15px] font-semibold text-zinc-950 shadow-[0_18px_44px_-24px_rgba(251,146,60,0.95),inset_0_1px_0_rgba(255,255,255,0.5)] transition-[transform,box-shadow] hover:from-orange-200 hover:to-red-400 hover:shadow-[0_22px_56px_-24px_rgba(251,146,60,0.9)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:from-orange-300 disabled:hover:to-red-500"
										disabled={!canSubmit || !isDirty}
									>
										{isSubmitting || isLoading ? (
											<Loader2 className="size-5 animate-spin" />
										) : (
											<span className="inline-flex items-center gap-2">
												Create account
												<ArrowRight className="size-4" aria-hidden />
											</span>
										)}
									</Button>
								)}
							/>
						</FieldGroup>
					</form>
				</CardContent>

				<CardFooter className="flex flex-col items-center gap-4 px-6 pb-8 pt-3 sm:px-10 sm:pb-10">
					<div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-zinc-500">
						<Zap className="size-3.5 text-orange-200/80" aria-hidden />
						Free to start
					</div>
					<p className="text-center text-sm text-zinc-500">
						Already have an account?{" "}
						<Link
							href="/auth/signin"
							className="font-medium text-orange-300 underline-offset-4 transition-colors hover:text-orange-200 hover:underline"
						>
							Sign in
						</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
