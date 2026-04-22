import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;
const RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";

if (!RAILWAY_TOKEN) {
  console.warn("WARNING: RAILWAY_TOKEN is not set. MCP tools will fail until authenticated.");
}

class RailwayClient {
  private async query(query: string, variables: any = {}) {
    const response = await fetch(RAILWAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const body = await response.json();
    if (body.errors) {
      throw new Error(body.errors.map((e: any) => e.message).join(", "));
    }
    return body.data;
  }

  async listProjects() {
    const q = `
      query {
        projects {
          edges {
            node {
              id
              name
              description
            }
          }
        }
      }
    `;
    const data = await this.query(q);
    return data.projects.edges.map((e: any) => e.node);
  }

  async listServices(projectId: string) {
    const q = `
      query ($projectId: String!) {
        project(id: $projectId) {
          services {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `;
    const data = await this.query(q, { projectId });
    return data.project.services.edges.map((e: any) => e.node);
  }

  async getDeploymentLogs(serviceId: string) {
    const q = `
      query ($serviceId: String!) {
        service(id: $serviceId) {
          deployments(first: 1) {
            edges {
              node {
                id
                status
                logs(first: 100)
              }
            }
          }
        }
      }
    `;
    const data = await this.query(q, { serviceId });
    const deployment = data.service.deployments.edges[0]?.node;
    if (!deployment) return "No deployments found for this service.";
    return `Status: ${deployment.status}\n\nLogs:\n${deployment.logs || "No logs available."}`;
  }
}

const railway = new RailwayClient();

const server = new Server(
  {
    name: "railway-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_projects",
      description: "List all Railway projects",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_services",
      description: "List services for a Railway project",
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "The ID of the Railway project" },
        },
        required: ["projectId"],
      },
    },
    {
      name: "get_deployment_logs",
      description: "Get recent deployment logs for a service",
      inputSchema: {
        type: "object",
        properties: {
          serviceId: { type: "string", description: "The ID of the Railway service" },
        },
        required: ["serviceId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "list_projects":
        return { content: [{ type: "text", text: JSON.stringify(await railway.listProjects(), null, 2) }] };
      case "list_services":
        return { content: [{ type: "text", text: JSON.stringify(await railway.listServices(request.params.arguments?.projectId as string), null, 2) }] };
      case "get_deployment_logs":
        return { content: [{ type: "text", text: await railway.getDeploymentLogs(request.params.arguments?.serviceId as string) }] };
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Railway MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
