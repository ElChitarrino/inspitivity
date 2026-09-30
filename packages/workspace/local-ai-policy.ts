export interface LocalAIEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  deviceMemory?: number;
}

// iPadOS can advertise a desktop Mac user agent. Test touch support as well.
// Download size is not a safe estimate of inference memory consumption.
export function localAIBlockReason(environment: LocalAIEnvironment): string | null {
  const appleMobile = /iPad|iPhone|iPod/i.test(environment.userAgent)
    || (/Mac/i.test(environment.platform) && environment.maxTouchPoints > 1);
  if (appleMobile || /Android|Mobile/i.test(environment.userAgent))
    return "Local AI is disabled on phones and tablets to avoid memory crashes. Instant chord generation works without a model.";
  if (environment.deviceMemory !== undefined && environment.deviceMemory < 8)
    return "Local AI is disabled on devices reporting less than 8 GB of memory. Instant chord generation works without a model.";
  return null;
}
