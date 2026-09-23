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
          className="flex h-auto items-center gap-1 rounded-xl px-3 py-2 text-lg font-semibold text-fg-strong hover:bg-glass-strong focus-visible:ring-2 focus-visible:ring-brand-strong/30"
        >
          AIChatWave <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-50 rounded-xl border border-hairline bg-surface-overlay/95 p-2 text-fg-strong shadow-elevation-lg backdrop-blur-glass">
        <DropdownMenuItem className="rounded-lg focus:bg-glass-strong">
          AIChatWave Plus
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-lg focus:bg-glass-strong">AIChatWave</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
