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

    new sst.cloudflare.Worker("Web", {
      handler: "worker/index.ts",
      link: [store],
      url: true,
      assets: {
        directory: "public",
        notFoundHandling: "single-page-application",
      },
    });
  },
});
