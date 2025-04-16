import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import { getFountainConfig } from '../configloader';
import { getActiveFountainDocument, getEditor } from '../utils';
import * as telemetry from '../telemetry';

// WebSocket连接状态
enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error
}

// 远程同步服务提供者
export class RemoteSyncProvider {
    private static instance: RemoteSyncProvider;
    private ws: WebSocket | null = null;
    private statusBarItem: vscode.StatusBarItem;
    private connectionState: ConnectionState = ConnectionState.Disconnected;
    private serverIp: string = '';
    private serverPort: number = 8080;
    private password: string = '';

    private constructor() {
        // 创建状态栏项
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

        // 初始化上下文变量
        vscode.commands.executeCommand('setContext', 'fountain.remote.isConnected', false);

        this.updateStatusBar();
        this.statusBarItem.show();

        // 监听配置变更
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('fountain.remote')) {
                this.loadConfig();
            }
        });

        // 初始加载配置
        this.loadConfig();
    }

    // 单例模式获取实例
    public static getInstance(): RemoteSyncProvider {
        if (!RemoteSyncProvider.instance) {
            RemoteSyncProvider.instance = new RemoteSyncProvider();
        }
        return RemoteSyncProvider.instance;
    }

    // 加载配置
    private loadConfig(): void {
        const config = getFountainConfig(getActiveFountainDocument());
        if (config) {
            this.serverIp = config.remote_server_ip || '127.0.0.1';
            this.serverPort = config.remote_server_port || 8080;
            this.password = config.remote_password || '';
        }
    }

    // 显示操作菜单
    private showOperationMenu(): void {
        if (this.connectionState !== ConnectionState.Connected) {
            // 如果未连接，直接连接
            this.connect();
            return;
        }

        // 如果已连接，显示操作菜单
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(cloud-download) 从远程获取文件',
                description: '从远程服务器获取文件内容'
            },
            {
                label: '$(cloud-upload) 推送文件到远程',
                description: '将当前文件内容推送到远程服务器'
            },
            {
                label: '$(debug-disconnect) 断开远程连接',
                description: '断开与远程服务器的连接'
            }
        ];

        vscode.window.showQuickPick(items, {
            placeHolder: '选择远程操作'
        }).then(selection => {
            if (!selection) {
                return;
            }

            if (selection.label.includes('获取文件')) {
                this.fetchFromRemote();
            } else if (selection.label.includes('推送文件')) {
                this.pushToRemote();
            } else if (selection.label.includes('断开远程连接')) {
                this.disconnect();
            }
        });
    }

    // 更新状态栏和上下文变量
    private updateStatusBar(): void {
        // 设置上下文变量，控制UI显示
        const isConnected = this.connectionState === ConnectionState.Connected;
        vscode.commands.executeCommand('setContext', 'fountain.remote.isConnected', isConnected);

        switch (this.connectionState) {
            case ConnectionState.Disconnected:
                this.statusBarItem.text = '$(plug) 远程: 未连接';
                this.statusBarItem.tooltip = '点击连接到远程服务器';
                this.statusBarItem.command = 'fountain.remote.showMenu';
                break;
            case ConnectionState.Connecting:
                this.statusBarItem.text = '$(sync~spin) 远程: 连接中...';
                this.statusBarItem.tooltip = '正在连接到远程服务器';
                this.statusBarItem.command = undefined;
                break;
            case ConnectionState.Connected:
                this.statusBarItem.text = '$(check) 远程: 已连接';
                this.statusBarItem.tooltip = `已连接到 ${this.serverIp}:${this.serverPort} (点击显示操作菜单)`;
                this.statusBarItem.command = 'fountain.remote.showMenu';
                break;
            case ConnectionState.Error:
                this.statusBarItem.text = '$(error) 远程: 连接错误';
                this.statusBarItem.tooltip = '连接远程服务器时出错 (点击重试)';
                this.statusBarItem.command = 'fountain.remote.showMenu';
                break;
        }
    }

    // 连接到远程服务器
    public async connect(): Promise<boolean> {
        // 如果已经连接，则先断开
        if (this.connectionState === ConnectionState.Connected) {
            this.disconnect();
        }

        // 更新状态
        this.connectionState = ConnectionState.Connecting;
        this.updateStatusBar();

        try {
            // 加载最新配置
            this.loadConfig();

            // 创建WebSocket连接
            const wsUrl = `ws://${this.serverIp}:${this.serverPort}`;
            this.ws = new WebSocket(wsUrl);

            // 设置超时
            const connectTimeout = setTimeout(() => {
                if (this.connectionState === ConnectionState.Connecting) {
                    this.connectionState = ConnectionState.Error;
                    this.updateStatusBar();
                    vscode.window.showErrorMessage(`连接超时: ${wsUrl}`);
                    this.ws?.close();
                    this.ws = null;
                }
            }, 10000); // 10秒超时

            // 处理连接事件
            this.ws.on('open', () => {
                clearTimeout(connectTimeout);
                this.connectionState = ConnectionState.Connected;
                this.updateStatusBar();
                vscode.window.showInformationMessage(`已连接到远程服务器: ${this.serverIp}:${this.serverPort}`);

                // 如果有密码，发送认证消息
                if (this.password) {
                    this.sendMessage({
                        type: 'auth',
                        password: this.password
                    });
                }

                telemetry.reportTelemetry("command:fountain.remote.connect");
                return true;
            });

            // 处理消息事件
            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    console.error('解析消息时出错:', error);
                }
            });

            // 处理错误事件
            this.ws.on('error', (error: Error) => {
                clearTimeout(connectTimeout);
                console.error('WebSocket错误:', error);
                this.connectionState = ConnectionState.Error;
                this.updateStatusBar();
                vscode.window.showErrorMessage(`连接远程服务器时出错: ${error.message}`);
                this.ws = null;
                return false;
            });

            // 处理关闭事件
            this.ws.on('close', () => {
                clearTimeout(connectTimeout);
                if (this.connectionState !== ConnectionState.Error) {
                    this.connectionState = ConnectionState.Disconnected;
                    this.updateStatusBar();
                    vscode.window.showInformationMessage('已断开与远程服务器的连接');
                }
                this.ws = null;
            });

            return true;
        } catch (error) {
            console.error('创建WebSocket连接时出错:', error);
            this.connectionState = ConnectionState.Error;
            this.updateStatusBar();
            vscode.window.showErrorMessage(`创建WebSocket连接时出错: ${error.message}`);
            return false;
        }
    }

    // 断开连接
    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectionState = ConnectionState.Disconnected;
        this.updateStatusBar();
        telemetry.reportTelemetry("command:fountain.remote.disconnect");
    }

    // 从远程获取文件
    public async fetchFromRemote(): Promise<void> {
        if (this.connectionState !== ConnectionState.Connected) {
            vscode.window.showErrorMessage('未连接到远程服务器，请先连接');
            return;
        }

        try {
            // 发送获取文件请求
            this.sendMessage({
                type: 'fetch'
            });
            telemetry.reportTelemetry("command:fountain.remote.fetch");
        } catch (error) {
            vscode.window.showErrorMessage(`从远程获取文件时出错: ${error.message}`);
        }
    }

    // 推送文件到远程
    public async pushToRemote(): Promise<void> {
        if (this.connectionState !== ConnectionState.Connected) {
            vscode.window.showErrorMessage('未连接到远程服务器，请先连接');
            return;
        }

        const editor = getEditor(getActiveFountainDocument());
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的fountain文件');
            return;
        }

        try {
            // 获取当前文件内容
            const content = editor.document.getText();

            // 发送文件内容到远程
            this.sendMessage({
                type: 'push',
                content: content
            });

            vscode.window.showInformationMessage(`已推送文件内容到远程服务器，长度: ${content.length} 字符`);
            telemetry.reportTelemetry("command:fountain.remote.push");
        } catch (error) {
            vscode.window.showErrorMessage(`推送文件到远程时出错: ${error.message}`);
        }
    }

    // 发送消息到WebSocket服务器
    private sendMessage(message: any): void {
        if (this.ws && this.connectionState === ConnectionState.Connected) {
            this.ws.send(JSON.stringify(message));
        }
    }

    // 处理接收到的消息
    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'auth_response':
                if (message.success) {
                    vscode.window.showInformationMessage('认证成功: ' + message.message);
                } else {
                    vscode.window.showErrorMessage('认证失败: ' + message.message);
                    this.disconnect();
                }
                break;

            case 'content':
                // 获取当前编辑器
                const editor = getEditor(getActiveFountainDocument());
                if (!editor) {
                    vscode.window.showErrorMessage('没有打开的fountain文件');
                    return;
                }

                // 更新文件内容
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(editor.document.lineCount, 0)
                );
                edit.replace(editor.document.uri, fullRange, message.content);
                await vscode.workspace.applyEdit(edit);

                vscode.window.showInformationMessage(`已从远程获取文件内容，长度: ${message.content.length} 字符`);
                break;

            case 'error':
                vscode.window.showErrorMessage(`远程错误: ${message.message}`);
                break;

            default:
                console.log('收到未知类型的消息:', message);
                break;
        }
    }

    // 注册命令
    public static registerCommands(context: vscode.ExtensionContext): void {
        const instance = RemoteSyncProvider.getInstance();

        // 注册显示菜单命令
        context.subscriptions.push(
            vscode.commands.registerCommand('fountain.remote.showMenu', () => {
                instance.showOperationMenu();
            })
        );

        // 注册连接命令
        context.subscriptions.push(
            vscode.commands.registerCommand('fountain.remote.connect', async () => {
                await instance.connect();
            })
        );

        // 注册断开连接命令
        context.subscriptions.push(
            vscode.commands.registerCommand('fountain.remote.disconnect', () => {
                instance.disconnect();
            })
        );

        // 注册获取文件命令
        context.subscriptions.push(
            vscode.commands.registerCommand('fountain.remote.fetch', async () => {
                await instance.fetchFromRemote();
            })
        );

        // 注册推送文件命令
        context.subscriptions.push(
            vscode.commands.registerCommand('fountain.remote.push', async () => {
                await instance.pushToRemote();
            })
        );
    }

    // 处理自动连接
    public static handleAutoConnect(): void {
        const config = getFountainConfig(getActiveFountainDocument());
        if (config && config.remote_auto_connect) {
            const instance = RemoteSyncProvider.getInstance();
            instance.connect();
        }
    }
}
