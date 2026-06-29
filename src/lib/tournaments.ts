export type SeriesType = "3" | "5";

export const SERIES_MAPS: Record<SeriesType, string[]> = {
  "3": ["Bermuda", "Purgatory", "Kalahari"],
  "5": ["Bermuda", "Purgatory", "Kalahari", "Alpine", "Solara"],
};

export function mapsForSeries(series: SeriesType): string[] {
  return SERIES_MAPS[series];
}
