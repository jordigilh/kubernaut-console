export interface TextPart {
  kind: "text";
  text: string;
}

export interface DataPart {
  kind: "data";
  data: Record<string, unknown>;
  mediaType?: string;
  metadata?: Record<string, unknown>;
}

export type Part = TextPart | DataPart;

export interface A2AMessage {
  messageId?: string;
  contextId?: string;
  taskId?: string;
  role: "user" | "agent";
  parts: TextPart[];
}

export interface TaskStatus {
  state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled";
  timestamp?: string;
  message?: A2AMessage;
}

export interface ArtifactUpdateEvent {
  kind: "artifact-update";
  taskId: string;
  contextId: string;
  artifact: {
    artifactId: string;
    parts: Part[];
    metadata?: Record<string, unknown>;
  };
  lastChunk: boolean;
  append?: boolean;
}

export interface StatusUpdateEvent {
  kind: "status-update";
  taskId: string;
  contextId: string;
  final?: boolean;
  status: TaskStatus;
  metadata?: {
    type?: "reasoning" | "status" | "investigation" | "keepalive" | "decision" | "output" | "preflight" | "tool_call" | "approval_request" | "approval_request_resolved" | "problem_resolved" | "alignment_check_failed";
    [key: string]: unknown;
  };
}

export type A2AEvent = ArtifactUpdateEvent | StatusUpdateEvent;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: "message/stream" | "message/send";
  params: {
    message: A2AMessage;
  };
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: A2AEvent;
  error?: { code: number; message: string };
}
