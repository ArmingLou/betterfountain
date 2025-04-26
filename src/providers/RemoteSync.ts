import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import { getFountainConfig } from '../configloader';
import { getActiveFountainDocument, getEditor } from '../utils';
import * as telemetry from '../telemetry';
import { AuthUtils } from '../utils/AuthUtils';

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
        isDefault?: boolean;  // 是否为默认服务器
    }> = [{
        name: "本地服务器",
        ip: "127.0.0.1",
        port: 8080,
        password: "",
        isDefault: true  // 初始默认服务器
    }];
    private currentServerIndex: number = 0;
    private currentServer: {
        name: string;
        ip: string;
        port: number;
        password: string;
        isDefault?: boolean;
    } = {
            name: "本地服务器",
            ip: "127.0.0.1",
            port: 8080,
            password: "",
            isDefault: true
        };

    // 认证状态
    private isAuthenticated: boolean = false;

    // ping-pong机制相关属性
    private pingInterval: any = null;  // ping定时器
    private pongTimeoutId: any = null; // pong超时定时器
    private isPingPending: boolean = false;              // 是否有未响应的ping请求

    // 待执行的操作
    private pendingOperation: (() => Promise<void>) | null = null;

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

    // 获取默认服务器索引
    private getDefaultServerIndex(): number {
        // 查找标记为默认的服务器
        const defaultIndex = this.serverConfigs.findIndex(server => server.isDefault === true);

        // 如果找到默认服务器，返回其索引
        if (defaultIndex >= 0) {
            return defaultIndex;
        }

        // 如果没有默认服务器但列表不为空，将第一个设为默认并返回0
        if (this.serverConfigs.length > 0) {
            this.serverConfigs[0].isDefault = true;
            this.saveServerConfigs();
            return 0;
        }

        // 如果列表为空，返回-1
        return -1;
    }

    // 设置默认服务器
    private async setDefaultServer(index: number): Promise<boolean> {
        if (index < 0 || index >= this.serverConfigs.length) {
            return false;
        }

        // 清除所有服务器的默认标记
        for (const server of this.serverConfigs) {
            server.isDefault = false;
        }

        // 设置新的默认服务器
        this.serverConfigs[index].isDefault = true;

        // 保存配置
        await this.saveServerConfigs();

        return true;
    }

    // 保存服务器配置
    private async saveServerConfigs(): Promise<void> {
        await vscode.workspace.getConfiguration('fountain.remote').update(
            'serverConfigs',
            this.serverConfigs,
            vscode.ConfigurationTarget.Global
        );
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
                password: "",
                isDefault: true
            }];

            // 确保至少有一个默认服务器
            const defaultIndex = this.getDefaultServerIndex();

            // 加载上次使用的服务器索引，优先使用默认服务器
            let lastIndex = config.remote_last_server_index;

            // 如果有默认服务器且没有指定上次使用的服务器，使用默认服务器
            if (defaultIndex >= 0 && (lastIndex === undefined || lastIndex < 0 || lastIndex >= this.serverConfigs.length)) {
                lastIndex = defaultIndex;
            } else if (lastIndex === undefined || lastIndex < 0 || lastIndex >= this.serverConfigs.length) {
                // 如果索引无效且没有默认服务器，使用第一个服务器
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
                    password: "",
                    isDefault: true
                };
            }
        }
    }

    // 显示操作菜单
    private async showOperationMenu(): Promise<void> {
        // 根据连接状态显示不同的操作菜单
        if (this.connectionState === ConnectionState.Connected && this.isAuthenticated) {
            // 已连接且已认证状态下的操作
            await this.showConnectedMenu();
        } else {
            // 未连接状态下的操作
            await this.showDisconnectedMenu();
        }
    }

    // 显示已连接状态下的操作菜单
    private async showConnectedMenu(): Promise<void> {
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

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: `已连接到: ${this.currentServer.name} (${this.currentServer.ip}:${this.currentServer.port})`
        });

        if (!selection) {
            return;
        }

        if (selection.label.includes('获取文件')) {
            await this.fetchFromRemote();
        } else if (selection.label.includes('推送文件')) {
            await this.pushToRemote();
        } else if (selection.label.includes('断开远程连接')) {
            this.disconnect();
        }
    }

    // 显示未连接状态下的操作菜单
    private async showDisconnectedMenu(): Promise<void> {
        // 获取默认服务器信息
        const defaultIndex = this.getDefaultServerIndex();
        const defaultServer = defaultIndex >= 0 ? this.serverConfigs[defaultIndex] : null;

        // 如果没有服务器配置，提示添加服务器
        if (this.serverConfigs.length === 0) {
            vscode.window.showErrorMessage('没有可用的服务器配置，请先添加服务器');
            await this.directAddServer();
            return;
        }

        const items: vscode.QuickPickItem[] = [
            {
                label: '$(cloud-download) 从远程获取文件',
                description: '连接默认服务器并获取文件内容'
            },
            {
                label: '$(cloud-upload) 推送文件到远程',
                description: '连接默认服务器并推送文件内容'
            },
            {
                label: '$(settings-gear) 管理服务器',
                description: '管理服务器列表（添加/修改/删除/设置默认）'
            }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: defaultServer
                ? `默认服务器: ${defaultServer.name} (${defaultServer.ip}:${defaultServer.port} ${defaultServer.password ? `[${defaultServer.password}]` : '[无密码]'})`
                : '选择远程操作'
        });

        if (!selection) {
            return;
        }

        if (selection.label.includes('获取文件')) {
            // 连接默认服务器并获取文件
            await this.connectAndExecute(this.fetchFromRemote.bind(this));
        } else if (selection.label.includes('推送文件')) {
            // 连接默认服务器并推送文件
            await this.connectAndExecute(this.pushToRemote.bind(this));
        } else if (selection.label.includes('管理服务器')) {
            await this.manageServers();
        }
    }

    // 直接添加新服务器，不显示服务器列表
    private async directAddServer(): Promise<number | undefined> {
        // 加载最新配置
        this.loadConfig();

        // 收集新服务器信息
        const serverName = await vscode.window.showInputBox({
            placeHolder: '服务器名称或备注 (可选)',
            prompt: '请输入服务器名称或备注',
            value: ''
        });

        if (serverName === undefined) {
            return undefined; // 用户取消
        }

        // 获取本地网络IP地址作为默认值
        const localIP = this.getLocalNetworkIP();

        const serverIp = await vscode.window.showInputBox({
            placeHolder: '服务器IP地址',
            prompt: '请输入服务器IP地址',
            value: localIP,
            valueSelection: [localIP.length, localIP.length]
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
            password: false // 使用明文显示密码
        });

        if (serverPassword === undefined) {
            return undefined; // 用户取消
        }

        // 检查IP是否与现有服务器重复（不考虑端口）
        const duplicateIndex = this.serverConfigs.findIndex(s => s.ip === serverIp);

        if (duplicateIndex >= 0) {
            // 找到重复IP的服务器
            const duplicateServer = this.serverConfigs[duplicateIndex];

            // 询问用户是否要替换
            const answer = await vscode.window.showWarningMessage(
                `已存在IP为 ${serverIp} 的服务器: ${duplicateServer.name} (${duplicateServer.ip}:${duplicateServer.port} ${duplicateServer.password ? `[${duplicateServer.password}]` : '[无密码]'})。是否替换该服务器？`,
                { modal: true },
                '替换', '取消'
            );

            if (answer === '替换') {
                // 用户选择替换，记录是否为默认服务器
                const wasDefault = duplicateServer.isDefault;

                // 删除重复IP的服务器
                this.serverConfigs.splice(duplicateIndex, 1);

                // 创建新服务器配置，如果替换的是默认服务器，则保持默认状态
                const newServer = {
                    name: serverName,
                    ip: serverIp,
                    port: serverPort,
                    password: serverPassword || '',
                    isDefault: wasDefault || this.serverConfigs.length === 0  // 如果是默认服务器或是第一个服务器，设为默认
                };

                // 添加到配置列表并保存
                this.serverConfigs.push(newServer);
                await this.saveServerConfigs();

                // 如果删除的是当前连接的服务器，更新currentServerIndex并断开连接
                if (this.currentServerIndex === duplicateIndex) {
                    this.currentServerIndex = this.serverConfigs.length - 1;
                    if (this.connectionState === ConnectionState.Connected) {
                        vscode.window.showInformationMessage('当前连接的服务器已被替换，需要重新连接');
                        this.disconnect();
                    }
                } else if (this.currentServerIndex > duplicateIndex) {
                    // 如果删除的服务器索引小于当前连接的服务器索引，需要更新currentServerIndex
                    this.currentServerIndex--;
                }

                vscode.window.showInformationMessage(`已替换服务器: ${duplicateServer.name} (${duplicateServer.ip}:${duplicateServer.port} ${duplicateServer.password ? `[${duplicateServer.password}]` : '[无密码]'})`);
            } else {
                // 用户取消替换
                return undefined;
            }
        } else {
            // 没有重复IP，创建新服务器配置
            const isFirstServer = this.serverConfigs.length === 0;
            const newServer = {
                name: serverName,
                ip: serverIp,
                port: serverPort,
                password: serverPassword || '',
                isDefault: isFirstServer  // 如果是第一个服务器，自动设为默认
            };

            // 添加到配置列表并保存
            this.serverConfigs.push(newServer);
            await this.saveServerConfigs();
        }

        // 如果只有一个服务器，自动设为默认
        if (this.serverConfigs.length === 1) {
            await this.setDefaultServer(0);
        }

        // 返回新服务器的索引
        const newIndex = this.serverConfigs.length - 1;
        vscode.window.showInformationMessage(`已添加服务器: ${serverName} (${serverIp}:${serverPort} ${serverPassword ? `[${serverPassword}]` : '[无密码]'})`);
        return newIndex;
    }

    // 删除服务器
    private async deleteServer(index: number): Promise<boolean> {
        if (index < 0 || index >= this.serverConfigs.length) {
            return false;
        }

        const server = this.serverConfigs[index];
        const wasDefault = server.isDefault;

        // 从配置列表中删除
        this.serverConfigs.splice(index, 1);

        // 如果删除的是默认服务器，且还有其他服务器，则设置第一个为默认
        if (wasDefault && this.serverConfigs.length > 0) {
            this.serverConfigs[0].isDefault = true;
        }

        // 保存配置
        await this.saveServerConfigs();

        // 如果删除的是当前连接的服务器，则断开连接
        if (this.currentServerIndex === index && this.connectionState === ConnectionState.Connected) {
            this.disconnect();
        }

        // 更新当前服务器索引
        if (this.currentServerIndex >= this.serverConfigs.length) {
            this.currentServerIndex = this.serverConfigs.length > 0 ? 0 : -1;
        }

        return true;
    }

    // 修改服务器
    private async editServer(index: number): Promise<boolean> {
        if (index < 0 || index >= this.serverConfigs.length) {
            return false;
        }

        const server = this.serverConfigs[index];
        let wasDefault = server.isDefault;
        const originalIp = server.ip;

        // 收集修改后的服务器信息
        const serverName = await vscode.window.showInputBox({
            placeHolder: '服务器名称或备注 (可选)',
            prompt: '请输入服务器名称或备注',
            value: server.name
        });

        if (serverName === undefined) {
            return false; // 用户取消
        }

        const serverIp = await vscode.window.showInputBox({
            placeHolder: '服务器IP地址',
            prompt: '请输入服务器IP地址',
            value: server.ip
        });

        if (!serverIp) {
            return false; // 用户取消
        }

        const serverPortStr = await vscode.window.showInputBox({
            placeHolder: '服务器端口',
            prompt: '请输入服务器端口',
            value: server.port.toString()
        });

        if (!serverPortStr) {
            return false; // 用户取消
        }

        const serverPort = parseInt(serverPortStr, 10);
        if (isNaN(serverPort)) {
            vscode.window.showErrorMessage('端口必须是数字');
            return false;
        }

        const serverPassword = await vscode.window.showInputBox({
            placeHolder: '服务器密码 (可选)',
            prompt: '请输入服务器密码，如果有的话',
            value: server.password,
            password: false // 使用明文显示密码
        });

        if (serverPassword === undefined) {
            return false; // 用户取消
        }

        // 检查IP是否与其他服务器重复（不考虑端口）
        if (serverIp !== originalIp) {
            // 查找是否有相同IP的服务器（排除当前正在编辑的服务器）
            const duplicateIndex = this.serverConfigs.findIndex((s, i) => i !== index && s.ip === serverIp);

            if (duplicateIndex >= 0) {
                // 找到重复IP的服务器
                const duplicateServer = this.serverConfigs[duplicateIndex];

                // 询问用户是否要替换
                const answer = await vscode.window.showWarningMessage(
                    `已存在IP为 ${serverIp} 的服务器: ${duplicateServer.name} (${duplicateServer.ip}:${duplicateServer.port} ${duplicateServer.password ? `[${duplicateServer.password}]` : '[无密码]'})。是否替换该服务器并删除当前服务器？`,
                    { modal: true },
                    '替换', '取消'
                );

                if (answer === '替换') {
                    // 记录是否为默认服务器
                    const wasDefaultDuplicate = duplicateServer.isDefault;
                    const wasDefaultCurrent = this.serverConfigs[index].isDefault;
                    const shouldBeDefault = wasDefaultDuplicate || wasDefaultCurrent;

                    // 创建新服务器配置
                    const newServer = {
                        name: serverName,
                        ip: serverIp,
                        port: serverPort,
                        password: serverPassword || '',
                        isDefault: shouldBeDefault
                    };

                    // 确定要删除的索引（当前服务器和重复IP的服务器）
                    const indicesToRemove = [index, duplicateIndex].sort((a, b) => b - a); // 从大到小排序，避免删除影响索引

                    // 删除服务器
                    for (const idxToRemove of indicesToRemove) {
                        // 如果删除的是当前连接的服务器，断开连接
                        if (this.currentServerIndex === idxToRemove && this.connectionState === ConnectionState.Connected) {
                            vscode.window.showInformationMessage('当前连接的服务器已被替换，需要重新连接');
                            this.disconnect();
                        }

                        // 更新currentServerIndex
                        if (this.currentServerIndex === idxToRemove) {
                            // 将在添加新服务器后更新
                            this.currentServerIndex = -1;
                        } else if (this.currentServerIndex > idxToRemove) {
                            // 如果删除的服务器索引小于当前连接的服务器索引，需要更新currentServerIndex
                            this.currentServerIndex--;
                        }

                        // 删除服务器
                        this.serverConfigs.splice(idxToRemove, 1);
                    }

                    // 添加新服务器
                    this.serverConfigs.push(newServer);

                    // 更新currentServerIndex（如果之前连接的是被删除的服务器）
                    if (this.currentServerIndex === -1) {
                        this.currentServerIndex = this.serverConfigs.length - 1;
                    }

                    // 保存配置
                    await this.saveServerConfigs();

                    vscode.window.showInformationMessage(`已替换服务器，新服务器: ${serverName} (${serverIp}:${serverPort} ${serverPassword ? `[${serverPassword}]` : '[无密码]'})`);

                    // 直接返回成功，因为已经完成了所有操作
                    return true;
                } else {
                    // 用户取消替换
                    return false;
                }
            }
        }

        // 更新服务器配置（只有在没有IP冲突或没有修改IP的情况下才会执行到这里）
        this.serverConfigs[index] = {
            name: serverName,
            ip: serverIp,
            port: serverPort,
            password: serverPassword || '',
            isDefault: wasDefault
        };

        // 保存配置
        await this.saveServerConfigs();

        // 如果修改的是当前连接的服务器，则断开连接
        if (this.currentServerIndex === index && this.connectionState === ConnectionState.Connected) {
            vscode.window.showInformationMessage('服务器配置已更改，需要重新连接');
            this.disconnect();
        }

        return true;
    }

    // 管理服务器列表
    private async manageServers(): Promise<void> {
        if (this.serverConfigs.length === 0) {
            vscode.window.showErrorMessage('没有可用的服务器配置，请先添加服务器');
            await this.directAddServer();
            return;
        }

        // 准备服务器选项
        const serverItems = this.serverConfigs.map((server, index) => ({
            label: server.name || `服务器 ${index + 1}`,
            description: `${server.ip}:${server.port} ${server.password ? `[${server.password}]` : '[无密码]'}${server.isDefault ? ' (默认)' : ''}`,
            index: index
        }));

        // 添加操作选项
        const items = [
            ...serverItems,
            { label: '$(add) 添加新的服务器', description: '配置新的远程服务器', index: -1 }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要管理的服务器'
        });

        if (!selection) {
            return;
        }

        // 如果选择了添加新服务器
        if (selection.index === -1) {
            await this.directAddServer();
            return;
        }

        // 显示服务器操作菜单
        const serverIndex = selection.index;
        const server = this.serverConfigs[serverIndex];
        const isDefault = server.isDefault;

        const actions = [
            { label: '$(edit) 修改服务器', description: '修改服务器配置' },
            { label: '$(trash) 删除服务器', description: '从列表中删除服务器' }
        ];

        // 如果不是默认服务器，添加设为默认选项
        if (!isDefault) {
            actions.unshift({ label: '$(star) 设为默认服务器', description: '将此服务器设为默认' });
        }

        const actionSelection = await vscode.window.showQuickPick(actions, {
            placeHolder: `选择对 ${server.name} (${server.ip}:${server.port} ${server.password ? `[${server.password}]` : '[无密码]'}) 的操作`
        });

        if (!actionSelection) {
            return;
        }

        if (actionSelection.label.includes('设为默认')) {
            await this.setDefaultServer(serverIndex);
            vscode.window.showInformationMessage(`已将 ${server.name} 设为默认服务器`);
        } else if (actionSelection.label.includes('修改')) {
            const success = await this.editServer(serverIndex);
            if (success) {
                vscode.window.showInformationMessage(`已修改服务器 ${server.name}`);
            }
        } else if (actionSelection.label.includes('删除')) {
            // 确认删除
            const confirm = await vscode.window.showWarningMessage(
                `确定要删除服务器 ${server.name} (${server.ip}:${server.port} ${server.password ? `[${server.password}]` : '[无密码]'}) 吗？`,
                { modal: true },
                '确定删除'
            );

            if (confirm === '确定删除') {
                const success = await this.deleteServer(serverIndex);
                if (success) {
                    vscode.window.showInformationMessage(`已删除服务器 ${server.name}`);
                }
            }
        }
    }

    // 连接默认服务器并执行操作
    private async connectAndExecute(operation: () => Promise<void>): Promise<void> {
        // 如果已经连接并认证成功，直接执行操作
        if (this.connectionState === ConnectionState.Connected && this.isAuthenticated) {
            await operation();
            return;
        }

        // 获取默认服务器索引
        const defaultIndex = this.getDefaultServerIndex();

        if (defaultIndex < 0) {
            vscode.window.showErrorMessage('没有默认服务器，请先设置默认服务器');
            return;
        }

        // 如果已连接但未认证，或者连接到的不是默认服务器
        if (this.connectionState === ConnectionState.Connected) {
            // 如果未认证，等待认证完成
            if (!this.isAuthenticated) {
                // 保存待执行的操作
                this.pendingOperation = operation;
                vscode.window.showInformationMessage('正在等待认证完成，认证成功后将自动执行操作');
                return;
            }

            // 如果连接的不是默认服务器，询问用户是否要断开当前连接并连接到默认服务器
            if (this.currentServerIndex !== defaultIndex) {
                const answer = await vscode.window.showWarningMessage(
                    `当前已连接到 ${this.currentServer.name}，但默认服务器是 ${this.serverConfigs[defaultIndex].name}。是否断开当前连接并连接到默认服务器？`,
                    { modal: true },
                    '是', '否'
                );

                if (answer !== '是') {
                    // 用户选择不断开，直接在当前连接上执行操作
                    await operation();
                    return;
                }

                // 用户选择断开，继续执行下面的连接逻辑
                this.disconnect();
            }
        }

        // 保存待执行的操作
        this.pendingOperation = operation;

        // 连接到默认服务器
        this.currentServerIndex = defaultIndex;
        this.currentServer = this.serverConfigs[defaultIndex];

        // 尝试连接
        const connected = await this.connect(true);

        if (!connected) {
            this.pendingOperation = null;
            vscode.window.showErrorMessage('连接默认服务器失败，无法执行操作');
        }
    }

    // 更新状态栏和上下文变量
    private updateStatusBar(): void {
        // 设置上下文变量，控制UI显示
        const isConnected = this.connectionState === ConnectionState.Connected && this.isAuthenticated;
        vscode.commands.executeCommand('setContext', 'fountain.remote.isConnected', isConnected);

        // 获取默认服务器信息
        const defaultIndex = this.getDefaultServerIndex();
        const defaultServer = defaultIndex >= 0 ? this.serverConfigs[defaultIndex] : null;
        const defaultServerInfo = defaultServer
            ? `默认服务器: ${defaultServer.name} (${defaultServer.ip}:${defaultServer.port} ${defaultServer.password ? `[${defaultServer.password}]` : '[无密码]'})`
            : '未设置默认服务器';

        switch (this.connectionState) {
            case ConnectionState.Disconnected:
                this.statusBarItem.text = '$(plug) 远程: 未连接';
                this.statusBarItem.tooltip = `${defaultServerInfo} (点击显示操作菜单)`;
                this.statusBarItem.command = 'fountain.remote.showMenu';
                break;
            case ConnectionState.Connecting:
                this.statusBarItem.text = '$(sync~spin) 远程: 连接中...';
                this.statusBarItem.tooltip = '正在连接到远程服务器';
                this.statusBarItem.command = undefined;
                break;
            case ConnectionState.Connected:
                if (this.isAuthenticated) {
                    this.statusBarItem.text = '$(check) 远程: 已连接';
                    this.statusBarItem.tooltip = `已连接到 ${this.currentServer.name} (${this.currentServer.ip}:${this.currentServer.port}) (点击显示操作菜单)`;
                } else {
                    this.statusBarItem.text = '$(warning) 远程: 未认证';
                    this.statusBarItem.tooltip = `已连接到 ${this.currentServer.name} (${this.currentServer.ip}:${this.currentServer.port} ${this.currentServer.password ? `[${this.currentServer.password}]` : '[无密码]'})，但未认证成功 (点击显示操作菜单)`;
                }
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
                        if (net.address.startsWith('192.')) {
                            ip192 = net.address.split('.').slice(0, 3).join('.')+'.';
                        } else if (!otherIP) {
                            otherIP = net.address.split('.').slice(0, 3).join('.')+'.';
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
            description: `${server.ip}:${server.port} ${server.password ? `[${server.password}]` : '[无密码]'}${index === this.currentServerIndex ? ' (最近使用)' : ''}`,
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
            // 使用直接添加服务器的方法
            return await this.directAddServer();
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
    public async connect(skipServerSelection: boolean = false): Promise<boolean> {
        // 如果已经连接，提示用户并返回，不断开现有连接
        if (this.connectionState === ConnectionState.Connected) {
            if (this.isAuthenticated) {
                vscode.window.showInformationMessage(`已连接到远程服务器: ${this.currentServer.name} (${this.currentServer.ip}:${this.currentServer.port})`);
                return true;
            } else {
                vscode.window.showInformationMessage(`已连接到远程服务器，但尚未认证成功，请等待认证完成`);
                return false;
            }
        }

        // 重置认证状态
        this.isAuthenticated = false;

        // 如果不跳过服务器选择，则让用户选择服务器
        if (!skipServerSelection) {
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
        }

        // 更新状态
        this.connectionState = ConnectionState.Connecting;
        this.updateStatusBar();

        try {
            // 创建WebSocket连接
            const wsUrl = `ws://${this.currentServer.ip}:${this.currentServer.port}`;

            // 准备连接选项
            let options: WebSocket.ClientOptions = {};

            // 如果需要密码，准备认证头部
            if (this.currentServer.password && this.currentServer.password.length > 0) {
                // 生成时间戳
                const timestamp = Date.now();

                // 生成令牌
                const token = AuthUtils.generateToken(
                    this.currentServer.password,
                    AuthUtils.getFixedSalt(),
                    timestamp
                );

                // 设置认证头部
                options.headers = {
                    'Authorization': `Bearer ${token}`,
                    'X-Auth-Timestamp': timestamp.toString()
                };

                console.log('已添加认证头部');
            }

            // 创建WebSocket连接
            this.ws = new WebSocket(wsUrl, options);

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
                // 在新的认证流程中，连接成功即认证成功
                this.isAuthenticated = true;
                this.updateStatusBar();
                vscode.window.showInformationMessage(`已连接到远程服务器: ${this.currentServer.name} (${this.currentServer.ip}:${this.currentServer.port})`);

                // 启动ping定时器
                this.startPingInterval();

                // 如果有待执行的操作，执行它
                if (this.pendingOperation) {
                    const operation = this.pendingOperation;
                    this.pendingOperation = null;
                    setTimeout(() => {
                        operation();
                    }, 100); // 稍微延迟执行，确保连接完全建立
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

                // 尝试从错误消息中提取HTTP状态码
                const errorMessage = error.message;
                const statusCode = AuthUtils.extractStatusCodeFromError(errorMessage);

                if (statusCode === 401) {
                    vscode.window.showErrorMessage(`连接失败: 授权失败`);
                } else if (statusCode === 403) {
                    vscode.window.showErrorMessage(`连接失败: 您已被加入黑名单`);
                } else if (statusCode) {
                    vscode.window.showErrorMessage(`连接失败: HTTP ${statusCode}`);
                } else {
                    vscode.window.showErrorMessage(`连接远程服务器时出错: ${error.message}`);
                }

                this.ws = null;
                return false;
            });

            // 处理关闭事件
            this.ws.on('close', () => {
                clearTimeout(connectTimeout);
                // 停止ping定时器
                this.stopPingInterval();

                // 重置认证状态
                this.isAuthenticated = false;

                // 清除待执行的操作
                this.pendingOperation = null;

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
        // 停止ping定时器
        this.stopPingInterval();

        // 重置认证状态
        this.isAuthenticated = false;

        // 清除待执行的操作
        this.pendingOperation = null;

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
        // 检查连接状态和认证状态
        if (this.connectionState !== ConnectionState.Connected || !this.isAuthenticated) {
            vscode.window.showErrorMessage('未连接到远程服务器或未认证成功，无法获取文件');
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
        // 检查连接状态和认证状态
        if (this.connectionState !== ConnectionState.Connected || !this.isAuthenticated) {
            vscode.window.showErrorMessage('未连接到远程服务器或未认证成功，无法推送文件');
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

    // 启动ping定时器
    private startPingInterval(): void {
        // 先清除可能存在的定时器
        this.stopPingInterval();

        // 每30秒发送一次ping
        this.pingInterval = setInterval(() => {
            this.sendPingRequest();
        }, 30000); // 30秒

        console.log('已启动ping定时器');
    }

    // 停止ping定时器
    private stopPingInterval(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
            console.log('已停止ping定时器');
        }

        // 同时清除pong超时定时器
        this.clearPongTimeout();
    }

    // 清除pong超时定时器
    private clearPongTimeout(): void {
        if (this.pongTimeoutId) {
            clearTimeout(this.pongTimeoutId);
            this.pongTimeoutId = null;
        }
        this.isPingPending = false;
    }

    // 发送ping请求
    private sendPingRequest(): void {
        if (!this.ws || this.connectionState !== ConnectionState.Connected) {
            console.log('无法发送ping请求: WebSocket连接为空或未连接');
            return;
        }

        // 如果已经有一个未响应的ping，不再发送新的ping
        if (this.isPingPending) {
            console.log('已有未响应的ping请求，不再发送新的ping');
            return;
        }

        const timestamp = Date.now();
        this.sendMessage({
            type: 'ping',
            timestamp: timestamp
        });

        console.log(`已发送ping请求，时间戳: ${timestamp}`);
        this.isPingPending = true;

        // 设置28秒超时，如果没有收到pong响应，则认为连接已断开
        this.pongTimeoutId = setTimeout(() => {
            if (this.isPingPending) {
                console.log('ping请求超时，未收到pong响应，连接可能已断开');
                this.handleConnectionLost();
            }
        }, 28000); // 28秒
    }

    // 处理连接丢失
    private handleConnectionLost(): void {
        if (this.connectionState === ConnectionState.Connected) {
            this.connectionState = ConnectionState.Disconnected;
            // 重置认证状态
            this.isAuthenticated = false;
            this.updateStatusBar();
            this.stopPingInterval();

            // 清除待执行的操作
            this.pendingOperation = null;

            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }

            vscode.window.showErrorMessage('与远程服务器的连接已断开（ping超时）');
        }
    }

    // 发送pong响应
    private sendPongResponse(timestamp: number): void {
        if (!this.ws || this.connectionState !== ConnectionState.Connected) {
            console.log('无法发送pong响应: WebSocket连接为空或未连接');
            return;
        }

        this.sendMessage({
            type: 'pong',
            timestamp: timestamp
        });

        console.log(`已发送pong响应，时间戳: ${timestamp}`);
    }

    // 处理接收到的消息
    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            // 移除旧的auth_response处理，因为现在认证在连接建立时通过header完成
            // 保留此注释作为提醒

            case 'ping':
                // 处理ping消息，立即回复pong消息
                const timestamp = message.timestamp || Date.now();
                this.sendPongResponse(timestamp);
                console.log(`收到ping消息，已回复pong响应，时间戳: ${timestamp}`);
                break;

            case 'pong':
                // 处理pong响应，清除超时定时器
                console.log(`收到pong响应，时间戳: ${message.timestamp}`);
                this.clearPongTimeout();
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
                // await instance.fetchFromRemote();
                if (instance.connectionState === ConnectionState.Connected && instance.isAuthenticated) {
                    await instance.fetchFromRemote();
                } else {
                    await instance.connectAndExecute(instance.fetchFromRemote.bind(instance))
                }
            })
        );

        // 注册推送文件命令
        context.subscriptions.push(
            vscode.commands.registerCommand('fountain.remote.push', async () => {
                // await instance.pushToRemote();
                if (instance.connectionState === ConnectionState.Connected && instance.isAuthenticated) {
                    await instance.pushToRemote();
                } else {
                    await instance.connectAndExecute(instance.pushToRemote.bind(instance))
                }
            })
        );
    }


}
