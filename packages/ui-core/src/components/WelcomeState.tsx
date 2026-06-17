import { ChatbotWelcomePrompt } from "@patternfly/chatbot";
import type { WelcomePrompt } from "@patternfly/chatbot";

interface Props {
  onSuggest: (text: string) => void;
}

const SUGGESTIONS = [
  "What's happening with the payments pods?",
  "Investigate the CrashLoopBackOff alert",
  "Show me recent incidents in the cluster",
];

export function WelcomeState({ onSuggest }: Props) {
  const prompts: WelcomePrompt[] = SUGGESTIONS.map((text) => ({
    title: text,
    onClick: () => onSuggest(text),
  }));

  return (
    <ChatbotWelcomePrompt
      title="Kubernaut Agent"
      description="I can investigate Kubernetes incidents, diagnose root causes, and execute remediation workflows."
      prompts={prompts}
    />
  );
}
