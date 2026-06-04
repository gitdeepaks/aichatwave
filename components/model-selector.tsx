"use client";

import { CheckIcon, Lock } from "lucide-react";
import { memo, useCallback, useState } from "react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat-store";
import { useQuery } from "@tanstack/react-query";
import { isCustomerHaveSubscription } from "@/lib/polar";
import { authClient } from "@/lib/auth-client";
import type { ModelId } from "@/app/api/chat/model-registry";

const models = [
  {
    chef: "OpenAI",
    chefSlug: "openai",
    id: "gpt-5-mini",
    name: "GPT 5 mini",
    providers: ["openai", "azure"],
    isProOnly: false,
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    id: "gpt-5-nano",
    name: "GPT 5 nano",
    providers: ["openai", "azure"],
    isProOnly: false,
  },
  {
    chef: "Google",
    chefSlug: "google",
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    providers: ["google", "google-vertex"],
    isProOnly: true,
  },
  {
    chef: "Anthropic",
    chefSlug: "anthropic",
    id: "claude-sonnet-4-20250514",
    name: "Claude 4 Sonnet",
    providers: ["anthropic", "azure", "google-vertex", "amazon-bedrock"],
    isProOnly: true,
  },
] satisfies Array<{
  chef: string;
  chefSlug: string;
  id: ModelId;
  name: string;
  providers: string[];
  isProOnly: boolean;
}>;

interface ModelItemProps {
  model: (typeof models)[0];
  selectedModel: ModelId;
  onSelect: (id: ModelId) => void;
  isLocked: boolean;
}

const ModelItem = memo(({ model, selectedModel, onSelect, isLocked }: ModelItemProps) => {
  const handleSelect = useCallback(() => {
    // Prevent selection if the model is locked
    if (isLocked) return;
    onSelect(model.id);
  }, [onSelect, model.id, isLocked]);

  return (
    <ModelSelectorItem
      key={model.id}
      onSelect={handleSelect}
      value={model.id}
      disabled={isLocked}
      className={cn(
        "flex items-center gap-2",
        isLocked && "opacity-50 cursor-not-allowed text-muted-foreground",
      )}
    >
      <ModelSelectorLogo provider={model.chefSlug} />
      <ModelSelectorName>{model.name}</ModelSelectorName>
      <ModelSelectorLogoGroup className={cn(isLocked && "opacity-50")}>
        {model.providers.map((provider) => (
          <ModelSelectorLogo key={provider} provider={provider} />
        ))}
      </ModelSelectorLogoGroup>

      {/* Status Indicators */}
      <div className="ml-auto flex items-center justify-end w-5">
        {isLocked ? (
          <Lock className="size-4 text-muted-foreground" />
        ) : selectedModel === model.id ? (
          <CheckIcon className="size-4" />
        ) : null}
      </div>
    </ModelSelectorItem>
  );
});

ModelItem.displayName = "ModelItem";

export const ModelSelectorComponent = () => {
  const [open, setOpen] = useState(false);

  const { selectedModel, setSelectedModel } = useChatStore();

  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id;

  const { data: userHaveProPlan = false } = useQuery({
    queryKey: ["customer_subscription", userId],
    enabled: typeof userId === "string" && userId.length > 0,
    queryFn: async () => {
      if (typeof userId !== "string" || userId.length === 0) {
        return false;
      }
      return isCustomerHaveSubscription(userId);
    },
  });

  // const userHaveProPlan = false;

  const handleModelSelect = useCallback(
    (id: ModelId) => {
      setSelectedModel(id);
      setOpen(false);
    },
    [setSelectedModel],
  );

  const selectedModelData = models.find((model) => model.id === selectedModel);

  // Get unique chefs in order of appearance
  const chefs = [...new Set(models.map((model) => model.chef))];

  return (
    <div className="flex size-full items-center justify-center">
      <ModelSelector onOpenChange={setOpen} open={open}>
        <ModelSelectorTrigger asChild>
          <Button
            className="w-50 justify-between rounded-xl border-white/12 bg-white/[0.06] text-zinc-100 shadow-sm transition-colors hover:bg-white/[0.1] hover:text-white"
            variant="outline"
          >
            <div className="flex items-center gap-2">
              {selectedModelData?.chefSlug && (
                <ModelSelectorLogo provider={selectedModelData.chefSlug} />
              )}
              {selectedModelData?.name && (
                <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
              )}
            </div>
          </Button>
        </ModelSelectorTrigger>
        <ModelSelectorContent className="max-h-[min(70vh,520px)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 text-zinc-100 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          <ModelSelectorInput placeholder="Search models..." />
          <ModelSelectorList>
            <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
            {chefs.map((chef) => (
              <ModelSelectorGroup heading={chef} key={chef}>
                {models
                  .filter((model) => model.chef === chef)
                  .map((model) => {
                    // Determine if the current model should be locked
                    // If the query is pending, data is undefined, so Pro models default to locked
                    const isLocked = model.isProOnly && !userHaveProPlan;

                    return (
                      <ModelItem
                        key={model.id}
                        model={model}
                        onSelect={handleModelSelect}
                        selectedModel={selectedModel}
                        isLocked={isLocked}
                      />
                    );
                  })}
              </ModelSelectorGroup>
            ))}
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelector>
    </div>
  );
};
