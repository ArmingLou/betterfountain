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
    private serverConfigs: Array<{
        name: string;
        ip: string;
        port: number;
        password: string;
    }> = [{
        name: "本地服务器",
        ip: "127.0.0.1",
        port: 8080,
        password: ""
    }];
    private currentServerIndex: number = 0;
    private currentServer: {
        name: string;
        ip: string;
        port: number;
        password: string;
    } = {
            name: "本地服务器",
            ip: "127.0.0.1",
            port: 8080,
            password: ""
        };

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
            // 加载服务器配置列表，如果为空则使用默认配置
            this.serverConfigs = config.remote_server_configs || [{
                name: "本地服务器",
                ip: "127.0.0.1",
                port: 8080,
                password: ""
            }];

            // 加载上次使用的服务器索引
            let lastIndex = config.remote_last_server_index;

            // 确保索引在有效范围内
            if (lastIndex === undefined || lastIndex < 0 || lastIndex >= this.serverConfigs.length) {
                // 如果索引无效，使用第一个服务器
                lastIndex = 0;

                // 如果服务器列表为空，则不更新索引
                if (this.serverConfigs.length === 0) {
                    lastIndex = -1;
                }
            }

            this.currentServerIndex = lastIndex;

            // 设置当前服务器（如果有效）
            if (this.currentServerIndex >= 0 && this.currentServerIndex < this.serverConfigs.length) {
                this.currentServer = this.serverConfigs[this.currentServerIndex];
            } else {
                // 设置一个默认的服务器配置
                this.currentServer = {
                    name: "本地服务器",
                    ip: "127.0.0.1",
                    port: 8080,
                    password: ""
                };
            }
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
                this.statusBarItem.tooltip = `已连接到 ${this.currentServer.name} (${this.currentServer.ip}:${this.currentServer.port}) (点击显示操作菜单)`;
                this.statusBarItem.command = 'fountain.remote.showMenu';
                break;
            case ConnectionState.Error:
                this.statusBarItem.text = '$(error) 远程: 连接错误';
                this.statusBarItem.tooltip = '连接远程服务器时出错 (点击重试)';
                this.statusBarItem.command = 'fountain.remote.showMenu';
                break;
        }
    }

    // 获取本地网络IP地址，优先返回192开头的IP地址
    private getLocalNetworkIP(): string {
        try {
            const networkInterfaces = require('os').networkInterfaces();
            let localIPs: string[] = [];
            let ip192 = '';
            let otherIP = '';

            // 遍历所有网络接口
            for (const name of Object.keys(networkInterfaces)) {
                for (const net of networkInterfaces[name]) {
                    // 只获取IPv4地址，且不是内部地址
                    const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
                    if (net.family === familyV4Value && !net.internal) {
                        localIPs.push(net.address);

                        // 如果是192开头的IP，优先保存
                        if (net.address.startsWith('192.168.')) {
                            ip192 = net.address;
                        } else if (!otherIP) {
                            otherIP = net.address;
                        }
                    }
                }
            }

            // 优先返回192开头的IP，其次返回其他IP，最后返回默认值
            return ip192 || otherIP || '127.0.0.1';
        } catch (error) {
            console.error('获取本地IP地址时出错:', error);
            return '127.0.0.1';
        }
    }

    // 选择服务器
    private async selectServer(): Promise<number | undefined> {
        // 加载最新配置
        this.loadConfig();

        // 准备服务器选项，并保存原始索引
        const serverItems = this.serverConfigs.map((server, index) => ({
            label: server.name || `服务器 ${index + 1}`,
            description: `${server.ip}:${server.port}${index === this.currentServerIndex ? ' (最近使用)' : ''}`,
            originalIndex: index // 保存原始索引
        }));

        // 排序，将最近使用的服务器排在最前面
        // 检查currentServerIndex是否有效
        const isValidIndex = this.currentServerIndex >= 0 && this.currentServerIndex < this.serverConfigs.length;

        if (isValidIndex) {
            // 如果有有效的上次选择，将其排在最前面
            serverItems.sort((a, b) => {
                if (a.originalIndex === this.currentServerIndex) return -1;
                if (b.originalIndex === this.currentServerIndex) return 1;
                return 0;
            });
        } else {
            // 如果没有有效的上次选择，保持原始顺序，默认选择第一个
            // 并更新currentServerIndex为第一个服务器的索引
            if (this.serverConfigs.length > 0) {
                this.currentServerIndex = 0;
            }
        }

        // 添加新服务器选项
        const items: vscode.QuickPickItem[] = [
            ...serverItems,
            {
                label: '$(add) 添加新的服务器',
                description: '配置新的远程服务器'
            }
        ];

        // 显示选择器，默认选中第一项（最近使用的服务器）
        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: '选择远程服务器'
        });

        if (!selection) {
            return undefined; // 用户取消
        }

        // 如果选择了添加新服务器
        if (selection.label.includes('添加新的服务器')) {
            // 收集新服务器信息
            const serverName = await vscode.window.showInputBox({
                placeHolder: '服务器名称或备注',
                prompt: '请输入服务器名称或备注',
                value: ''
            });

            if (!serverName) {
                return undefined; // 用户取消
            }

            // 获取本地网络IP地址作为默认值
            const localIP = this.getLocalNetworkIP();

            const serverIp = await vscode.window.showInputBox({
                placeHolder: '服务器IP地址',
                prompt: '请输入服务器IP地址',
                value: localIP
            });

            if (!serverIp) {
                return undefined; // 用户取消
            }

            const serverPortStr = await vscode.window.showInputBox({
                placeHolder: '服务器端口',
                prompt: '请输入服务器端口',
                value: '8080'
            });

            if (!serverPortStr) {
                return undefined; // 用户取消
            }

            const serverPort = parseInt(serverPortStr, 10);
            if (isNaN(serverPort)) {
                vscode.window.showErrorMessage('端口必须是数字');
                return undefined;
            }

            const serverPassword = await vscode.window.showInputBox({
                placeHolder: '服务器密码 (可选)',
                prompt: '请输入服务器密码，如果有的话',
                value: '',
                password: true
            });

            // 创建新服务器配置
            const newServer = {
                name: serverName,
                ip: serverIp,
                port: serverPort,
                password: serverPassword || ''
            };

            // 添加到配置列表并保存
            this.serverConfigs.push(newServer);
            await vscode.workspace.getConfiguration('fountain.remote').update(
                'serverConfigs',
                this.serverConfigs,
                vscode.ConfigurationTarget.Global
            );

            // 返回新服务器的索引
            return this.serverConfigs.length - 1;
        }

        // 返回选择的服务器索引
        // 如果选择的是服务器项，则返回原始索引
        const selectedServerItem = serverItems.find(item => item.label === selection.label);
        if (selectedServerItem) {
            return selectedServerItem.originalIndex;
        }

        // 如果这里还没有返回，说明选择的不是服务器项
        return undefined;
    }

    // 连接到远程服务器
    public async connect(): Promise<boolean> {
        // 如果已经连接，则先断开
        if (this.connectionState === ConnectionState.Connected) {
            this.disconnect();
        }

        // 选择服务器
        const selectedIndex = await this.selectServer();
        if (selectedIndex === undefined) {
            return false; // 用户取消了选择
        }

        // 更新当前服务器索引并保存到配置
        this.currentServerIndex = selectedIndex;
        await vscode.workspace.getConfiguration('fountain.remote').update(
            'lastServerIndex',
            this.currentServerIndex,
            vscode.ConfigurationTarget.Global
        );

        // 更新当前服务器
        this.currentServer = this.serverConfigs[this.currentServerIndex];

        // 更新状态
        this.connectionState = ConnectionState.Connecting;
        this.updateStatusBar();

        try {
            // 创建WebSocket连接
            const wsUrl = `ws://${this.currentServer.ip}:${this.currentServer.port}`;
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
                vscode.window.showInformationMessage(`已连接到远程服务器: ${this.currentServer.name} (${this.currentServer.ip}:${this.currentServer.port})`);

                // 如果有密码，发送认证消息
                // if (this.currentServer.password) {
                this.sendMessage({
                    type: 'auth',
                    password: this.currentServer.password ?? ""
                });
                // }

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

                // 获取当前文件内容
                const currentContent = editor.document.getText();
                const remoteContent = message.content;

                // 如果内容相同，直接提示并返回
                if (currentContent === remoteContent) {
                    vscode.window.showInformationMessage('远程文件与本地文件内容相同，无需更新');
                    return;
                }

                // 创建临时文件来显示diff
                const remoteUri = editor.document.uri.with({ path: editor.document.uri.path + '.fountain_remote' });

                // 创建临时文件
                const workspaceEdit = new vscode.WorkspaceEdit();
                workspaceEdit.createFile(remoteUri, { overwrite: true });
                await vscode.workspace.applyEdit(workspaceEdit);

                // 写入远程内容
                const writeEdit = new vscode.WorkspaceEdit();
                writeEdit.insert(remoteUri, new vscode.Position(0, 0), remoteContent);
                await vscode.workspace.applyEdit(writeEdit);

                // 显示diff
                await vscode.commands.executeCommand('vscode.diff',
                    editor.document.uri,
                    remoteUri,
                    `本地 ↔ 远程 (可直接修改，然后点击标题栏中的保存按钮应用更改)`,
                    { preview: true }
                );

                // 注册一个命令来应用当前编辑器中的内容
                const applyRemoteCommand = vscode.commands.registerCommand('fountain.remote.applyRemoteContent', async () => {
                    try {
                        // 获取当前活动编辑器
                        const activeEditor = vscode.window.activeTextEditor;
                        if (!activeEditor) {
                            vscode.window.showErrorMessage('无法获取当前编辑器');
                            return;
                        }

                        // 获取当前编辑器中的内容
                        const currentContent = activeEditor.document.getText();

                        // 关闭对比视图
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

                        // 更新原文件内容
                        const edit = new vscode.WorkspaceEdit();
                        const fullRange = new vscode.Range(
                            new vscode.Position(0, 0),
                            new vscode.Position(editor.document.lineCount, 0)
                        );
                        edit.replace(editor.document.uri, fullRange, currentContent);
                        await vscode.workspace.applyEdit(edit);

                        vscode.window.showInformationMessage(`已应用更改，长度: ${currentContent.length} 字符`);
                    } catch (error) {
                        vscode.window.showErrorMessage(`应用更改时出错: ${error.message}`);
                    }
                });



                // 只显示一个简单的通知，不提供操作选择
                vscode.window.showInformationMessage(
                    `已从远程获取文件内容，长度: ${remoteContent.length} 字符。请使用标题栏中的保存按钮应用更改。`
                );

                // 监听寴比视图关闭事件，清理资源
                const disposable = vscode.workspace.onDidCloseTextDocument(closedDoc => {
                    if (closedDoc.uri.toString().includes('.fountain_remote')) {
                        // 删除临时文件
                        const deleteEdit = new vscode.WorkspaceEdit();
                        deleteEdit.deleteFile(remoteUri, { ignoreIfNotExists: true });
                        vscode.workspace.applyEdit(deleteEdit);

                        // 注销命令和监听器
                        applyRemoteCommand.dispose();
                        disposable.dispose();
                    }
                });
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


}
