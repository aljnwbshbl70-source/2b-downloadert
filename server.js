const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/download', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رابط الفيديو' });
    }

    try {
        // 1. إذا كان الرابط لتيك توك (شغال 100%)
        if (url.includes('tiktok.com')) {
            const apiRes = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({
                url: url,
                hd: 1
            }));

            if (apiRes.data && apiRes.data.code === 0) {
                const data = apiRes.data.data;
                return res.json({
                    success: true,
                    data: {
                        title: data.title || 'فيديو TikTok',
                        cover: data.cover,
                        author: data.author.unique_id || 'TikTok User',
                        video: data.play || data.wmplay,
                        audio: data.music
                    }
                });
            } else {
                throw new Error('تعذر جلب فيديو تيك توك، تأكد من الرابط.');
            }
        } 
        // 2. إذا كان الرابط لإنستغرام (Reels / Posts)
        else if (url.includes('instagram.com')) {
            const apiRes = await axios.get(`https://api.vkrdown.com/insta/?url=${encodeURIComponent(url)}`).catch(() => null);

            if (apiRes && apiRes.data && apiRes.data.data) {
                const instaData = apiRes.data.data;
                const mediaUrl = Array.isArray(instaData) ? instaData[0].url : (instaData.url || instaData.video_url);

                if (mediaUrl) {
                    return res.json({
                        success: true,
                        data: {
                            title: 'فيديو إنستغرام',
                            cover: instaData.thumbnail || '',
                            author: 'Instagram User',
                            video: mediaUrl,
                            audio: null
                        }
                    });
                }
            }
            
            // محاولة احتياطية ثانية للإنستغرام في حال تعثرت الأولى
            const backupRes = await axios.get(`https://v3.fastdl.app/api/convert`, {
                params: { url: url }
            }).catch(() => null);

            if (backupRes && backupRes.data && backupRes.data.url) {
                return res.json({
                    success: true,
                    data: {
                        title: 'فيديو إنستغرام',
                        cover: '',
                        author: 'Instagram User',
                        video: backupRes.data.url[0].url || backupRes.data.url,
                        audio: null
                    }
                });
            }

            throw new Error('فشل استخراج فيديو إنستغرام، تأكد أن الحساب عام (Public).');
        } else {
            throw new Error('الرابط يدعم حالياً التيك توك والإنستغرام فقط.');
        }

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'حدث خطأ أثناء جلب الفيديو'
        });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
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
