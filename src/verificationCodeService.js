const puppeteer = require('puppeteer');

class VerificationCodeService {
    /**
     * 从邮箱收件箱获取验证码
     * @param {string} mailInboxUrl - 邮箱收件箱 URL
     * @param {number} maxRetries - 最大重试次数
     * @param {number} retryInterval - 重试间隔（毫秒）
     * @returns {Promise<string>} - 验证码
     */
    async getVerificationCode(mailInboxUrl, maxRetries = 20, retryInterval = 3000) {
        console.log('[验证码服务] 开始获取验证码...');
        console.log(`[验证码服务] 邮箱 URL: ${mailInboxUrl.substring(0, 50)}...`);
        
        const browser = await puppeteer.launch({ headless: true });
        
        try {
            const page = await browser.newPage();
            
            for (let i = 0; i < maxRetries; i++) {
                console.log(`[验证码服务] 尝试 ${i + 1}/${maxRetries}...`);
                
                await page.goto(mailInboxUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                
                // 等待邮件列表加载
                await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});
                
                // 提取页面文本内容
                const bodyText = await page.evaluate(() => document.body.innerText);
                
                // 匹配 6 位数字验证码
                const codeMatch = bodyText.match(/\b(\d{6})\b/);
                
                if (codeMatch) {
                    const code = codeMatch[1];
                    console.log(`[验证码服务] ✓ 成功获取验证码: ${code}`);
                    return code;
                }
                
                console.log(`[验证码服务] 未找到验证码，${retryInterval / 1000} 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryInterval));
            }
            
            throw new Error('获取验证码超时');
            
        } finally {
            await browser.close();
        }
    }
}

module.exports = { VerificationCodeService };
