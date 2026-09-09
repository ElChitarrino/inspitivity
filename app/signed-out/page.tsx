import { chatGPTSignInPath } from "../chatgpt-auth";

export default function SignedOut() {
  return (
    <main className="account-gate">
      <img src="/icon-192.png" alt="" />
      <p className="eyebrow">INSPITIVITY ACCOUNT</p>
      <h1>You are signed out</h1>
      <p>Sign in with the same ChatGPT account on every device to access one shared project library.</p>
      <a className="primary-button" href={chatGPTSignInPath("/")} target="_top">Sign in with ChatGPT</a>
    </main>
  );
}
