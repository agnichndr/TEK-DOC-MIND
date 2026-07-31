import type {
  LlmConnectorSummary,
  LlmConnectorType,
} from "@/types/llmConnector";

export type ConnectedConnectorState = {
  summaries: LlmConnectorSummary[];
  defaultConnector: LlmConnectorType | null;
};

export function addConnectedConnector(
  state: ConnectedConnectorState,
  summary: LlmConnectorSummary,
): ConnectedConnectorState {
  const summaries = [
    ...state.summaries.filter(
      (item) => item.connector !== summary.connector,
    ),
    summary,
  ];

  return {
    summaries,
    defaultConnector: state.defaultConnector ?? summary.connector,
  };
}

export function removeConnectedConnector(
  state: ConnectedConnectorState,
  connector: LlmConnectorType,
): ConnectedConnectorState {
  const summaries = state.summaries.filter(
    (item) => item.connector !== connector,
  );

  return {
    summaries,
    defaultConnector:
      state.defaultConnector === connector
        ? summaries[0]?.connector ?? null
        : state.defaultConnector,
  };
}
