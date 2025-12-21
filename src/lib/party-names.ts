import partyNames from '@/data/party-names.json';

/**
 * Generates a random party name by combining an adjective and a noun
 * Format: "Adjective-Noun" (e.g., "Sparkling-Celebration")
 */
export function generatePartyName(): string {
  const adjective = partyNames.adjectives[Math.floor(Math.random() * partyNames.adjectives.length)];
  const noun = partyNames.nouns[Math.floor(Math.random() * partyNames.nouns.length)];
  
  // Capitalize first letter of each word
  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
  
  return `${capitalize(adjective)}-${capitalize(noun)}`;
}

/**
 * Generates a unique party name by checking against existing names
 * If a collision occurs, retries up to maxAttempts times
 */
export async function generateUniquePartyName(
  checkExists: (name: string) => Promise<boolean>,
  maxAttempts: number = 10
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const name = generatePartyName();
    const exists = await checkExists(name);
    
    if (!exists) {
      return name;
    }
  }
  
  // If we couldn't find a unique name after maxAttempts,
  // append a random number to ensure uniqueness
  const name = generatePartyName();
  const randomSuffix = Math.floor(Math.random() * 1000);
  return `${name}-${randomSuffix}`;
}
