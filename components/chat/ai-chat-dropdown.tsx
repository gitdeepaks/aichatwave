"use client";

import { ChevronDown } from "lucide-react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function AiChatDropdown() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="text-[18px] font-semibold hover:bg-[#2f2f2f] text-[#b4b4b4] px-2 py-1 h-auto flex items-center gap-1 focus-visible:ring-0"
				>
					AI Chat <ChevronDown className="h-4 w-4 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-[#2f2f2f] border-[#424242] text-white rounded-xl p-2 min-w-50">
				<DropdownMenuItem className="rounded-lg focus:bg-[#424242]">
					AI Chat Plus
				</DropdownMenuItem>
				<DropdownMenuItem className="rounded-lg focus:bg-[#424242]">
					AI Chat
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

