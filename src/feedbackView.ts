import * as vscode from 'vscode';

interface FeedbackResult {
  text: string;
  images: string[];
}

type FeedbackCallback = (result: FeedbackResult) => void;

export class FeedbackViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hold-on.feedbackView';
  
  private _view?: vscode.WebviewView;
  private _pendingCallback?: FeedbackCallback;
  private _currentPrompt?: string;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    
    // 如果有待处理的请求，立即发送
    if (this._currentPrompt) {
      webviewView.webview.postMessage({
        type: 'showPrompt',
        prompt: this._currentPrompt
      });
    }

    // 处理来自 Webview 的消息
    webviewView.webview.onDidReceiveMessage((data: { type: string; text?: string; images?: string[] }) => {
      switch (data.type) {
        case 'submit':
          if (this._pendingCallback) {
            this._pendingCallback({
              text: data.text || '',
              images: data.images || []
            });
            this._pendingCallback = undefined;
            this._currentPrompt = undefined;
            this._updateView('idle');
          }
          break;
        case 'end':
          if (this._pendingCallback) {
            this._pendingCallback({
              text: 'CONVERSATION_END',
              images: []
            });
            this._pendingCallback = undefined;
            this._currentPrompt = undefined;
            this._updateView('idle');
          }
          break;
      }
    });
  }

  // 请求用户反馈
  public async requestFeedback(prompt: string): Promise<FeedbackResult> {
    return new Promise(async (resolve) => {
      this._currentPrompt = prompt;
      this._pendingCallback = resolve;
      
      // 如果面板未初始化，先展开面板
      if (!this._view) {
        await vscode.commands.executeCommand('hold-on.feedbackView.focus');
        // 轮询等待面板初始化，最多等待 3 秒
        for (let i = 0; i < 6; i++) {
          if (this._view) break;
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      // 显示面板并更新内容
      if (this._view) {
        this._view.show(true);
        this._view.webview.postMessage({
          type: 'showPrompt',
          prompt: prompt
        });
      }

      // 30 分钟超时
      setTimeout(() => {
        if (this._pendingCallback === resolve) {
          resolve({ text: '', images: [] });
          this._pendingCallback = undefined;
          this._currentPrompt = undefined;
          this._updateView('idle');
        }
      }, 1800000);
    });
  }

  private _updateView(state: 'idle' | 'waiting') {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateState',
        state: state
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
  <title>Hold On</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-panel-background);
      color: var(--vscode-foreground);
      padding: 16px;
      min-height: 100vh;
    }
    
    .container {
      max-width: 100%;
    }
    
    .idle-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }
    
    .idle-state .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    
    .idle-state h2 {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    
    .idle-state p {
      font-size: 13px;
    }
    
    .feedback-form {
      display: none;
    }
    
    .feedback-form.active {
      display: block;
    }
    
    .prompt-box {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 16px;
    }
    
    .prompt-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
      display: block;
    }
    
    .prompt-text {
      white-space: pre-wrap;
      font-size: 13px;
      max-height: 150px;
      overflow-y: auto;
      font-family: var(--vscode-editor-font-family);
      line-height: 1.5;
    }
    
    .input-area {
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      margin-bottom: 12px;
      transition: border-color 0.2s;
    }
    
    .input-area:focus-within {
      border-color: var(--vscode-focusBorder);
    }
    
    textarea {
      width: 100%;
      border: none;
      outline: none;
      resize: none;
      min-height: 80px;
      padding: 12px;
      font-size: 13px;
      font-family: inherit;
      color: var(--vscode-input-foreground);
      background: transparent;
    }
    
    textarea::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }
    
    .images-preview {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0 12px 12px;
    }
    
    .images-preview:empty {
      display: none;
    }
    
    .image-item {
      position: relative;
      width: 60px;
      height: 60px;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--vscode-input-border);
    }
    
    .image-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .image-item .remove {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 18px;
      height: 18px;
      background: var(--vscode-errorForeground);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .image-item .remove:hover {
      background: var(--vscode-errorForeground);
      opacity: 0.8;
    }
    
    .helper-text {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    
    .buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    
    button {
      padding: 6px 14px;
      border-radius: 2px;
      font-size: 13px;
      cursor: pointer;
      border: none;
      font-family: inherit;
      transition: background-color 0.2s;
    }
    
    .btn-secondary {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-button-secondaryBackground);
    }
    
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="idle-state" id="idleState">
      <div class="icon">💬</div>
      <h2>等待 AI 请求</h2>
      <p>当 AI 调用 request_approval 时，这里会显示反馈界面</p>
    </div>
    
    <div class="feedback-form" id="feedbackForm">
      <div class="prompt-box">
        <span class="prompt-label">AI 输出摘要</span>
        <div class="prompt-text" id="promptText"></div>
      </div>
      
      <div class="input-area" id="inputArea">
        <textarea id="textInput" placeholder="输入反馈（留空表示满意）..."></textarea>
        <div class="images-preview" id="imagesPreview"></div>
      </div>
      
      <div class="helper-text">
        粘贴图片 Ctrl+V • 提交 Ctrl+Enter
      </div>
      
      <div class="buttons">
        <button class="btn-secondary" onclick="endConversation()">结束对话</button>
        <button class="btn-primary" onclick="submitFeedback()">确认并继续</button>
      </div>
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    const images = [];
    
    const idleState = document.getElementById('idleState');
    const feedbackForm = document.getElementById('feedbackForm');
    const promptText = document.getElementById('promptText');
    const textInput = document.getElementById('textInput');
    const imagesPreview = document.getElementById('imagesPreview');
    const inputArea = document.getElementById('inputArea');
    
    // 处理来自扩展的消息
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'showPrompt':
          showFeedbackForm(message.prompt);
          break;
        case 'updateState':
          if (message.state === 'idle') {
            showIdleState();
          }
          break;
      }
    });
    
    function showFeedbackForm(prompt) {
      promptText.textContent = prompt;
      textInput.value = '';
      images.length = 0;
      renderImages();
      
      idleState.style.display = 'none';
      feedbackForm.classList.add('active');
      textInput.focus();
    }
    
    function showIdleState() {
      feedbackForm.classList.remove('active');
      idleState.style.display = 'block';
    }
    
    function submitFeedback() {
      vscode.postMessage({
        type: 'submit',
        text: textInput.value.trim(),
        images: images
      });
    }
    
    function endConversation() {
      vscode.postMessage({
        type: 'end'
      });
    }
    
    // 图片粘贴
    inputArea.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const base64 = ev.target?.result;
              if (typeof base64 === 'string') {
                images.push(base64);
                renderImages();
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    });
    
    function renderImages() {
      imagesPreview.innerHTML = images.map((img, i) => 
        '<div class="image-item">' +
          '<img src="' + img + '" alt="preview">' +
          '<button class="remove" onclick="removeImage(' + i + ')">×</button>' +
        '</div>'
      ).join('');
    }
    
    function removeImage(index) {
      images.splice(index, 1);
      renderImages();
    }
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        submitFeedback();
      }
      if (e.key === 'Escape') {
        endConversation();
      }
    });
  </script>
</body>
</html>`;
  }
}
