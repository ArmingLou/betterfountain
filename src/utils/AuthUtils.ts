/**
 * 认证工具类，用于处理WebSocket连接的认证
 */
import * as crypto from 'crypto';
import * as vscode from 'vscode';

export class AuthUtils {

    /**
     * 获取固定的盐值，从配置中读取，如果没有配置则使用默认值
     * @returns 固定的盐值
     */
    public static getFixedSalt(): string {
        // 从配置中读取盐值
        const config = vscode.workspace.getConfiguration('fountain.remote');
        const configSalt = config.get<string>('fixedSalt');

        // 如果配置中有盐值，则使用配置中的盐值，否则使用默认值
        return configSalt || "screenwriter_fixed_salt_value_2024";
    }

    /**
     * 测试从配置中读取fixedSalt
     * 这个方法仅用于开发测试，可以在生产环境中移除
     */
    public static testFixedSalt(): void {
        const defaultSalt = "screenwriter_fixed_salt_value_2024";
        const configSalt = this.getFixedSalt();

        console.log("=== Testing Fixed Salt Configuration ===");
        console.log(`Default salt: ${defaultSalt}`);
        console.log(`Config salt: ${configSalt}`);
        console.log(`Using ${configSalt === defaultSalt ? 'default' : 'custom'} salt value`);
        console.log("=== Test Complete ===");
    }

    /**
     * 生成随机盐值
     * @returns 随机生成的盐值
     */
    public static generateSalt(): string {
        const buffer = crypto.randomBytes(16);
        return buffer.toString('base64url');
    }

    /**
     * 使用 SHA-256 哈希密码
     * @param password 密码
     * @param salt 盐值
     * @returns 哈希后的密码
     */
    public static hashPassword(password: string, salt: string): string {
        const hash = crypto.createHash('sha256');
        hash.update(password + salt);
        return hash.digest('hex');
    }

    /**
     * 生成认证令牌
     * @param password 密码
     * @param salt 盐值
     * @param timestamp 时间戳
     * @returns 生成的令牌
     */
    public static generateToken(password: string, salt: string, timestamp: number): string {
        const hash = this.hashPassword(password, salt);
        const tokenData = `${hash}:${timestamp}`;

        const tokenHash = crypto.createHash('sha256');
        tokenHash.update(tokenData);
        return tokenHash.digest('hex');
    }

    /**
     * 从错误消息中提取HTTP状态码
     * @param errorMessage 错误消息
     * @returns 提取到的HTTP状态码，如果无法提取则返回null
     */
    public static extractStatusCodeFromError(errorMessage: string): number | null {
        // 匹配 "HTTP status code: XXX" 模式
        const statusCodeRegex = /Unexpected server response: (\d+)/;
        const statusCodeMatch = errorMessage.match(statusCodeRegex);
        if (statusCodeMatch && statusCodeMatch.length >= 2) {
            try {
                const statusCode = parseInt(statusCodeMatch[1], 10);
                if (statusCode >= 100 && statusCode < 600) {
                    return statusCode;
                }
            } catch (e) {
                console.error('Error parsing status code:', e);
            }
        }

        // 尝试其他可能的模式
        const patterns = [
            // 匹配 "Status code XXX" 或 "status code XXX" 模式
            /[sS]tatus code[:]?\s+(\d+)/,
            // 匹配 "HTTP XXX" 模式，但避免匹配 URL 中的 "http://"
            /HTTP\s+(\d+)/,
            // 匹配 "code: XXX" 或 "code XXX" 模式
            /code[:]?\s+(\d+)/,
            // 匹配 "XXX Unauthorized" 或 "XXX Forbidden" 等 HTTP 状态描述
            /(\d+)\s+(Unauthorized|Forbidden|Not Found|Internal Server Error)/,
            // 匹配 "Unexpected server response: XXX" 模式
            /Unexpected server response:\s*(\d+)/,
            // 匹配 "response: XXX" 或 "response XXX" 模式
            /response[:]?\s+(\d+)/,
            // 匹配任何冒号后跟数字的模式，这是最宽松的匹配，放在最后
            /:\s*(\d{3})\b/
        ];

        // 尝试每种模式
        for (const pattern of patterns) {
            const match = errorMessage.match(pattern);
            if (match && match.length >= 2) {
                try {
                    const statusCode = parseInt(match[1], 10);
                    // 只接受有效的 HTTP 状态码（100-599）
                    if (statusCode >= 100 && statusCode < 600) {
                        return statusCode;
                    }
                } catch (e) {
                    console.error('Error parsing status code:', e);
                }
            }
        }

        // 如果错误消息包含特定的关键词，返回相应的状态码
        const lowerCaseError = errorMessage.toLowerCase();
        if (lowerCaseError.includes('unauthorized') ||
            lowerCaseError.includes('authentication failed')) {
            return 401;
        } else if (lowerCaseError.includes('forbidden') ||
                  lowerCaseError.includes('blacklist')) {
            return 403;
        } else if (lowerCaseError.includes('not found')) {
            return 404;
        } else if (lowerCaseError.includes('timeout')) {
            return 408; // Request Timeout
        }

        // 无法提取状态码
        return null;
    }
}
