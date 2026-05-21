import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AiChatWaveDropdown } from "@/components/chat/aichatwave-dropdown";
import { ModelSelectorComponent } from "@/components/model-selector";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";

import { ProUpgradeCta } from "@/components/pro-upgrade-cta";
import { auth } from "@/lib/auth";
import { BrandAtmosphere } from "@/components/brand/brand-atmosphere";

export default async function ChatPageLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/auth/signin");
	}

	return (
		<BrandAtmosphere fillViewport>
			<SidebarProvider className="h-full min-h-0 w-full overflow-hidden bg-transparent">
				<AppSidebar />
				<SidebarInset className="min-h-0 overflow-hidden bg-transparent">
					<div className="flex h-full min-h-0 flex-col overflow-hidden text-zinc-100">
						<header className="relative flex h-15 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-950/40 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/25">
							<div className="flex md:hidden">
								<SidebarTrigger className="text-zinc-300 hover:bg-white/10 hover:text-white" />
							</div>
							<div className="hidden items-center md:flex">
								<AiChatWaveDropdown />
							</div>

							<ProUpgradeCta />

							<div className="flex items-center">
								<ModelSelectorComponent />
							</div>
						</header>

						<main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
					</div>
				</SidebarInset>
			</SidebarProvider>
		</BrandAtmosphere>
	);
}
