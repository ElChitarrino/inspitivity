import InspitivityApp from "./InspitivityApp";
import { chatGPTSignOutPath, requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <InspitivityApp account={{ userId: user.userId, displayName: user.displayName, email: user.email }} signOutPath={chatGPTSignOutPath("/signed-out")} />;
}
