// Public API entry point
export { KubernautChat } from "./components/KubernautChat";
export type { KubernautChatProps } from "./components/KubernautChat";

// Providers
export { AuthContext, useAuth } from "./providers/auth";
export type { KubernautAuthProvider, KubernautUser, AuthContextValue } from "./providers/auth";
export { ConfigContext, useConfig } from "./providers/config";
export type { KubernautConfig, FetchFn } from "./providers/config";

// Components (for advanced composition)
export { ChatContainer } from "./components/ChatContainer";
export { ErrorBoundary } from "./components/ErrorBoundary";
export { AgentBubble } from "./components/AgentBubble";
export { UserBubble } from "./components/UserBubble";
export { WorkflowCards } from "./components/WorkflowCards";
export { ApprovalCard } from "./components/ApprovalCard";
export { RCACard } from "./components/RCACard";
export { VerificationTimer } from "./components/VerificationTimer";
export { InvestigationContext } from "./components/InvestigationContext";
export { ThinkingPanel } from "./components/ThinkingPanel";
export { WelcomeState } from "./components/WelcomeState";

// Hooks
export { useChat } from "./hooks/useChat";
export { useUser } from "./hooks/useUser";

// Types
export type {
  ChatMessage,
  RCAData,
  WorkflowOption,
  ApprovalRequest,
  ApprovalResolution,
  AlignmentFinding,
  AlignmentVerdict,
  VerificationStep,
  VerificationStepName,
  VerificationStepStatus,
  TargetDivergence,
  ThinkingEntry,
  ConnectionStatus,
} from "./hooks/useChat";
export type { McpClientOptions } from "./lib/mcp-client";
