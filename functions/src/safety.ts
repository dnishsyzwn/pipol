import { failed, invalid } from './errors.js';

const blockedImagePatterns = [
  /porn/i,
  /pornograph/i,
  /erotic/i,
  /fetish/i,
  /sexualized?\s+(minor|child|teen)/i,
  /minor.*(nude|naked|sex|explicit)/i,
  /explicit\s+(sex|intercourse|nudity)/i,
  /graphic\s+(gore|sexual)/i,
];

export function assertImagePromptAllowed(prompt: string): void {
  if (blockedImagePatterns.some((pattern) => pattern.test(prompt))) {
    failed('This image request cannot be generated. Describe a neutral, factual educational visual instead.');
  }
}

export function assertGenerationInput(prompt: string, subject?: string): void {
  if (!prompt.trim() && !subject?.trim()) invalid('Add a topic, instruction, or source material before generating.');
  if (prompt.length > 4000) invalid('The teacher instruction is too long.');
  if (prompt.includes('\u0000')) invalid('The teacher instruction contains invalid characters.');
}

export function markSensitiveReview(text: string): boolean {
  return /reproductive|sexual health|anatomy|war|violence|death|drugs|self-harm/i.test(text);
}
