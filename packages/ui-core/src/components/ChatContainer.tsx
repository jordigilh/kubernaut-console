import { useEffect, useState, useCallback } from "react";
import Chatbot, { ChatbotDisplayMode } from "@patternfly/chatbot/dist/esm/Chatbot";
import ChatbotContent from "@patternfly/chatbot/dist/esm/ChatbotContent";
import ChatbotHeader from "@patternfly/chatbot/dist/esm/ChatbotHeader";
import ChatbotFooter from "@patternfly/chatbot/dist/esm/ChatbotFooter";
import MessageBar from "@patternfly/chatbot/dist/esm/MessageBar";
import MessageBox from "@patternfly/chatbot/dist/esm/MessageBox";
import { Button, Alert, Modal, ModalBody, ModalFooter, ModalHeader, Flex, FlexItem, Content, ContentVariants } from "@patternfly/react-core";
import { useChat } from "../hooks/useChat";
import { useUser } from "../hooks/useUser";
import { callMcpTool } from "../lib/mcp-client";
import { emitAuditEvent } from "../lib/audit";
import { UserBubble } from "./UserBubble";
import { AgentBubble } from "./AgentBubble";
import { InvestigationContext } from "./InvestigationContext";
import { WelcomeState } from "./WelcomeState";

export function ChatContainer() {
  const { messages, isStreaming, error, setError, connectionStatus, sendMessage, cancelStream, clearHistory, investigationStartTime, currentPhase } = useChat();
  const lastRca = messages.findLast(m => m.role === "agent" && m.rca)?.rca;
  const rrId = messages.findLast(m => m.role === "agent" && m.rrId)?.rrId ?? lastRca?.rrId;
  const alertName = messages.findLast(m => m.role === "agent" && m.alertName)?.alertName ?? lastRca?.signalName;
  const namespace = messages.findLast(m => m.role === "agent" && m.namespace)?.namespace ?? lastRca?.namespace;
  const resource = messages.findLast(m => m.role === "agent" && m.resource)?.resource ?? lastRca?.target;
  const recoverySignal = messages.findLast(m => m.role === "agent" && m.recoverySignal)?.recoverySignal ?? null;
  const user = useUser();

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const handleSend = useCallback(
    (message: string | number) => {
      const text = String(message).trim();
      if (!text || isStreaming) return;
      sendMessage(text);
    },
    [isStreaming, sendMessage],
  );

  const handleSuggest = useCallback(
    (text: string) => {
      if (!isStreaming) sendMessage(text);
    },
    [isStreaming, sendMessage],
  );

  const handleExecuteWorkflow = useCallback(
    async (workflowId: string) => {
      if (!rrId) {
        setError("Cannot select workflow: no active remediation request found.");
        return;
      }
      const res = await callMcpTool("kubernaut_select_workflow", {
        rr_id: rrId,
        workflow_id: workflowId,
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      sendMessage(`Workflow ${workflowId} selected for execution.`, { silent: true });
      emitAuditEvent({ action: "execute_workflow", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { workflowId } });
    },
    [rrId, sendMessage, setError, user.name, user.email],
  );

  const handleApprove = useCallback(
    async (rarName: string, reason: string) => {
      const res = await callMcpTool("kubernaut_approve", {
        rar_name: rarName,
        decision: "Approved",
        reason,
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      sendMessage("The remediation has been approved. Continue monitoring.", { silent: true });
      emitAuditEvent({ action: "approve", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { rarName, reason } });
    },
    [sendMessage, setError, rrId, user.name, user.email],
  );

  const handleDecline = useCallback(
    async (rarName: string, reason: string) => {
      const res = await callMcpTool("kubernaut_approve", {
        rar_name: rarName,
        decision: "Rejected",
        reason,
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      sendMessage("The remediation has been rejected.", { silent: true });
      emitAuditEvent({ action: "decline", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { rarName, reason } });
    },
    [sendMessage, setError, rrId, user.name, user.email],
  );

  const handleDismiss = useCallback(
    async () => {
      if (!rrId) {
        setError("Cannot dismiss: no active remediation request found.");
        return;
      }
      const res = await callMcpTool("kubernaut_complete_no_action", {
        rr_id: rrId,
        reason: "Dismissed by operator: no action needed",
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      sendMessage("Investigation dismissed. No remediation action taken.", { silent: true });
      emitAuditEvent({ action: "dismiss", timestamp: new Date().toISOString(), user: user.name || user.email, rrId });
    },
    [rrId, sendMessage, setError, user.name, user.email],
  );

  const handleEscalate = useCallback(async (reason: string) => {
    if (!rrId) {
      setError("Cannot escalate: no active remediation request found.");
      return;
    }
    const res = await callMcpTool("kubernaut_complete_no_action", {
      rr_id: rrId,
      reason: "Escalated by operator",
      escalation_reason: reason,
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    sendMessage("Investigation escalated to team for manual review.", { silent: true });
    emitAuditEvent({ action: "escalate", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { escalation_reason: reason } });
  }, [rrId, sendMessage, setError, user.name, user.email]);

  const handleClearHistory = useCallback(() => {
    if (messages.length === 0) {
      clearHistory();
      setError(null);
    } else {
      setClearConfirmOpen(true);
    }
  }, [messages.length, clearHistory, setError]);

  const confirmClear = useCallback(() => {
    setClearConfirmOpen(false);
    clearHistory();
    setError(null);
    emitAuditEvent({ action: "clear_history", timestamp: new Date().toISOString(), user: user.name || user.email, rrId });
  }, [clearHistory, setError, user.name, user.email, rrId]);

  return (
    <Chatbot displayMode={ChatbotDisplayMode.embedded}>
      <ChatbotHeader>
        <Flex alignItems={{ default: "alignItemsCenter" }} spaceItems={{ default: "spaceItemsSm" }} style={{ width: "100%" }}>
          <FlexItem>
            <img src="/logo.svg" alt="Kubernaut" style={{ height: 28, width: 28, borderRadius: 4 }} />
          </FlexItem>
          <FlexItem grow={{ default: "grow" }}>
            <strong>Kubernaut Console</strong>
          </FlexItem>
          {connectionStatus === "reconnecting" && (
            <FlexItem><Content component={ContentVariants.small}>Reconnecting...</Content></FlexItem>
          )}
          {connectionStatus === "lost" && (
            <FlexItem>
              <Button variant="link" isDanger size="sm" onClick={() => sendMessage("", { silent: true })} aria-label="Connection lost. Click to retry.">
                Connection lost — tap to retry
              </Button>
            </FlexItem>
          )}
          <FlexItem>
            <Button variant="plain" aria-label="New conversation" onClick={handleClearHistory} size="sm">
              New
            </Button>
          </FlexItem>
          <FlexItem>
            <Button variant="plain" component="a" href="/oauth2/sign_out" aria-label="Sign out" size="sm">
              {user.initials}
            </Button>
          </FlexItem>
        </Flex>
      </ChatbotHeader>

      <InvestigationContext
        rrId={rrId}
        alertName={alertName}
        namespace={namespace}
        resource={resource}
        phase={currentPhase}
      />

      <ChatbotContent>
        <MessageBox aria-label="Conversation">
          {messages.length === 0 ? (
            <WelcomeState onSuggest={handleSuggest} />
          ) : (
            messages.map((msg) =>
              msg.role === "user" ? (
                <UserBubble key={msg.id} text={msg.text} timestamp={msg.timestamp} />
              ) : (
                <AgentBubble
                  key={msg.id}
                  message={msg}
                  investigationStartTime={investigationStartTime}
                  onExecuteWorkflow={handleExecuteWorkflow}
                  onApprove={handleApprove}
                  onDecline={handleDecline}
                  onDismiss={handleDismiss}
                  onEscalate={handleEscalate}
                  userName={user.name || user.email}
                  recoverySignal={recoverySignal}
                />
              ),
            )
          )}
        </MessageBox>
      </ChatbotContent>

      {error && (
        <Alert variant="danger" title={error} isInline isPlain />
      )}

      <ChatbotFooter>
        <MessageBar
          onSendMessage={handleSend}
          hasStopButton={isStreaming && currentPhase !== "verifying"}
          handleStopButton={cancelStream}
          isSendButtonDisabled={isStreaming && currentPhase !== "verifying"}
          alwayShowSendButton
        />
      </ChatbotFooter>

      <Modal
        isOpen={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        variant="small"
        aria-label="Confirm clear history"
      >
        <ModalHeader title="Start new conversation?" />
        <ModalBody>
          <Content component={ContentVariants.p}>Current history will be cleared. This cannot be undone.</Content>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmClear}>Clear history</Button>
          <Button variant="link" onClick={() => setClearConfirmOpen(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>
    </Chatbot>
  );
}
