export function getToolStatusLabel(toolName: string): string {
  switch (toolName) {
    case "display_products":
    case "display-products":
      return "Searching products...";
    case "display_weather":
    case "display-weather":
      return "Fetching weather...";
    case "display_news":
    case "display-news":
      return "Reading market news...";
    default:
      return "Using tools...";
  }
}
