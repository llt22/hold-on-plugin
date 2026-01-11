#!/usr/bin/env node
/**
 * MCP Stdio Wrapper
 * 使用 MCP SDK 和 WebSocket 与插件通信
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocket } from "ws";

// 常量
const APPROVED = "";
const CONVERSATION_END = "CONVERSATION_END";
const WS_PORT = 19876;

// 类型定义
interface FeedbackResult { text: string; images: string[]; }
type ContentItem = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

function parseBase64Image(dataUrl: string): { data: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return match ? { data: match[2], mimeType: match[1] } : null;
}

function formatResponse(text: string, images: string[] = []) {
  const content: ContentItem[] = [{ type: "text", text }];
  for (const img of images) {
    const parsed = parseBase64Image(img);
    if (parsed) content.push({ type: "image", ...parsed });
  }
  return { content };
}

function buildFeedbackResponse(feedback: FeedbackResult) {
  if (feedback.text === CONVERSATION_END) {
    return formatResponse("🏁 用户结束对话，无需再调用 request_approval。");
  }
  if (feedback.text === APPROVED && feedback.images.length === 0) {
    return formatResponse("✅ 用户确认满意，任务完成。");
  }
  let response = feedback.text ? `🔄 用户要求调整：${feedback.text}` : "🔄 用户发送了反馈：";
  if (feedback.images.length > 0) {
    response += `\n\n🖼️ 用户附加了 ${feedback.images.length} 张图片：`;
  }
  return formatResponse(response, feedback.images);
}

// 通过 WebSocket 请求用户反馈
function requestFeedbackFromPlugin(prompt: string): Promise<FeedbackResult> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    let resolved = false;

    const done = (result: FeedbackResult) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
      ws.close();
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'requestFeedback', prompt }));
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'feedbackResult') {
          done({ text: msg.text || '', images: msg.images || [] });
        }
      } catch {
        // ignore
      }
    });

    ws.on('error', () => {
      // 如果连接失败，返回默认确认
      done({ text: APPROVED, images: [] });
    });

    // 30 分钟超时
    setTimeout(() => done({ text: APPROVED, images: [] }), 1800000);
  });
}

// MCP 服务器
const server = new Server(
  { name: "hold-on-plugin", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "request_approval",
    description: "在 AI 完成输出后调用此工具，让用户确认是否满意或给出调整指令。",
    inputSchema: {
      type: "object" as const,
      properties: {
        action_description: { 
          type: "string", 
          description: "AI 刚刚完成的输出摘要，让用户知道你做了什么" 
        },
      },
      required: ["action_description"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = args as Record<string, string>;

  if (name === "request_approval") {
    const desc = params.action_description?.trim();
    if (!desc) return formatResponse("❌ 错误：action_description 不能为空");
    
    console.error(`[HoldOn] 请求用户确认: ${desc}`);
    const feedback = await requestFeedbackFromPlugin(desc);
    
    return buildFeedbackResponse(feedback);
  }

  return formatResponse(`未知工具: ${name}`);
});

// 启动
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[HoldOn] MCP 服务器已启动 (stdio wrapper)");
}

main().catch(console.error);
