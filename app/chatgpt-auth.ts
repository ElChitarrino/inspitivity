import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const RESERVED_PATHS = new Set([SIGN_IN_PATH, SIGN_OUT_PATH, "/callback"]);

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  if (!userId || !email) {
    const previewHost = requestHeaders.get("host")?.split(":")[0];
    if (process.env.NODE_ENV === "development" || previewHost === "terminal.local") {
      return {
        userId: "local-preview",
        email: "preview@local.invalid",
        fullName: "Preview musician",
        displayName: "Preview musician",
      };
    }
    return null;
  }

  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName = encodedName && requestHeaders.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
    ? safeDecode(encodedName)
    : null;
  return { userId, email, fullName, displayName: fullName ?? email };
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

function safeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || RESERVED_PATHS.has(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function safeDecode(value: string): string | null {
  try { return decodeURIComponent(value); }
  catch { return null; }
}
