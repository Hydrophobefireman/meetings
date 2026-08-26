declare function $config(config: unknown): unknown;

declare const sst: {
  cloudflare: {
    Kv: new (name: string, args?: Record<string, unknown>) => unknown;
    Worker: new (
      name: string,
      args: {
        handler: string;
        link?: unknown[];
        url?: boolean;
        assets?: {
          directory: string;
          htmlHandling?:
            | "auto-trailing-slash"
            | "force-trailing-slash"
            | "drop-trailing-slash"
            | "none";
          notFoundHandling?: "404-page" | "single-page-application" | "none";
          runWorkerFirst?: boolean | string[];
        };
      },
    ) => { url: unknown };
  };
};
