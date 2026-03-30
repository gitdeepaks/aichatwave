import { CloudMoon, CloudSun, Droplets, Thermometer, Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HourlyPoint = {
  time: string;
  temperature: number;
  weatherCode: number;
};

type DailyPoint = {
  day: string;
  min: number;
  max: number;
  weatherCode: number;
};

export interface WeatherCardProps {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  isDay: boolean;
  weatherCode: number;
  todayHigh?: number;
  todayLow?: number;
  sunrise?: string;
  sunset?: string;
  hourly?: HourlyPoint[];
  daily?: DailyPoint[];
  error?: string;
}

const weatherCodeToLabel = (code: number): string => {
  if (code === 0) return "Clear sky";
  if (code >= 1 && code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 71 && code <= 75) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 95) return "Thunderstorm";
  return "Unknown conditions";
};

const formatTemp = (temp: number): string => `${Math.round(temp)}°C`;
const mphToKmh = (mph: number): number => mph * 1.60934;

const humidityLabel = (value: number): string => {
  if (value < 30) return "low";
  if (value < 60) return "moderate";
  return "high";
};

export function WeatherCard({
  location,
  temperature,
  feelsLike,
  humidity,
  windSpeed,
  isDay,
  weatherCode,
  todayHigh,
  todayLow,
  sunrise,
  sunset,
  hourly,
  daily,
  error,
}: WeatherCardProps) {
  if (error) {
    return (
      <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
        {error}
      </div>
    );
  }

  const condition = weatherCodeToLabel(weatherCode);
  const now = new Date();
  const formattedDate = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const roundedWindMph = Math.round(windSpeed);
  const roundedWindKmh = Math.round(mphToKmh(windSpeed));
  const roundedHumidity = Math.round(humidity);
  const cardBg = isDay
    ? "bg-gradient-to-br from-sky-500/20 via-cyan-500/10 to-blue-600/20"
    : "bg-gradient-to-br from-indigo-600/25 via-slate-800/25 to-slate-950/25";
  const AccentIcon = isDay ? CloudSun : CloudMoon;
  const highLowText =
    typeof todayHigh === "number" &&
    typeof todayLow === "number" &&
    (todayHigh !== 0 || todayLow !== 0)
      ? `H:${Math.round(todayHigh)}°  L:${Math.round(todayLow)}°`
      : null;
  const hourlyItems = (hourly ?? []).slice(0, 8);
  const dailyItems = (daily ?? []).slice(0, 5);

  return (
    <div className="my-4 w-full max-w-full">
      <Card className={`overflow-hidden border-border/60 shadow-lg ${cardBg}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg font-semibold leading-tight">
                {location || "Current weather"}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {condition} · {formattedDate}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {highLowText ? (
                <div className="rounded-full border bg-black/40 px-3 py-1 text-sm font-medium text-white/90">
                  {highLowText}
                </div>
              ) : null}
              <div className="rounded-full border bg-black/45 p-2 text-white/90">
                <AccentIcon className="size-5" />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="rounded-2xl border bg-slate-950/55 p-4 text-white">
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-end gap-2">
                <Thermometer className="size-5 text-white/80" />
                <div>
                  <div className="text-5xl font-bold leading-none">{Math.round(temperature)}°C</div>
                  <div className="mt-1 text-sm text-white/75">
                    Feels like{" "}
                    <span className="font-semibold text-white">{Math.round(feelsLike)}°C</span>
                  </div>
                </div>
              </div>
              <div className="text-right text-sm text-white/80">
                <div>Wind</div>
                <div className="font-semibold text-white">{roundedWindMph} mph</div>
              </div>
            </div>

            {hourlyItems.length ? (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <h4 className="font-semibold text-white">Hourly forecast</h4>
                  <span className="text-white/70">Next {hourlyItems.length} hours</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {hourlyItems.map((h, idx) => (
                    <div
                      key={`${h.time}-${idx}`}
                      className="min-w-[92px] shrink-0 rounded-xl border border-white/10 bg-black/45 px-2.5 py-2.5 text-center"
                    >
                      <div className="text-xs text-white/70 whitespace-nowrap">{h.time}</div>
                      <div className="mt-1 text-2xl font-semibold leading-none">
                        {Math.round(h.temperature)}°
                      </div>
                      <div className="mt-1 text-[11px] leading-tight text-white/70">
                        {weatherCodeToLabel(h.weatherCode)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border bg-background/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Droplets className="size-3.5" /> Humidity
              </div>
              <div className="mt-1 text-lg font-semibold">{roundedHumidity}%</div>
              <div className="text-xs text-muted-foreground">{humidityLabel(humidity)}</div>
            </div>

            <div className="rounded-xl border bg-background/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wind className="size-3.5" /> Wind
              </div>
              <div className="mt-1 text-lg font-semibold">{roundedWindKmh} km/h</div>
              <div className="text-xs text-muted-foreground">{roundedWindMph} mph</div>
            </div>

            <div className="rounded-xl border bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">Sunrise / Sunset</div>
              <div className="mt-1 text-sm font-semibold">
                {sunrise || "—"} / {sunset || "—"}
              </div>
            </div>
          </div>

          {dailyItems.length ? (
            <div className="rounded-xl border bg-background/50 p-3">
              <div className="mb-2 text-sm font-semibold">5-day forecast</div>
              <div className="space-y-1.5">
                {dailyItems.map((d, idx) => (
                  <div
                    key={`${d.day}-${idx}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5"
                  >
                    <div className="w-11 text-sm font-medium">{d.day}</div>
                    <div className="flex-1 text-xs text-muted-foreground">
                      {weatherCodeToLabel(d.weatherCode)}
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">{Math.round(d.min)}°</span> /{" "}
                      <span className="font-semibold">{Math.round(d.max)}°</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
