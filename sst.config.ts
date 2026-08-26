/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input: { stage?: string } | undefined) {
    return {
      name: "meetings",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage ?? ""),
      home: "cloudflare",
    };
  },
  async run() {
    const store = new sst.cloudflare.Kv("Store");

    const worker = new sst.cloudflare.Worker("Web", {
      handler: "worker/index.ts",
      link: [store],
      url: true,
      domain: "meetings.bhavesh.dev",
      assets: {
        directory: "dist",
        notFoundHandling: "single-page-application",
      },
    });

    return {
      store: store.nodes.namespace.title,
      worker: worker.url,
    };
  },
});
