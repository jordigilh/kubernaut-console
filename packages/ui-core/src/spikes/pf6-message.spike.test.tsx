/**
 * Spike: PF6 Message component integration validation
 * 
 * Tests that @patternfly/chatbot Message renders bot and user roles,
 * handles markdown content, timestamps, and loading states.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Message from "@patternfly/chatbot/dist/dynamic/Message";
import MessageBox from "@patternfly/chatbot/dist/dynamic/MessageBox";

import "@patternfly/chatbot/dist/css/main.css";
import "@patternfly/react-core/dist/styles/base.css";

describe("PF6 Message Component Spike", () => {
  const botAvatar = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>";
  const userAvatar = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>";

  it("renders bot message with markdown content", () => {
    render(
      <Message
        role="bot"
        avatar={botAvatar}
        name="Kubernaut"
        content="**Root Cause**: The pod is crashing due to an OOM kill."
        timestamp="2:30 PM"
      />
    );
    expect(screen.getByText("Root Cause")).toBeTruthy();
    expect(screen.getByText(/OOM kill/)).toBeTruthy();
  });

  it("renders user message with plain text", () => {
    render(
      <Message
        role="user"
        avatar={userAvatar}
        name="Operator"
        content="Investigate the crashing pod in namespace production"
        timestamp="2:29 PM"
      />
    );
    expect(screen.getByText(/Investigate the crashing pod/)).toBeTruthy();
  });

  it("shows loading state for streaming messages", () => {
    const { container } = render(
      <Message
        role="bot"
        avatar={botAvatar}
        name="Kubernaut"
        content=""
        isLoading={true}
      />
    );
    // PF6 renders loading dots or skeleton when isLoading=true
    expect(container.querySelector('[class*="loading"]') || container.querySelector('[class*="dots"]')).toBeTruthy();
  });

  it("renders inside MessageBox scrollable container", () => {
    const { container } = render(
      <MessageBox ariaLabel="Conversation">
        <Message role="user" avatar={userAvatar} content="Hello" name="User" />
        <Message role="bot" avatar={botAvatar} content="Hi there!" name="Bot" />
      </MessageBox>
    );
    const messageBox = container.querySelector('[class*="messagebox"]') || container.querySelector('[class*="chatbot"]');
    expect(messageBox).toBeTruthy();
  });

  it("renders message with complex markdown (lists, code blocks)", () => {
    const complexContent = `## Analysis
- Pod \`api-gateway-xyz\` has been restarting
- Last exit code: **137** (OOM killed)

\`\`\`
kubectl get pod api-gateway-xyz -o yaml | grep -A 5 lastState
\`\`\``;

    render(
      <Message
        role="bot"
        avatar={botAvatar}
        name="Kubernaut"
        content={complexContent}
      />
    );
    expect(screen.getByText("Analysis")).toBeTruthy();
    expect(screen.getByText(/137/)).toBeTruthy();
  });

  it("renders message with timestamp prop", () => {
    render(
      <Message
        role="bot"
        avatar={botAvatar}
        name="Kubernaut"
        content="Investigation complete."
        timestamp="3:45 PM"
      />
    );
    expect(screen.getByText("3:45 PM")).toBeTruthy();
  });
});
