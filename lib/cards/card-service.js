import * as cardRepository from "./card-repository.js";

/**
 * Executes a card search.
 * @param {object} filters 
 * @returns {Promise<any>}
 */
export async function searchCards(filters) {
  return await cardRepository.searchCards(filters);
}

/**
 * Retrieves full details for a card.
 * @param {object} identifier 
 * @returns {Promise<any>}
 */
export async function getCardDetails(identifier) {
  const details = await cardRepository.getCardDetails(identifier);
  if (!details) {
    throw new Error("Card not found");
  }
  return details;
}
