/**
 * Spike: PF6 MessageBar integration validation
 * 
 * Tests that @patternfly/chatbot MessageBar renders correctly with React 19,
 * handles send/stop/disabled states, and accepts custom className for token overrides.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MessageBar from "@patternfly/chatbot/dist/dynamic/MessageBar";
import ChatbotFooter from "@patternfly/chatbot/dist/dynamic/ChatbotFooter";

// PF6 requires its CSS — validate import doesn't throw
import "@patternfly/chatbot/dist/css/main.css";
import "@patternfly/react-core/dist/styles/base.css";

describe("PF6 MessageBar Spike", () => {
  it("renders without crashing", () => {
    const handleSend = vi.fn();
    const { container } = render(
      <ChatbotFooter>
        <MessageBar onSendMessage={handleSend} hasAttachButton={false} />
      </ChatbotFooter>
    );
    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("calls onSendMessage when user types and submits", () => {
    const handleSend = vi.fn();
    render(
      <ChatbotFooter>
        <MessageBar onSendMessage={handleSend} hasAttachButton={false} />
      </ChatbotFooter>
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "test message" } });
    // MessageBar uses Enter to send
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(handleSend).toHaveBeenCalledWith("test message");
  });

  it("shows stop button when hasStopButton is true", () => {
    const handleSend = vi.fn();
    const handleStop = vi.fn();
    render(
      <ChatbotFooter>
        <MessageBar
          onSendMessage={handleSend}
          hasAttachButton={false}
          hasStopButton={true}
          handleStopButton={handleStop}
        />
      </ChatbotFooter>
    );
    const stopButton = screen.getByRole("button", { name: /stop/i });
    expect(stopButton).toBeTruthy();
    fireEvent.click(stopButton);
    expect(handleStop).toHaveBeenCalled();
  });

  it("disables send button when isSendButtonDisabled is true", () => {
    const handleSend = vi.fn();
    render(
      <ChatbotFooter>
        <MessageBar
          onSendMessage={handleSend}
          hasAttachButton={false}
          isSendButtonDisabled={true}
          alwayShowSendButton={true}
        />
      </ChatbotFooter>
    );
    const sendButton = screen.getByRole("button", { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it("accepts custom className for token overrides", () => {
    const handleSend = vi.fn();
    const { container } = render(
      <ChatbotFooter>
        <MessageBar
          onSendMessage={handleSend}
          hasAttachButton={false}
          className="kubernaut-message-bar"
        />
      </ChatbotFooter>
    );
    const messageBar = container.querySelector(".kubernaut-message-bar");
    expect(messageBar).toBeTruthy();
  });

  it("uses custom placeholder text", () => {
    const handleSend = vi.fn();
    render(
      <ChatbotFooter>
        <MessageBar
          onSendMessage={handleSend}
          hasAttachButton={false}
          placeholder="Ask a follow-up or start a new investigation..."
        />
      </ChatbotFooter>
    );
    const textarea = screen.getByPlaceholderText("Ask a follow-up or start a new investigation...");
    expect(textarea).toBeTruthy();
  });
});
