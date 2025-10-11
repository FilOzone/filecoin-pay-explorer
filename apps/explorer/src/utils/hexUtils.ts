/**
 * Ensures a hex string has even length for GraphQL queries
 * Subgraph requires even-length hex strings
 */
export const ensureEvenHex = (hex: string): string => {
  const cleanHex = hex.toLowerCase().startsWith("0x") ? hex.slice(2) : hex;
  if (cleanHex.length === 0) return "0x";

  const evenHex = cleanHex.length % 2 === 0 ? cleanHex : `0${cleanHex}`;
  return `0x${evenHex}`;
};

/**
 * Validates if a string is a valid hex string
 */
export const isValidHex = (value: string): boolean => {
  if (!value) return false;
  const cleanHex = value.toLowerCase().startsWith("0x") ? value.slice(2) : value;
  return /^[0-9a-f]*$/i.test(cleanHex);
};

/**
 * Formats hex input for GraphQL search
 * Returns null if invalid or empty
 */
export const formatHexForSearch = (value: string): string | null => {
  if (!value || value.trim() === "") return null;

  const trimmed = value.trim();
  if (!isValidHex(trimmed)) return null;

  return ensureEvenHex(trimmed);
};
