import { z } from "zod";

const credentialSchema = z
  .string()
  .trim()
  .min(8, "Enter a valid credential.")
  .max(8192, "Credential is too long.")
  .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), {
    message: "Credential contains invalid characters.",
  });

const modelIdSchema = z
  .string()
  .trim()
  .min(1, "Choose a default model.")
  .max(256, "Model identifier is too long.")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, "Choose a valid model.");

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/, "Enter a valid identifier.");

const awsRegionSchema = z
  .string()
  .trim()
  .max(32)
  .regex(
    /^(?:af|ap|ca|eu|il|me|mx|sa|us)-(?:central|east|north|northeast|northwest|south|southeast|southwest|west)-\d$/,
    "Enter a valid AWS region.",
  )
  .refine(
    (value) =>
      new Set([
        "ap-northeast-1",
        "ap-northeast-2",
        "ap-northeast-3",
        "ap-south-1",
        "ap-south-2",
        "ap-southeast-1",
        "ap-southeast-2",
        "ca-central-1",
        "eu-central-1",
        "eu-central-2",
        "eu-north-1",
        "eu-west-1",
        "eu-west-2",
        "eu-west-3",
        "sa-east-1",
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
      ]).has(value),
    "Select a supported AWS region.",
  );

const azureEndpointSchema = z
  .string()
  .trim()
  .max(512)
  .url()
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      const validHost =
        /^[a-z0-9][a-z0-9-]{0,62}\.openai\.azure\.com$/i.test(url.hostname) ||
        /^[a-z0-9][a-z0-9-]{0,62}\.services\.ai\.azure\.com$/i.test(
          url.hostname,
        );

      if (
        url.protocol !== "https:" ||
        !validHost ||
        url.username ||
        url.password ||
        url.port ||
        (url.pathname !== "" && url.pathname !== "/") ||
        url.search ||
        url.hash
      ) {
        context.addIssue({
          code: "custom",
          message: "Enter a valid Azure OpenAI resource endpoint.",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Enter a valid Azure OpenAI resource endpoint.",
      });
    }
  });

const openAiCredentialSchema = z.object({
  connector: z.literal("openai"),
  authenticationMethod: z.enum(["api_key", "access_token"]),
  credential: credentialSchema,
});

const anthropicCredentialSchema = z.object({
  connector: z.literal("anthropic"),
  authenticationMethod: z.enum(["api_key", "bearer_token"]),
  credential: credentialSchema,
});

const geminiConnectorSchema = z.object({
  connector: z.literal("gemini"),
  authenticationMethod: z.enum([
    "standard_api_key",
    "authorization_api_key",
  ]),
  credential: credentialSchema,
});

const azureOpenAiConnectorSchema = z.object({
  connector: z.literal("azure_openai"),
  authenticationMethod: z.enum(["api_key", "entra_token"]),
  endpoint: azureEndpointSchema,
  credential: credentialSchema,
});

const bedrockConnectorSchema = z.object({
  connector: z.literal("bedrock"),
  authenticationMethod: z.literal("aws_access_keys"),
  region: awsRegionSchema,
  accessKeyId: z
    .string()
    .trim()
    .min(16)
    .max(128)
    .regex(/^[A-Z0-9]+$/, "Enter a valid AWS access-key ID."),
  secretAccessKey: credentialSchema,
  sessionToken: z.union([z.literal(""), credentialSchema]).optional(),
});

const vertexAiConnectorSchema = z.object({
  connector: z.literal("vertex_ai"),
  authenticationMethod: z.literal("oauth_access_token"),
  projectId: identifierSchema.max(63),
  location: identifierSchema.max(64),
  credential: credentialSchema,
});

export const llmModelDiscoveryInputSchema = z.discriminatedUnion("connector", [
  openAiCredentialSchema,
  anthropicCredentialSchema,
  geminiConnectorSchema,
  azureOpenAiConnectorSchema,
  bedrockConnectorSchema,
  vertexAiConnectorSchema,
]);

export const llmConnectorInputSchema = z.discriminatedUnion("connector", [
  openAiCredentialSchema.extend({ defaultModel: modelIdSchema }),
  anthropicCredentialSchema.extend({ defaultModel: modelIdSchema }),
  geminiConnectorSchema.extend({ defaultModel: modelIdSchema }),
  azureOpenAiConnectorSchema.extend({ defaultModel: modelIdSchema }),
  bedrockConnectorSchema.extend({ defaultModel: modelIdSchema }),
  vertexAiConnectorSchema.extend({ defaultModel: modelIdSchema }),
]);

export type LlmModelDiscoveryInput = z.infer<
  typeof llmModelDiscoveryInputSchema
>;
export type LlmConnectorInput = z.infer<typeof llmConnectorInputSchema>;
export const llmConnectorTypeSchema = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "azure_openai",
  "bedrock",
  "vertex_ai",
]);
export type LlmConnectorType = LlmConnectorInput["connector"];
export type LlmAuthenticationMethod =
  LlmConnectorInput["authenticationMethod"];

export const llmProviderModelSchema = z.object({
  id: modelIdSchema,
  displayName: z.string().trim().min(1).max(256),
  createdAt: z.iso.datetime().nullable(),
});

export type LlmProviderModel = z.infer<typeof llmProviderModelSchema>;

const connectorSummaryBase = {
  status: z.literal("connected"),
  verifiedAt: z.iso.datetime(),
};

export const llmConnectorSummarySchema = z.discriminatedUnion("connector", [
  z.object({
    ...connectorSummaryBase,
    connector: z.literal("openai"),
    authenticationMethod: z.enum(["api_key", "access_token"]),
    defaultModel: modelIdSchema.optional(),
  }),
  z.object({
    ...connectorSummaryBase,
    connector: z.literal("anthropic"),
    authenticationMethod: z.enum(["api_key", "bearer_token"]),
    defaultModel: modelIdSchema.optional(),
  }),
  z.object({
    ...connectorSummaryBase,
    connector: z.literal("gemini"),
    authenticationMethod: z.enum([
      "standard_api_key",
      "authorization_api_key",
    ]),
    defaultModel: modelIdSchema.optional(),
  }),
  z.object({
    ...connectorSummaryBase,
    connector: z.literal("azure_openai"),
    authenticationMethod: z.enum(["api_key", "entra_token"]),
    endpoint: azureEndpointSchema,
    defaultModel: modelIdSchema.optional(),
  }),
  z.object({
    ...connectorSummaryBase,
    connector: z.literal("bedrock"),
    authenticationMethod: z.literal("aws_access_keys"),
    region: awsRegionSchema,
    defaultModel: modelIdSchema.optional(),
  }),
  z.object({
    ...connectorSummaryBase,
    connector: z.literal("vertex_ai"),
    authenticationMethod: z.literal("oauth_access_token"),
    projectId: identifierSchema.max(63),
    location: identifierSchema.max(64),
    defaultModel: modelIdSchema.optional(),
  }),
]);

export type LlmConnectorSummary = z.infer<typeof llmConnectorSummarySchema>;

export type VerifyLlmConnectorErrorCode =
  | "invalid_input"
  | "session_required"
  | "invalid_credentials"
  | "model_unavailable"
  | "forbidden"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "configuration_error";

export type DiscoverLlmModelsResult =
  | {
      status: "success";
      connector: LlmConnectorType;
      models: LlmProviderModel[];
    }
  | {
      status: "error";
      code: VerifyLlmConnectorErrorCode;
      message: string;
    };

export type VerifyLlmModelResult =
  | { status: "success"; model: LlmProviderModel }
  | {
      status: "error";
      code: VerifyLlmConnectorErrorCode;
      message: string;
    };

export type VerifyLlmConnectorResult =
  | { status: "connected"; summary: LlmConnectorSummary }
  | {
      status: "error";
      code: VerifyLlmConnectorErrorCode;
      message: string;
    };

export type SavedLlmConnectorCheck =
  | {
      connector: LlmConnectorType;
      status: "connected";
      summary: LlmConnectorSummary;
    }
  | {
      connector: LlmConnectorType;
      status: "error";
      message: string;
    };

export type CheckSavedLlmConnectorsResult =
  | { status: "success"; connections: SavedLlmConnectorCheck[] }
  | { status: "error"; message: string };
