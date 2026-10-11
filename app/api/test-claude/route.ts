import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No ANTHROPIC_API_KEY found in process.env" }, { status: 500 });
  }

  const keyPrefix = apiKey.substring(0, 12);
  const keySuffix = apiKey.substring(apiKey.length - 4);
  const keyLength = apiKey.length;
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID || null;

  const modelsToTest = [
    "claude-3-5-haiku-20241022",
    "claude-3-haiku-20240307",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-sonnet-20240229",
    "claude-3-opus-20240229"
  ];

  const results: any[] = [];

  for (const model of modelsToTest) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01"
      };
      if (workspaceId) {
        headers["anthropic-workspace-id"] = workspaceId;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 20,
          messages: [{ role: "user", content: "Hi" }]
        })
      });

      const status = res.status;
      const statusText = res.statusText;
      const data = await res.json();

      results.push({
        model,
        httpStatus: status,
        httpStatusText: statusText,
        response: data
      });
    } catch (e: any) {
      results.push({
        model,
        fetchError: e.message
      });
    }
  }

  // First test GET /v1/models to see what this key is authorized for
  let availableModels: any = null;
  try {
    const mRes = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01"
      }
    });
    availableModels = {
      status: mRes.status,
      data: await mRes.json()
    };
  } catch (e: any) {
    availableModels = { error: e.message };
  }

  return NextResponse.json({
    keySummary: {
      prefix: keyPrefix,
      suffix: keySuffix,
      length: keyLength,
      workspaceId
    },
    availableModels,
    results
  });
}
