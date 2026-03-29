import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const tools = [
  {
    type: "function",
    function: {
      name: "list_github_files",
      description: "List files in a GitHub repository directory.",
      parameters: {
        type: "object",
        properties: { 
          owner: { type: "string" }, 
          repo: { type: "string" }, 
          path: { type: "string", description: "Path to a directory (e.g. '', 'src', 'src/components')" } 
        },
        required: ["owner", "repo", "path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_github_file",
      description: "Read the plaintext content of a file from a GitHub repository.",
      parameters: {
        type: "object",
        properties: { 
          owner: { type: "string" }, 
          repo: { type: "string" }, 
          path: { type: "string", description: "Exact file path (e.g., 'src/index.ts')" }, 
          branch: { type: "string", description: "Branch or commit sha, e.g., 'main'" } 
        },
        required: ["owner", "repo", "path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "commit_to_github_branch",
      description: "Create or update a file on a specific branch in GitHub.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string" }, 
          repo: { type: "string" },
          branch: { type: "string", description: "Branch to commit to. Use 'main' if updating directly." },
          path: { type: "string", description: "Target file path within the repository" },
          content: { type: "string", description: "The new complete file content." },
          message: { type: "string", description: "Commit message." }
        },
        required: ["owner", "repo", "branch", "path", "content", "message"]
      }
    }
  }
];

async function handleToolCall(toolCall: any, token: string, pushLog: (msg: string) => void) {
  const args = JSON.parse(toolCall.function.arguments);
  const name = toolCall.function.name;
  
  const headers = {
    "Accept": "application/vnd.github.v3+json",
    "Authorization": `Bearer ${token}`,
    "User-Agent": "AYN-Dev-Agent"
  };

  try {
    if (name === "list_github_files") {
      const { owner, repo, path } = args;
      pushLog(`*Listing files in* \`${owner}/${repo}/${path || 'root'}\`...`);
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return JSON.stringify(Array.isArray(data) ? data.map((f: any) => ({ name: f.name, type: f.type, path: f.path })) : data);
    }
    
    if (name === "read_github_file") {
      const { owner, repo, path, branch } = args;
      pushLog(`*Reading file* \`${path}\`...`);
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${branch ? `?ref=${branch}` : ''}`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      const content = atob(data.content.replace(/\s/g, ''));
      return content;
    }

    if (name === "commit_to_github_branch") {
      const { owner, repo, branch, path, content, message } = args;
      pushLog(`🚀 *Committing changes to* \`${path}\`...`);
      
      let sha = undefined;
      const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers });
      if (getRes.ok) {
        const getData = await getRes.json();
        sha = getData.sha;
      }

      const base64Content = btoa(unescape(encodeURIComponent(content)));

      const body = {
        message,
        content: base64Content,
        branch,
        ...(sha ? { sha } : {})
      };

      const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const putData = await putRes.json();
      if (!putRes.ok) throw new Error(JSON.stringify(putData));
      pushLog(`✅ **Successfully committed to \`${branch}\`!**`);
      return `Success: Committed to ${branch} -> ${putData.content?.path || path}`;
    }

    return "Unknown tool";
  } catch (err: any) {
    pushLog(`❌ *Tool Error:* ${err.message}`);
    return "Error: " + err.message;
  }
}

serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendChunk = (text: string) => {
        const chunk = JSON.stringify({ text });
        controller.enqueue(encoder.encode(`data: ${chunk}\n\ndata: [DONE]\n\n`));
      };

      try {
        const body = await req.json();
        const { message, repos = [], projects = [], github_token, model = "google/gemini-2.5-pro", skills = "" } = body;

        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured on the Supabase environment secrets");
        if (!github_token) throw new Error("github_token is missing! Please connect your GitHub Token in the UI before proceeding.");

        const systemPrompt = `You are AYN Dev Agent. 
You are an autonomous coding assistant who reads code, diagnoses issues, writes fixes, and deploys them by committing directly to GitHub repositories.
Your current GitHub Repositories context: ${JSON.stringify(repos)}
Your current Supabase Projects context: ${JSON.stringify(projects)}

### DOMAIN KNOWLEDGE & SKILLS (Injected by user):
${skills}

You have access to tools that can list, read, and commit files to github repositories. YOU ARE CAPABLE OF EXECUTING GITHUB ACTIONS VIA THESE TOOLS! 

CRITICAL INSTRUCTIONS:
- DO NOT say you lack access to execute 'git push' or lack write access to GitHub. 
- You MUST use the 'commit_to_github_branch' tool to push files MATHEMATICALLY over the REST API. This acts as your 'git push'.
- If the user asks you to "push", immediately execute the 'commit_to_github_branch' tool. Do not apologize.

When asked to fix a bug or implement a feature for a repository in your context:
1. Use list_github_files and read_github_file to locate the target.
2. Read the source file.
3. Use commit_to_github_branch to directly write your fixes over the GitHub API! Providing the new complete file source code.

Deliver short, concise markdown explanations to the user alongside your automated actions.`;

        const messages: any[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ];

        sendChunk(`> 🧠 Analyzing code strategy via ${model}...\n\n`);

        const maxIterations = 6;
        for (let i = 0; i < maxIterations; i++) {
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages,
              tools,
              tool_choice: "auto",
              stream: false
            })
          });

          if (!response.ok) {
            const errTxt = await response.text();
            throw new Error(`AI gateway error ${response.status}: ${errTxt}`);
          }

          const data = await response.json();
          const msg = data.choices?.[0]?.message;

          if (!msg) throw new Error("No message returned from AI");

          messages.push(msg);

          if (msg.tool_calls && msg.tool_calls.length > 0) {
            for (const tc of msg.tool_calls) {
              const result = await handleToolCall(tc, github_token, (executionLog) => {
                sendChunk(`${executionLog}\n\n`);
              });
              messages.push({
                role: "tool",
                tool_call_id: tc.id,
                name: tc.function.name,
                content: result
              });
            }
          } else {
            sendChunk(`---\n\n${msg.content || "Process completed."}`);
            break;
          }
        }
      } catch (error: any) {
        console.error("error", error);
        sendChunk(`\n\n❌ **Fatal Error:** ${error.message}`);
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
});
