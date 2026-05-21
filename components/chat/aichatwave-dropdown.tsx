"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AiChatWaveDropdown() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="flex h-auto items-center gap-1 rounded-xl px-3 py-2 text-[18px] font-semibold text-zinc-100 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-orange-500/30"
				>
					AIChatWave <ChevronDown className="h-4 w-4 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-50 rounded-xl border border-white/10 bg-zinc-900/95 p-2 text-zinc-100 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65)] backdrop-blur-xl">
				<DropdownMenuItem className="rounded-lg focus:bg-white/[0.08]">
					AIChatWave Plus
				</DropdownMenuItem>
				<DropdownMenuItem className="rounded-lg focus:bg-white/[0.08]">
					AIChatWave
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
