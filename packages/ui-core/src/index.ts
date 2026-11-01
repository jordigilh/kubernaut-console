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
export { ApprovalConsole } from "./components/ApprovalConsole";
export { ApprovalDecisionConfirmation } from "./components/ApprovalDecisionConfirmation";
export { ApprovalReadStatePanel } from "./components/ApprovalReadState";
export { ConsoleShell, FixtureApprovalWorkspace, ReadStatePanel } from "./console/foundation";
export type { ConsoleShellProps, ConsoleReadState, ReadProvenance, ReadStatus } from "./console/foundation";
export { navigationFor, screenIds } from "./console/registry";
export type { NavigationId, NavigationItem, ScreenId, Topology } from "./console/registry";
export { RCACard } from "./components/RCACard";
export { VerificationTimer } from "./components/VerificationTimer";
export { InvestigationContext } from "./components/InvestigationContext";
export { ThinkingPanel } from "./components/ThinkingPanel";
export { WelcomeState } from "./components/WelcomeState";

// Hooks
export { useChat } from "./hooks/useChat";
export { useUser } from "./hooks/useUser";
export { clearConsoleSessionState } from "./lib/session-state";
export { ApprovalsPage } from "./pages/ApprovalsPage";
export { ApprovalReviewPage } from "./pages/ApprovalReviewPage";
export {
  FIXTURE_REVIEWER,
  createApprovalFixtureAdapter,
  formatApprovalTimestamp,
  formatTarget,
  formatUnknown,
} from "./lib/approval-review";

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
export type {
  ApprovalActor,
  ApprovalDataState,
  ApprovalDecision,
  ApprovalDecisionInput,
  ApprovalDecisionReceipt,
  ApprovalDecisionResult,
  ApprovalDecisionSnapshot,
  ApprovalDecisionState,
  ApprovalEvidenceItem,
  ApprovalFixtureAdapterOptions,
  ApprovalLifecycleStatus,
  ApprovalListItem,
  ApprovalReadState,
  ApprovalReview,
  ApprovalReviewAdapter,
  ApprovalSource,
  ApprovalTarget,
  ApprovalWorkflowReference,
} from "./lib/approval-review";
