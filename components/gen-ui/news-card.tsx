import { ExternalLink, Newspaper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface NewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  publishTime: string;
  thumbnail: string | null;
}

export interface NewsCardProps {
  query: string;
  news: NewsItem[];
  summary?: string;
  error?: string;
}

const buildSummaryLead = (query: string, total: number): string => {
  const now = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `As of ${now}, ${query} is seeing active coverage across ${total} recent headline${total > 1 ? "s" : ""}.`;
};

const buildKeyTakeaway = (item: NewsItem): string => {
  const text = item.title.toLowerCase();
  if (/(surge|jump|rally|record|gain|up)/.test(text)) {
    return "Momentum appears positive from this headline.";
  }
  if (/(drop|fall|slump|decline|down|selloff)/.test(text)) {
    return "This signals downside pressure in sentiment.";
  }
  if (/(investigation|lawsuit|regulator|ban|sanction|probe)/.test(text)) {
    return "Regulatory or legal risk is in focus.";
  }
  if (/(earnings|revenue|guidance|profit|forecast)/.test(text)) {
    return "Fundamentals and company outlook are driving attention.";
  }
  if (/(war|attack|ceasefire|conflict|tension)/.test(text)) {
    return "Geopolitical developments are influencing the narrative.";
  }
  return "This is one of the main drivers in today's coverage.";
};

export function NewsCard({ query, news, summary, error }: NewsCardProps) {
  if (error) {
    return (
      <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
        {error}
      </div>
    );
  }

  if (!news?.length) {
    return (
      <div className="p-4 rounded-xl bg-muted text-muted-foreground text-sm border">
        No recent news found for &quot;{query}&quot;.
      </div>
    );
  }

  const topCards = news.slice(0, 5);
  const topSummaryItems = news.slice(0, 4);

  return (
    <Card className="my-4 w-full border-border/60 bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4 text-primary" />
          Latest news for &quot;{query}&quot;
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {topCards.map((item) => (
            <a
              key={item.uuid}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="group min-w-64 max-w-64 shrink-0 overflow-hidden rounded-xl border bg-card transition-colors hover:bg-muted/30"
            >
              <div className="h-32 w-full overflow-hidden border-b bg-muted/40">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
              <div className="space-y-2 p-3">
                <h4 className="line-clamp-3 text-sm font-medium leading-snug">{item.title}</h4>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{item.publisher}</span>
                  <ExternalLink className="size-3.5 shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">{item.publishTime || "Latest update"}</p>
              </div>
            </a>
          ))}
        </div>

        <p className="border-t pt-4 text-sm text-foreground/90">
          Here&apos;s the latest, real situation right now (as of today) - no fluff, just what matters:
        </p>

        <div className="rounded-lg border bg-background/60 p-3.5 text-sm text-foreground">
          {summary?.trim() || buildSummaryLead(query, news.length)}
        </div>

        <div className="rounded-xl border bg-muted/20 p-4">
          <h4 className="text-2xl font-bold tracking-tight text-foreground">🔥 What&apos;s happening RIGHT NOW</h4>
          <p className="mt-2 text-sm text-muted-foreground">
            {summary?.trim() ? "Detailed breakdown from the latest headlines:" : buildSummaryLead(query, news.length)}
          </p>

          <ol className="mt-4 space-y-4">
            {topSummaryItems.map((item, index) => (
              <li key={`summary-${item.uuid}`} className="text-sm">
                <h5 className="font-semibold text-foreground">
                  {index + 1}. {item.title}
                </h5>
                <p className="mt-1 text-muted-foreground">{buildKeyTakeaway(item)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Source: {item.publisher}
                  {item.publishTime ? ` · ${item.publishTime}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
