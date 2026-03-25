import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ModelSelectorComponent } from "@/components/model-selector";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import dynamic from "next/dynamic";
import { AiChatDropdown } from "@/components/chat/ai-chat-dropdown";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";

import { UpgradeComponent } from "@/components/upgrade-component";
import { auth } from "@/lib/auth";
import { SessionUser } from "@/types";

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
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<div className="flex flex-col h-dvh  bg-[#212121] text-[#ececec]">
					<header className="flex items-center justify-between px-4 py-3 h-15 shrink-0">
						<div className="flex md:hidden">
							<SidebarTrigger />
						</div>
						<div className="items-center hidden md:flex">
							<AiChatDropdown />
						</div>

						<UpgradeComponent />

						<div className="flex items-center">
							<ModelSelectorComponent />
						</div>
					</header>

					<main className="flex-1 min-h-0 relative flex flex-col">
						{children}
					</main>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
