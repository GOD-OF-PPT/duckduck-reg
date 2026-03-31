const path = require('path');
const fs = require('fs');
const { DDGEmailProvider } = require('./src/ddgProvider');
const { BrowserbaseService } = require('./src/browserbaseService');
const { OAuthService } = require('./src/oauthService');
const { VerificationCodeService } = require('./src/verificationCodeService');
const { generateRandomName, generateRandomPassword } = require('./src/randomIdentity');
const config = require('./src/config');

// 目标生成数量
const TARGET_COUNT = parseInt(process.argv[2], 10) || 1;

/**
 * 生成随机用户数据
 */
function generateUserData() {
    const fullName = generateRandomName();
    const password = generateRandomPassword();
    
    // 生成出生日期 (25-40岁)
    const age = 25 + Math.floor(Math.random() * 16);
    const birthYear = new Date().getFullYear() - age;
    const birthMonth = 1 + Math.floor(Math.random() * 12);
    const birthDay = 1 + Math.floor(Math.random() * 28);
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
    
    return {
        fullName,
        password,
        age,
        birthDate,
        birthMonth,
        birthDay,
        birthYear
    };
}

/**
 * 第一阶段：ChatGPT 注册（简化为两步）
 */
async function phase1(emailProvider, browserbase, userData) {
    console.log('\n=========================================');
    console.log('[阶段1] 开始 ChatGPT 注册流程');
    console.log('=========================================');
    
    const verificationService = new VerificationCodeService();
    
    // 步骤 1.1: 注册并发送验证码
    console.log('\n[阶段1.1] 填写注册信息并发送验证码...');
    const session1 = await browserbase.createSession();
    
    const goal1 = `打开 https://chatgpt.com 并点击注册，使用邮箱 ${emailProvider.getEmail()} 和密码 ${userData.password} 填写表单，点击继续发送验证码。看到"输入验证码"提示后，导航到 data:text/html,<html><head><title>CODE_SENT</title></head></html>`;
    
    console.log(`[阶段1.1] Goal: ${goal1}`);
    
    browserbase.sendAgentGoal(goal1).catch(e => {
        console.error(`[阶段1.1] Agent 异常: ${e.message}`);
    });
    
    await browserbase.connectToCDP(session1.wsUrl, {
        targetKeyword: 'CODE_SENT',
        onUrlChange: (url) => console.log(`[阶段1.1] ${url}`),
        onTargetReached: (url) => {
            console.log('[阶段1.1] ✓ 验证码已发送');
            return url;
        },
        timeout: 300000
    });
    
    browserbase.disconnect();
    
    // 步骤 1.2: 获取验证码
    console.log('\n[阶段1.2] 获取验证码...');
    const code = await verificationService.getVerificationCode(config.mailInboxUrl);
    console.log(`[阶段1.2] ✓ 验证码: ${code}`);
    
    // 步骤 1.3: 完成注册（复用 session1）
    console.log('\n[阶段1.3] 完成注册...');
    const session2 = await browserbase.createSession();
    
    const goal2 = `打开 https://chatgpt.com，用 ${emailProvider.getEmail()} 和 ${userData.password} 登录，填写验证码 ${code}，然后填写姓名 ${userData.fullName} 和出生日期 ${userData.birthDate}（年龄填 ${userData.age}），完成注册。成功后导航到 data:text/html,<html><head><title>DONE</title></head></html>`;
    
    console.log(`[阶段1.3] Goal: ${goal2}`);
    
    browserbase.sendAgentGoal(goal2).catch(e => {
        console.error(`[阶段1.3] Agent 异常: ${e.message}`);
    });
    
    await browserbase.connectToCDP(session2.wsUrl, {
        targetKeyword: 'DONE',
        onUrlChange: (url) => console.log(`[阶段1.3] ${url}`),
        onTargetReached: (url) => {
            console.log('[阶段1.3] ✓ 注册完成');
            return url;
        },
        timeout: 300000
    });
    
    browserbase.disconnect();
    console.log('[阶段1] ✓ 注册流程完成');
    
    // 返回成功标志
    return true;
}

/**
 * 第二阶段：Codex OAuth 授权（回退到包含登录的完整流程）
 */
async function phase2(emailProvider, browserbase, oauthService, userData) {
    console.log('\n=========================================');
    console.log('[阶段2] 开始 Codex OAuth 授权流程');
    console.log('=========================================');
    
    const verificationService = new VerificationCodeService();
    
    // 重新生成 PKCE 参数
    oauthService.regeneratePKCE();
    const authUrl = oauthService.getAuthUrl();
    console.log(`[阶段2] OAuth URL: ${authUrl.substring(0, 80)}...`);
    
    // 步骤 2.1: 登录并发送验证码
    console.log('\n[阶段2.1] 登录并发送验证码...');
    const session1 = await browserbase.createSession();
    
    const goal1 = `导航到 ${authUrl}，填写邮箱 ${emailProvider.getEmail()}，点击继续，填写密码 ${userData.password}，点击继续发送验证码。看到"输入验证码"后，导航到 data:text/html,<html><head><title>OAUTH_CODE_SENT</title></head></html>`;
    
    console.log(`[阶段2.1] 开始...`);
    
    browserbase.sendAgentGoal(goal1).catch(e => {
        console.error(`[阶段2.1] Agent 异常: ${e.message}`);
    });
    
    await browserbase.connectToCDP(session1.wsUrl, {
        targetKeyword: 'OAUTH_CODE_SENT',
        onUrlChange: (url) => {
            console.log(`[阶段2.1] ${url}`);
            if (url.includes('/log-in/password')) {
                console.log('[阶段2.1] → 密码页面');
            }
        },
        onTargetReached: (url) => {
            console.log('[阶段2.1] ✓ 验证码已发送');
            return url;
        },
        timeout: 180000 // 3分钟
    });
    
    browserbase.disconnect();
    
    // 步骤 2.2: 获取验证码
    console.log('\n[阶段2.2] 获取验证码...');
    const code = await verificationService.getVerificationCode(config.mailInboxUrl, 15, 4000);
    console.log(`[阶段2.2] ✓ 验证码: ${code}`);
    
    // 步骤 2.3: 填写验证码并授权
    console.log('\n[阶段2.3] 填写验证码并授权...');
    const session2 = await browserbase.createSession();
    
    const goal2 = `导航到 ${authUrl}，填写邮箱 ${emailProvider.getEmail()}，密码 ${userData.password}，验证码 ${code}，然后点击"允许"或"授权"按钮。等待跳转到 localhost 回调地址。`;
    
    console.log(`[阶段2.3] 开始...`);
    
    browserbase.sendAgentGoal(goal2).catch(e => {
        console.error(`[阶段2.3] Agent 异常: ${e.message}`);
    });
    
    const callbackUrl = await browserbase.connectToCDP(session2.wsUrl, {
        targetKeyword: 'localhost',
        onUrlChange: (url) => {
            console.log(`[阶段2.3] ${url}`);
        },
        onTargetReached: (url) => {
            console.log('[阶段2.3] ✓ 检测到 localhost 回调');
            return url;
        },
        timeout: 180000 // 3分钟
    });
    
    console.log(`[阶段2] 回调 URL: ${callbackUrl}`);
    
    // 提取授权参数
    const params = oauthService.extractCallbackParams(callbackUrl);
    if (!params || params.error) {
        throw new Error(`OAuth 授权失败: ${params?.error_description || params?.error || '未知错误'}`);
    }
    
    if (!params.code) {
        throw new Error('回调 URL 中未找到授权码');
    }
    
    console.log(`[阶段2] ✓ 授权码: ${params.code.substring(0, 10)}...`);
    
    // 用授权码换取 Token
    const tokenData = await oauthService.exchangeTokenAndSave(params.code, emailProvider.getEmail());
    
    browserbase.disconnect();
    console.log('[阶段2] ✓ OAuth 授权流程完成');
    
    return tokenData;
}

/**
 * 单次注册流程
 */
async function runSingleRegistration() {
    console.log('\n=========================================');
    console.log('[主程序] 开始一次全新的注册与授权流程');
    console.log('=========================================');
    
    const emailProvider = new DDGEmailProvider();
    const browserbase = new BrowserbaseService();
    const oauthService = new OAuthService();
    
    try {
        // 0. 生成用户数据
        const userData = generateUserData();
        console.log(`[主程序] 用户数据已生成:`);
        console.log(`  - 姓名: ${userData.fullName}`);
        console.log(`  - 年龄: ${userData.age}`);
        console.log(`  - 出生日期: ${userData.birthDate}`);
        
        // 1. 生成邮箱别名
        await emailProvider.generateAlias();
        
        // 2. 第一阶段：ChatGPT 注册
        await phase1(emailProvider, browserbase, userData);
        
        // 3. 第二阶段：Codex OAuth 授权
        const tokenData = await phase2(emailProvider, browserbase, oauthService, userData);
        
        console.log('[主程序] 本次注册流程圆满结束！');
        console.log(`[主程序] Token 已保存，邮箱: ${tokenData.email}`);
        
        return true;
        
    } catch (error) {
        console.error('[主程序] 本次任务执行失败:', error.message);
        throw error;
    } finally {
        browserbase.disconnect();
    }
}

/**
 * 检查 token 数量
 */
async function checkTokenCount() {
    const outputDir = path.join(process.cwd(), 'tokens');
    if (!fs.existsSync(outputDir)) {
        return 0;
    }
    const files = fs.readdirSync(outputDir).filter(f => f.startsWith('token_') && f.endsWith('.json'));
    return files.length;
}

/**
 * 归档已有 tokens
 */
function archiveExistingTokens() {
    const outputDir = path.join(process.cwd(), 'tokens');
    if (!fs.existsSync(outputDir)) return;
    
    const files = fs.readdirSync(outputDir).filter(f => f.startsWith('token_') && f.endsWith('.json'));
    for (const file of files) {
        const oldPath = path.join(outputDir, file);
        const newPath = path.join(outputDir, `old_${file}`);
        fs.renameSync(oldPath, newPath);
        console.log(`[归档] ${file} → old_${file}`);
    }
}

/**
 * 启动批量注册
 */
async function startBatch() {
    console.log(`[启动] 开始执行 Codex 远程注册机，目标生成数量: ${TARGET_COUNT}`);
    
    // 检查配置
    if (!config.ddgToken) {
        console.error('[错误] 未配置 ddgToken，请检查 config.json 文件');
        process.exit(1);
    }
    if (!config.mailInboxUrl) {
        console.error('[错误] 未配置 mailInboxUrl，请检查 config.json 文件');
        process.exit(1);
    }
    
    // 归档已有的 token 文件
    archiveExistingTokens();
    
    while (true) {
        const currentCount = await checkTokenCount();
        if (currentCount >= TARGET_COUNT) {
            console.log(`\n[完成] 当前 Token 文件数量 (${currentCount}) 已达到目标 (${TARGET_COUNT})。程序退出。`);
            break;
        }
        
        console.log(`\n[进度] 目前 Token 数量 ${currentCount} / 目标 ${TARGET_COUNT}`);
        
        try {
            await runSingleRegistration();
        } catch (error) {
            console.error('[主程序] 注册失败，准备重试...');
        }
    }
}

startBatch().catch(console.error);
