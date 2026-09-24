"use client";

import { CheckIcon, Lock } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

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
import { subscriptionQueryKey } from "@/lib/query-keys";
import { useAuth } from "@clerk/nextjs";
import {
  MODEL_IDS,
  getModelPresentation,
  isModelAccessible,
  registryVendors,
  type ModelId,
} from "@/lib/ai/model-registry";

/**
 * The header model picker.
 *
 * It used to carry its own array of model ids, display names, vendor labels
 * and logo slugs, maintained by hand beside `MODEL_REGISTRY`. Two catalogues,
 * and the copy here had already drifted: it hardcoded `isProOnly` booleans
 * that restate `MODEL_REGISTRY[id].tier`, so a model moved between tiers would
 * change what the server enforced and not what the picker showed — a user
 * offered a model they cannot use, or denied one they can.
 *
 * Everything below now reads the registry. `isModelAccessible` is the same
 * function the chat route calls, so a row that looks unlocked *is* unlocked.
 */

type ModelRow = {
  id: ModelId;
  name: string;
  vendor: string;
  logoSlugs: readonly string[];
};

/** Registry order, which is deliberate: cheapest-first within each vendor. */
const MODEL_ROWS: readonly ModelRow[] = MODEL_IDS.map((modelId) => {
  const presentation = getModelPresentation(modelId);
  return {
    id: modelId,
    name: presentation.name,
    vendor: presentation.vendor,
    logoSlugs: presentation.logoSlugs,
  };
});

const ModelItem = memo(
  ({
    model,
    selectedModel,
    onSelect,
    isLocked,
  }: {
    model: ModelRow;
    selectedModel: ModelId;
    onSelect: (id: ModelId) => void;
    isLocked: boolean;
  }) => {
    const handleSelect = useCallback(() => {
      if (isLocked) return;
      onSelect(model.id);
    }, [onSelect, model.id, isLocked]);

    return (
      <ModelSelectorItem
        onSelect={handleSelect}
        value={model.id}
        disabled={isLocked}
        className={cn(
          "flex items-center gap-2",
          isLocked && "cursor-not-allowed text-muted-foreground opacity-50",
        )}
      >
        <ModelSelectorLogo provider={model.logoSlugs[0] ?? ""} />
        <ModelSelectorName>{model.name}</ModelSelectorName>
        <ModelSelectorLogoGroup className={cn(isLocked && "opacity-50")}>
          {model.logoSlugs.map((slug) => (
            <ModelSelectorLogo key={slug} provider={slug} />
          ))}
        </ModelSelectorLogoGroup>

        <div className="ml-auto flex w-5 items-center justify-end">
          {isLocked ? (
            // Labelled, not decorative: the lock is the only thing
            // distinguishing this row, and a dimmed icon alone says nothing to
            // a screen reader.
            <Lock className="size-4 text-muted-foreground" aria-label="Requires Pro" />
          ) : selectedModel === model.id ? (
            <CheckIcon className="size-4" aria-label="Selected" />
          ) : null}
        </div>
      </ModelSelectorItem>
    );
  },
);

ModelItem.displayName = "ModelItem";

export const ModelSelectorComponent = () => {
  const [open, setOpen] = useState(false);

  const { selectedModel, setSelectedModel } = useChatStore();

  const { isLoaded, isSignedIn, userId } = useAuth();

  const { data: userHaveProPlan = false } = useQuery({
    queryKey: subscriptionQueryKey(userId),
    enabled: isLoaded && isSignedIn,
    queryFn: () => isCustomerHaveSubscription(),
  });

  const handleModelSelect = useCallback(
    (id: ModelId) => {
      setSelectedModel(id);
      setOpen(false);
    },
    [setSelectedModel],
  );

  const selectedModelData = MODEL_ROWS.find((model) => model.id === selectedModel);
  const vendors = useMemo(() => registryVendors(), []);

  return (
    <div className="flex size-full items-center justify-center">
      <ModelSelector onOpenChange={setOpen} open={open}>
        <ModelSelectorTrigger asChild>
          <Button
            className="w-50 justify-between rounded-xl border-hairline bg-glass text-fg-strong shadow-sm transition-colors hover:bg-glass-strong hover:text-fg-bright"
            variant="outline"
            aria-label={`Model: ${selectedModelData?.name ?? selectedModel}. Change model.`}
          >
            <div className="flex items-center gap-2">
              {selectedModelData ? (
                <>
                  <ModelSelectorLogo provider={selectedModelData.logoSlugs[0] ?? ""} />
                  <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
                </>
              ) : null}
            </div>
          </Button>
        </ModelSelectorTrigger>
        <ModelSelectorContent className="max-h-[min(70vh,520px)] overflow-hidden rounded-2xl border border-hairline bg-surface-overlay/95 text-fg-strong shadow-elevation-xl backdrop-blur-xl">
          <ModelSelectorInput placeholder="Search models..." />
          <ModelSelectorList>
            <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
            {vendors.map((vendor) => (
              <ModelSelectorGroup heading={vendor} key={vendor}>
                {MODEL_ROWS.filter((model) => model.vendor === vendor).map((model) => (
                  <ModelItem
                    key={model.id}
                    model={model}
                    onSelect={handleModelSelect}
                    selectedModel={selectedModel}
                    // Pending subscription data reads as `false`, so a Pro
                    // model is locked until proven otherwise. The other
                    // default would flash an unlocked row and then take it
                    // away.
                    isLocked={!isModelAccessible(model.id, userHaveProPlan)}
                  />
                ))}
              </ModelSelectorGroup>
            ))}
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelector>
    </div>
  );
};
