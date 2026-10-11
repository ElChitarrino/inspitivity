export interface LocalAIEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  deviceMemory?: number;
}

// iPadOS can advertise a desktop Mac user agent. Test touch support as well.
// Download size is not a safe estimate of inference memory consumption.
export function localAIProfile(environment: LocalAIEnvironment): "compact" | "desktop" {
  const appleMobile = /iPad|iPhone|iPod/i.test(environment.userAgent)
    || (/Mac/i.test(environment.platform) && environment.maxTouchPoints > 1);
  if (appleMobile || /Android|Mobile/i.test(environment.userAgent))
    return "compact";
  if (environment.deviceMemory !== undefined && environment.deviceMemory < 8)
    return "compact";
  return "desktop";
}
