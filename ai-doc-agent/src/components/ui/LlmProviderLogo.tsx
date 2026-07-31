import Image from "next/image";

import type { LlmConnectorType } from "@/types/llmConnector";

const providerLogos: Record<
  LlmConnectorType,
  { src: string; className: string }
> = {
  openai: {
    src: "/provider-logos/openai.svg",
    className: "provider-logo-openai",
  },
  anthropic: {
    src: "/provider-logos/anthropic.svg",
    className: "provider-logo-anthropic",
  },
  gemini: {
    src: "/provider-logos/gemini.svg",
    className: "provider-logo-gemini",
  },
  azure_openai: {
    src: "/provider-logos/azure-openai.svg",
    className: "provider-logo-azure",
  },
  bedrock: {
    src: "/provider-logos/bedrock.svg",
    className: "provider-logo-bedrock",
  },
  vertex_ai: {
    src: "/provider-logos/vertex-ai.svg",
    className: "provider-logo-vertex",
  },
};

export function LlmProviderLogo({
  connector,
}: {
  connector: LlmConnectorType;
}) {
  const logo = providerLogos[connector];

  return (
    <span
      className={`provider-logo ${logo.className}`}
      data-logo-library="LobeHub Icons"
    >
      <Image
        alt=""
        aria-hidden="true"
        height={50}
        src={logo.src}
        unoptimized
        width={50}
      />
    </span>
  );
}
