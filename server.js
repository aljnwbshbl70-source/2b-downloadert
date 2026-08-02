const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const { join } = require('path');
const { existsSync, chmodSync } = require('fs');
const os = require('os');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let ytDlpPath = null;

function getPlatform() {
    const arch = os.arch();
    const platform = os.platform();
    const archMap = {
        'x64': 'amd64', 'x86_64': 'amd64', 'amd64': 'amd64',
        'arm64': 'arm64', 'aarch64': 'arm64',
        'armv7l': 'armv7l', 'armv6l': 'armv6l',
        'i386': 'i386', 'i686': 'i386', 'x86': 'i386'
    };
    return {
        arch: archMap[arch] || 'amd64',
        platform: platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux'
    };
}

async function getOrInstallYTDLP() {
    if (ytDlpPath && existsSync(ytDlpPath)) return ytDlpPath;
    const { arch, platform } = getPlatform();
    const binName = platform === 'windows' ? 'yt-dlp.exe' : 'yt-dlp';
    const outputPath = join(process.cwd(), binName);

    if (existsSync(outputPath)) {
        try {
            await execAsync(`"${outputPath}" --version`, { timeout: 5000 });
            ytDlpPath = outputPath;
            return outputPath;
        } catch {}
    }

    const urls = {
        linux: {
            amd64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
            arm64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64',
            armv7l: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_armv7l'
        },
        macos: { default: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos' },
        windows: { default: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' }
    };
    const url = urls[platform]?.[arch] || urls[platform]?.default || `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${binName}`;

    try {
        await execAsync(`curl -L -o "${outputPath}" "${url}"`, { timeout: 120000 });
        if (platform !== 'windows') chmodSync(outputPath, 0o755);
        ytDlpPath = outputPath;
        return outputPath;
    } catch (e) {
        throw new Error('فشل تحميل مكتبة yt-dlp: ' + e.message);
    }
}

// TikTok Downloader API
async function fetchTikTok(url) {
    let params = new URLSearchParams();
    params.append("url", url);
    let { data } = await axios.post("https://tikwm.com/api/", params, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Cookie: "current_language=en",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36"
        },
    });
    if (!data || data.code !== 0) throw new Error("تعذر استخراج فيديو TikTok");
    return {
        type: 'tiktok',
        title: data.data.title || 'فيديو TikTok',
        video: data.data.hdplay || data.data.play,
        audio: data.data.music,
        author: data.data.author?.nickname || 'مستخدم TikTok',
        cover: data.data.cover
    };
}

// Instagram Downloader API
async function fetchInstagram(url) {
    const bin = await getOrInstallYTDLP();
    const cmd = `"${bin}" "${url}" --dump-json --no-playlist --no-warnings`;
    const { stdout } = await execAsync(cmd, { timeout: 30000 });
    const data = JSON.parse(stdout);

    return {
        type: 'instagram',
        title: data.title || data.description || 'فيديو Instagram',
        video: data.url,
        cover: data.thumbnail,
        author: data.uploader || 'Instagram User'
    };
}

// Express API Router
app.post('/api/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'يرجى تزويد رابط صحيح' });

    try {
        if (/tiktok|douyin|vm\.tiktok|vt\.tiktok/i.test(url)) {
            const data = await fetchTikTok(url);
            return res.json({ success: true, data });
        } else if (/instagram\.com|instagr\.am/i.test(url)) {
            const data = await fetchInstagram(url);
            return res.json({ success: true, data });
        } else {
            return res.status(400).json({ error: 'الرابط غير مدعوم، يرجى تزويد رابط TikTok أو Instagram' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message || 'حدث خطأ أثناء معالجة الفيديو' });
    }
});

app.listen(PORT, () => console.log(`YoRHa 2B Downloader Server running on http://localhost:${PORT}`));
