import { getCollectionStats as getStatsRepository } from "./collection-repository.js";

export function getCollectionStats() {
  return getStatsRepository();
}
