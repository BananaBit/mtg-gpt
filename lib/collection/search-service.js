import { searchCollection as searchRepository } from "./collection-repository.js";

export function searchCollection(filters) {
  return searchRepository(filters);
}
