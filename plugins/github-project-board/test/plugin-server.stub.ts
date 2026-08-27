import type { ZodType, input as ZodInput, output as ZodOutput } from "zod";

export interface PluginRpcContract<InputSchema extends ZodType, OutputSchema extends ZodType> {
  name: string;
  input: InputSchema;
  output: OutputSchema;
  readonly __input?: ZodInput<InputSchema>;
  readonly __output?: ZodOutput<OutputSchema>;
}

export function defineRpc<InputSchema extends ZodType, OutputSchema extends ZodType>(definition: {
  name: string;
  input: InputSchema;
  output: OutputSchema;
}): PluginRpcContract<InputSchema, OutputSchema> {
  return definition;
}
