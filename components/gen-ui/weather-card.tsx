import { CloudMoon, CloudSun, Droplets, Thermometer, Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface WeatherCardProps {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  isDay: boolean;
  weatherCode: number;
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
  const dayNightLabel = isDay ? "Daytime" : "Nighttime";
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
    ? "bg-gradient-to-br from-sky-500/15 via-cyan-500/10 to-blue-600/15"
    : "bg-gradient-to-br from-indigo-600/20 via-slate-700/20 to-slate-900/20";
  const AccentIcon = isDay ? CloudSun : CloudMoon;

  return (
    <div className="my-4 w-full max-w-md space-y-3">
      <Card className={`overflow-hidden border-border/60 shadow-md ${cardBg}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold leading-tight">
                {location || "Current weather"}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {condition} · {dayNightLabel}
              </p>
            </div>
            <div className="rounded-full border bg-background/70 p-2.5 backdrop-blur">
              <AccentIcon className="size-5 text-primary" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-background/70 p-4 backdrop-blur">
            <div className="flex items-end justify-between">
              <div className="flex items-center gap-2">
                <Thermometer className="size-5 text-primary" />
                <span className="text-4xl font-bold tracking-tight">{formatTemp(temperature)}</span>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Feels Like</p>
                <p className="text-base font-semibold">{formatTemp(feelsLike)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border bg-background/70 p-3.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Droplets className="size-4" />
                Humidity
              </div>
              <div className="mt-1.5 text-lg font-semibold">{roundedHumidity}%</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-3.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Wind className="size-4" />
                Wind Speed
              </div>
              <div className="mt-1.5 text-lg font-semibold">{roundedWindMph} mph</div>
            </div>
          </div>

          <div className="rounded-lg border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            WMO Code: <span className="font-medium text-foreground">{weatherCode}</span>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="text-foreground">
          As of {formattedDate}, weather in{" "}
          <span className="font-semibold">{location || "this location"}</span> is{" "}
          <span className="font-semibold">{condition.toLowerCase()}</span> with a current
          temperature near <span className="font-semibold">{formatTemp(temperature)}</span>.
        </p>
        <ul className="mt-3 space-y-1.5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Feels like:</span> {formatTemp(feelsLike)}
            .
          </li>
          <li>
            <span className="font-medium text-foreground">Humidity:</span> {roundedHumidity}% (
            {humidityLabel(humidity)}).
          </li>
          <li>
            <span className="font-medium text-foreground">Wind:</span> {roundedWindMph} mph (
            {roundedWindKmh} km/h).
          </li>
        </ul>
      </div>
    </div>
  );
}
