declare module "js-yaml" {
  export function dump(
    value: unknown,
    options?: {
      lineWidth?: number;
      noRefs?: boolean;
      sortKeys?: boolean;
    },
  ): string;

  export function load(value: string): unknown;
}
