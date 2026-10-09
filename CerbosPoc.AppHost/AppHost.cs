var builder = DistributedApplication.CreateBuilder(args);

// Cerbos PDP container with the policies directory bind-mounted from the repo root.
// Cerbos hot-reloads policy changes, so edits to ../policies take effect without a restart.
var cerbos = builder.AddContainer("cerbos", "ghcr.io/cerbos/cerbos", "latest")
    .WithBindMount("../policies", "/policies", isReadOnly: true)
    .WithHttpEndpoint(targetPort: 3592, name: "http")
    .WithEndpoint(targetPort: 3593, name: "grpc", scheme: "http")
    .WithHttpHealthCheck("/_cerbos/health", endpointName: "http");

// Web API: receives the Cerbos gRPC address and waits for the PDP to be healthy.
var api = builder.AddProject<Projects.CerbosPoc_Demo>("api")
    .WithEnvironment("CERBOS_GRPC", cerbos.GetEndpoint("grpc"))
    .WithHttpHealthCheck("/health")
    .WaitFor(cerbos);

// Angular UI: `ng serve` proxies /api to the Web API (see CerbosPoc.Web/proxy.conf.js).
var web = builder.AddJavaScriptApp("web", "../CerbosPoc.Web", "start")
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints()
    .WithReference(api)
    .WaitFor(api);

// `ng serve` ignores PORT, so pass the Aspire-assigned port explicitly. The "--" stops npm
// from consuming the flag itself (`npm run start -- --port <n>`).
web.WithArgs(context =>
{
    context.Args.Add("--");
    context.Args.Add("--port");
    context.Args.Add(web.GetEndpoint("http").Property(EndpointProperty.TargetPort));
});

builder.Build().Run();
