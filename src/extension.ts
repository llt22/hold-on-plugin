import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import { FeedbackViewProvider } from './feedbackView';
import * as path from 'path';

const WS_PORT = 19876;
let wsServer: WebSocketServer | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('[HoldOn] Extension activating...');

  // 创建 Webview Provider
  const feedbackProvider = new FeedbackViewProvider(context.extensionUri);
  
  // 注册侧边栏 Webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'hold-on.feedbackView',
      feedbackProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // 启动 WebSocket 服务器，用于与 MCP wrapper 通信
  startWebSocketServer(feedbackProvider);

  // 注册命令：复制 MCP 配置
  context.subscriptions.push(
    vscode.commands.registerCommand('hold-on.copyMcpConfig', async () => {
      const wrapperPath = path.join(context.extensionPath, 'dist', 'mcp-stdio-wrapper.js');
      
      const config = {
        "hold-on-plugin": {
          "command": "node",
          "args": [wrapperPath]
        }
      };
      
      await vscode.env.clipboard.writeText(JSON.stringify(config, null, 2));
      vscode.window.showInformationMessage('MCP 配置已复制到剪贴板');
    })
  );

  // 注册命令：显示面板
  context.subscriptions.push(
    vscode.commands.registerCommand('hold-on.showPanel', () => {
      vscode.commands.executeCommand('hold-on.feedbackView.focus');
    })
  );

  console.log('[HoldOn] Extension activated');
}

function startWebSocketServer(feedbackProvider: FeedbackViewProvider) {
  try {
    wsServer = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });
    
    wsServer.on('connection', (ws: WebSocket) => {
      console.log('[HoldOn] MCP wrapper connected');
      
      ws.on('message', async (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (msg.type === 'requestFeedback') {
            // 请求用户反馈
            const result = await feedbackProvider.requestFeedback(msg.prompt);
            ws.send(JSON.stringify({
              type: 'feedbackResult',
              text: result.text,
              images: result.images
            }));
          }
        } catch (error) {
          console.error('[HoldOn] WebSocket message error:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('[HoldOn] MCP wrapper disconnected');
      });
    });
    
    wsServer.on('error', (error) => {
      console.error('[HoldOn] WebSocket server error:', error);
    });
    
    console.log(`[HoldOn] WebSocket server started on port ${WS_PORT}`);
  } catch (error) {
    console.error('[HoldOn] Failed to start WebSocket server:', error);
  }
}

export function deactivate() {
  if (wsServer) {
    wsServer.close();
    wsServer = undefined;
  }
  console.log('[HoldOn] Extension deactivated');
}
